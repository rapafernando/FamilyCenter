import { z } from 'zod';
import { ApiError, type List, type ListItem, type MealEntry, type Recipe, type Reward, type StarEntry, type Task, type TaskForDay } from '@/lib/types';
import { taskOccursOn } from '@/lib/recurrence';
import { def, tenant, zDate, zHex, zId, zStr } from '../rpc';
import { clean } from './core';

/* ---------------------------------------------------------------- tasks */
type TRow = { id: string; group_id: string; profile_id: string; kind: 'chore' | 'routine'; title: string; emoji: string | null; time_of_day: Task['timeOfDay']; due_time: string | null; starts_on: string; ends_on: string | null; rrule: string | null; star_value: number; active: boolean; sort_order: number };
const TCOLS = "id, group_id, profile_id, kind, title, emoji, time_of_day, to_char(due_time, 'HH24:MI') as due_time, starts_on, ends_on, rrule, star_value, active, sort_order";
const mapTask = (r: TRow): Task => ({ id: r.id, groupId: r.group_id, profileId: r.profile_id, kind: r.kind, title: r.title, emoji: r.emoji ?? '', timeOfDay: r.time_of_day, dueTime: r.due_time, startsOn: r.starts_on, endsOn: r.ends_on, rrule: r.rrule, starValue: r.star_value, active: r.active, sortOrder: r.sort_order });
const kindEnum = z.enum(['chore', 'routine']); const tod = z.enum(['morning', 'afternoon', 'evening']);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const balanceOf = async (t: { one: <T>(s: string, p?: unknown[]) => Promise<T | null> }, profileId: string) => (await t.one<{ star_balance: number }>('select star_balance from profiles where id = $1', [profileId]))!.star_balance;

/* ---------------------------------------------------------------- lists, recipes, meals */
type LRow = { id: string; name: string; color: string | null; emoji: string | null; is_grocery: boolean; sort_order: number };
const mapList = (r: LRow): List => ({ id: r.id, name: r.name, color: (r.color ?? '#808080').toUpperCase(), emoji: r.emoji ?? '', isGrocery: r.is_grocery, sortOrder: r.sort_order });
type IRow = { id: string; list_id: string; text: string; done: boolean; sort_order: number; recipe_id: string | null };
const mapItem = (r: IRow): ListItem => ({ id: r.id, listId: r.list_id, text: r.text, done: r.done, sortOrder: r.sort_order, recipeId: r.recipe_id });
type RRow = { id: string; title: string; category: string | null; description: string | null; ingredients: { text: string }[]; instructions: string | null; source: Recipe['source']; source_url: string | null; favorite: boolean };
const mapRecipe = (r: RRow): Recipe => ({ id: r.id, title: r.title, category: r.category ?? '', description: r.description ?? '', ingredients: r.ingredients, instructions: r.instructions ?? '', source: r.source, sourceUrl: r.source_url ?? '', favorite: r.favorite });
const RCOLS = 'id, title, category, description, ingredients, instructions, source, source_url, favorite';
const slot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const family = {
  listTasksForDay: def('read', [zDate], async (c, date): Promise<TaskForDay[]> => tenant(c, async (t) => {
    const tasks = (await t.all<TRow>(`select ${TCOLS} from tasks where active and starts_on <= $1 and (ends_on is null or ends_on >= $1)`, [date])).map(mapTask).filter((x) => taskOccursOn(x, date));
    const done = new Set((await t.all<{ task_id: string }>('select task_id from task_completions where occurrence_on = $1', [date])).map((r) => r.task_id));
    const order = { morning: 0, afternoon: 1, evening: 2 } as const;
    return tasks.map((task) => ({ task, done: done.has(task.id) }))
      .sort((a, b) => (a.task.kind === 'routine' ? order[a.task.timeOfDay!] : 3) - (b.task.kind === 'routine' ? order[b.task.timeOfDay!] : 3) || a.task.sortOrder - b.task.sortOrder || a.task.title.localeCompare(b.task.title));
  })),
  listAllTasks: def('read', [], async (c) => (await tenant(c, (t) => t.all<TRow>(`select ${TCOLS} from tasks where active order by sort_order, created_at`))).map(mapTask)),
  getTask: def('read', [zId], async (c, id) => tenant(c, async (t) => {
    const r = await t.one<TRow>(`select ${TCOLS} from tasks where id = $1`, [id]);
    if (!r) throw new ApiError('not_found', 'That task was not found.');
    const sib = await t.all<{ profile_id: string }>('select profile_id from tasks where group_id = $1', [r.group_id]);
    return { ...mapTask(r), siblings: sib.map((x) => x.profile_id) };
  })),
  createTasks: def('adult', [z.object({ profileIds: z.array(zId).max(20), title: zStr(120), emoji: zStr(8), kind: kindEnum, timeOfDay: tod.nullable(), dueTime: hhmm.nullable(), startsOn: zDate, endsOn: zDate.nullable(), rrule: zStr(300).nullable(), starValue: z.number().int() })], async (c, i) => {
    if (!clean(i.title)) throw new ApiError('missing', 'Give the task a name.');
    if (!i.profileIds.length) throw new ApiError('missing', 'Pick at least one person.');
    if (i.kind === 'routine' && !i.timeOfDay) throw new ApiError('missing', 'Choose morning, afternoon or evening for a routine.');
    if (i.starValue < 0 || i.starValue > 500) throw new ApiError('invalid', 'Stars must be between 0 and 500.');
    return tenant(c, async (t) => {
      const group = crypto.randomUUID(); const out: Task[] = [];
      for (const pid of i.profileIds) {
        out.push(mapTask((await t.one<TRow>(`insert into tasks (household_id, group_id, profile_id, kind, title, emoji, time_of_day, due_time, starts_on, ends_on, rrule, star_value, created_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning ${TCOLS}`,
          [c.hid, group, pid, i.kind, clean(i.title), i.emoji || null, i.kind === 'routine' ? i.timeOfDay : null, i.kind === 'chore' ? i.dueTime : null, i.startsOn, i.endsOn, i.rrule || null, i.starValue, c.userId ?? null]))!));
      }
      return out;
    });
  }, { write: true }),
  updateTask: def('adult', [zId, z.object({ title: zStr(120).optional(), emoji: zStr(8).optional(), kind: kindEnum.optional(), timeOfDay: tod.nullable().optional(), dueTime: hhmm.nullable().optional(), rrule: zStr(300).nullable().optional(), starValue: z.number().int().min(0).max(500).optional(), endsOn: zDate.nullable().optional() })], async (c, id, p) => {
    await tenant(c, async (t) => {
      const cur = await t.one<TRow>(`select ${TCOLS} from tasks where id = $1`, [id]);
      if (!cur) throw new ApiError('not_found', 'That task was not found.');
      const next = { ...mapTask(cur), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Task;
      if (next.kind === 'routine') { next.dueTime = null; if (!next.timeOfDay) throw new ApiError('missing', 'Choose morning, afternoon or evening for a routine.'); } else next.timeOfDay = null;
      if (!clean(next.title)) throw new ApiError('missing', 'Give the task a name.');
      await t.exec('update tasks set kind=$2, title=$3, emoji=$4, time_of_day=$5, due_time=$6, rrule=$7, star_value=$8, ends_on=$9 where group_id = $1',
        [cur.group_id, next.kind, clean(next.title), next.emoji || null, next.timeOfDay, next.dueTime, next.rrule || null, next.starValue, next.endsOn]);
    });
  }, { write: true }),
  deleteTask: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from tasks where id = $1', [id])); }, { write: true }),
  setCompletion: def('member', [zId, zDate, z.boolean()], async (c, taskId, date, done) => tenant(c, async (t) => {
    const task = await t.one<{ profile_id: string; star_value: number; title: string }>('select profile_id, star_value, title from tasks where id = $1', [taskId]);
    if (!task) throw new ApiError('not_found', 'That task was not found.');
    if (done) {
      const ins = await t.one<{ id: string }>('insert into task_completions (household_id, task_id, occurrence_on, completed_by_device, completed_by_user) values ($1,$2,$3,$4,$5) on conflict (task_id, occurrence_on) do nothing returning id', [c.hid, taskId, date, c.deviceId ?? null, c.userId ?? null]);
      if (ins && task.star_value > 0) await t.exec("insert into star_ledger (household_id, profile_id, delta, reason, task_completion_id, note, created_by) values ($1,$2,$3,'task',$4,$5,$6)", [c.hid, task.profile_id, task.star_value, ins.id, task.title, c.userId ?? null]);
    } else {
      const ex = await t.one<{ id: string }>('select id from task_completions where task_id = $1 and occurrence_on = $2', [taskId, date]);
      if (ex) {
        const had = await t.one('select 1 from star_ledger where task_completion_id = $1 and reason = $2', [ex.id, 'task']);
        if (had) {
          try { await t.exec('savepoint rev'); await t.exec("insert into star_ledger (household_id, profile_id, delta, reason, task_completion_id, note, created_by) values ($1,$2,$3,'reversal',$4,$5,$6)", [c.hid, task.profile_id, -task.star_value, ex.id, task.title, c.userId ?? null]); }
          catch (e) { if ((e as { code?: string }).code === '23514') throw new ApiError('stars_spent', `The ${task.star_value} stars from “${task.title}” were already spent, so it cannot be unchecked.`); throw e; }
        }
        await t.exec('delete from task_completions where id = $1', [ex.id]);
      }
    }
    return { balance: await balanceOf(t, task.profile_id) };
  }), { write: true }),

  /* ---------------------------------------------------------------- rewards and stars */
  listRewards: def('read', [], async (c): Promise<Reward[]> => (await tenant(c, (t) => t.all<{ id: string; profile_id: string; title: string; emoji: string | null; stars_needed: number; active: boolean }>('select id, profile_id, title, emoji, stars_needed, active from rewards where active order by stars_needed, title')))
    .map((r) => ({ id: r.id, profileId: r.profile_id, title: r.title, emoji: r.emoji ?? '', starsNeeded: r.stars_needed, active: r.active }))),
  createReward: def('adult', [z.object({ profileId: zId, title: zStr(80), emoji: zStr(8), starsNeeded: z.number().int() })], async (c, i): Promise<Reward> => {
    if (!clean(i.title)) throw new ApiError('missing', 'Give the reward a name.');
    if (!(i.starsNeeded >= 1 && i.starsNeeded <= 500)) throw new ApiError('invalid', 'A reward costs between 1 and 500 stars.');
    const r = await tenant(c, (t) => t.one<{ id: string }>('insert into rewards (household_id, profile_id, title, emoji, stars_needed) values ($1,$2,$3,$4,$5) returning id', [c.hid, i.profileId, clean(i.title), i.emoji || null, i.starsNeeded]));
    return { id: r!.id, profileId: i.profileId, title: clean(i.title), emoji: i.emoji, starsNeeded: i.starsNeeded, active: true };
  }, { write: true }),
  updateReward: def('adult', [zId, z.object({ title: zStr(80).optional(), emoji: zStr(8).optional(), starsNeeded: z.number().int().optional() })], async (c, id, p) => {
    if (p.starsNeeded !== undefined && !(p.starsNeeded >= 1 && p.starsNeeded <= 500)) throw new ApiError('invalid', 'A reward costs between 1 and 500 stars.');
    const n = await tenant(c, (t) => t.exec('update rewards set title = coalesce($2,title), emoji = coalesce($3,emoji), stars_needed = coalesce($4,stars_needed) where id = $1', [id, p.title === undefined ? null : clean(p.title), p.emoji ?? null, p.starsNeeded ?? null]));
    if (!n) throw new ApiError('not_found', 'That reward was not found.');
  }, { write: true }),
  deleteReward: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from rewards where id = $1', [id])); }, { write: true }),
  redeemReward: def('member', [zId], async (c, id) => tenant(c, async (t) => {
    const r = await t.one<{ profile_id: string; title: string; stars_needed: number; name: string; star_balance: number }>('select r.profile_id, r.title, r.stars_needed, p.name, p.star_balance from rewards r join profiles p on p.id = r.profile_id where r.id = $1 and r.active for update of p', [id]);
    if (!r) throw new ApiError('not_found', 'That reward was not found.');
    if (r.star_balance < r.stars_needed) throw new ApiError('not_enough_stars', `${r.name} needs ${r.stars_needed - r.star_balance} more stars for this.`);
    await t.exec("insert into star_ledger (household_id, profile_id, delta, reason, reward_id, note, created_by) values ($1,$2,$3,'redeem',$4,$5,$6)", [c.hid, r.profile_id, -r.stars_needed, id, r.title, c.userId ?? null]);
    return { balance: await balanceOf(t, r.profile_id) };
  }), { write: true }),
  addBonusStars: def('adult', [zId, z.number().int(), zStr(120)], async (c, profileId, delta, note) => tenant(c, async (t) => {
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) throw new ApiError('invalid', 'Enter a whole number of stars, not zero.');
    const p = await t.one<{ name: string; star_balance: number }>('select name, star_balance from profiles where id = $1 for update', [profileId]);
    if (!p) throw new ApiError('not_found', 'That person was not found.');
    if (p.star_balance + delta < 0) throw new ApiError('not_enough_stars', `${p.name} only has ${p.star_balance} stars.`);
    await t.exec("insert into star_ledger (household_id, profile_id, delta, reason, note, created_by) values ($1,$2,$3,'manual',$4,$5)", [c.hid, profileId, delta, clean(note) || null, c.userId ?? null]);
    return { balance: await balanceOf(t, profileId) };
  }), { write: true }),
  listStarHistory: def('read', [zId], async (c, profileId): Promise<StarEntry[]> => (await tenant(c, (t) => t.all<{ id: string; profile_id: string; delta: number; reason: StarEntry['reason']; note: string | null; created_at: string }>('select id, profile_id, delta, reason, note, created_at from star_ledger where profile_id = $1 order by created_at desc, id limit 50', [profileId])))
    .map((r) => ({ id: r.id, profileId: r.profile_id, delta: r.delta, reason: r.reason, note: r.note ?? '', createdAt: r.created_at }))),

  /* ---------------------------------------------------------------- lists */
  listLists: def('read', [], async (c) => tenant(c, async (t) => {
    const ls = (await t.all<LRow>('select id, name, color, emoji, is_grocery, sort_order from lists order by sort_order, created_at')).map(mapList);
    const its = (await t.all<IRow>('select id, list_id, text, done, sort_order, recipe_id from list_items order by done, sort_order, created_at')).map(mapItem);
    return ls.map((l) => ({ ...l, items: its.filter((i) => i.listId === l.id) }));
  })),
  createList: def('adult', [z.object({ name: zStr(60), color: zHex, emoji: zStr(8) })], async (c, i) => {
    if (!clean(i.name)) throw new ApiError('missing', 'Give the list a name.');
    return mapList((await tenant(c, (t) => t.one<LRow>('insert into lists (household_id, name, color, emoji, sort_order) values ($1,$2,$3,$4,(select coalesce(max(sort_order),0)+1 from lists)) returning id, name, color, emoji, is_grocery, sort_order', [c.hid, clean(i.name), i.color, i.emoji || null])))!);
  }, { write: true }),
  updateList: def('adult', [zId, z.object({ name: zStr(60).optional(), color: zHex.optional(), emoji: zStr(8).optional() })], async (c, id, p) => {
    const n = await tenant(c, (t) => t.exec('update lists set name = coalesce($2,name), color = coalesce($3,color), emoji = coalesce($4,emoji) where id = $1', [id, p.name === undefined ? null : clean(p.name), p.color ?? null, p.emoji ?? null]));
    if (!n) throw new ApiError('not_found', 'That list was not found.');
  }, { write: true }),
  deleteList: def('adult', [zId], async (c, id) => tenant(c, async (t) => {
    const l = await t.one<{ is_grocery: boolean }>('select is_grocery from lists where id = $1', [id]);
    if (!l) throw new ApiError('not_found', 'That list was not found.');
    if (l.is_grocery) throw new ApiError('protected', 'The grocery list cannot be deleted.');
    await t.exec('delete from lists where id = $1', [id]);
  }), { write: true }),
  addItem: def('member', [zId, zStr(200)], async (c, listId, text) => {
    if (!clean(text)) throw new ApiError('missing', 'Type what to add.');
    const r = await tenant(c, async (t) => {
      if (!(await t.one('select 1 from lists where id = $1', [listId]))) throw new ApiError('not_found', 'That list was not found.');
      return t.one<IRow>('insert into list_items (household_id, list_id, text, sort_order, created_by) values ($1,$2,$3,(select coalesce(max(sort_order),0)+1 from list_items where list_id = $2),$4) returning id, list_id, text, done, sort_order, recipe_id', [c.hid, listId, clean(text), c.userId ?? null]);
    });
    return mapItem(r!);
  }, { write: true }),
  setItemDone: def('member', [zId, z.boolean()], async (c, id, done) => {
    const n = await tenant(c, (t) => t.exec('update list_items set done = $2, done_at = case when $2 then now() else null end where id = $1', [id, done]));
    if (!n) throw new ApiError('not_found', 'That item was not found.');
  }, { write: true }),
  deleteItem: def('member', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from list_items where id = $1', [id])); }, { write: true }),
  clearChecked: def('member', [zId], async (c, listId) => tenant(c, (t) => t.exec('delete from list_items where list_id = $1 and done', [listId])), { write: true }),

  /* ---------------------------------------------------------------- recipes and meals */
  listRecipes: def('read', [], async (c) => (await tenant(c, (t) => t.all<RRow>(`select ${RCOLS} from recipes order by lower(title)`))).map(mapRecipe)),
  getRecipe: def('read', [zId], async (c, id) => {
    const r = await tenant(c, (t) => t.one<RRow>(`select ${RCOLS} from recipes where id = $1`, [id]));
    if (!r) throw new ApiError('not_found', 'That recipe was not found.');
    return mapRecipe(r);
  }),
  saveRecipe: def('member', [z.object({ id: zId.optional(), title: zStr(120), category: zStr(60), description: zStr(500), ingredients: z.array(z.object({ text: zStr(200) })).max(100), instructions: zStr(10000), source: z.enum(['manual', 'import', 'ai']).optional(), sourceUrl: zStr(500).optional(), favorite: z.boolean().optional() })], async (c, i) => {
    if (!clean(i.title)) throw new ApiError('missing', 'Give the recipe a name.');
    const ing = JSON.stringify(i.ingredients.map((x) => ({ text: clean(x.text) })).filter((x) => x.text));
    return mapRecipe((await tenant(c, async (t) => {
      if (i.id) {
        const r = await t.one<RRow>(`update recipes set title=$2, category=$3, description=$4, ingredients=$5::jsonb, instructions=$6, favorite=coalesce($7,favorite) where id=$1 returning ${RCOLS}`,
          [i.id, clean(i.title), i.category || null, i.description || null, ing, i.instructions || null, i.favorite ?? null]);
        if (!r) throw new ApiError('not_found', 'That recipe was not found.'); return r;
      }
      return t.one<RRow>(`insert into recipes (household_id, title, category, description, ingredients, instructions, source, source_url, favorite) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) returning ${RCOLS}`,
        [c.hid, clean(i.title), i.category || null, i.description || null, ing, i.instructions || null, i.source ?? 'manual', i.sourceUrl || null, i.favorite ?? false]);
    }))!);
  }, { write: true }),
  deleteRecipe: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from recipes where id = $1', [id])); }, { write: true }),
  recipeToGrocery: def('member', [zId], async (c, id) => tenant(c, async (t) => {
    const r = await t.one<{ ingredients: { text: string }[] }>('select ingredients from recipes where id = $1', [id]);
    if (!r) throw new ApiError('not_found', 'That recipe was not found.');
    const g = await t.one<{ id: string }>('select id from lists where is_grocery', []);
    if (!g) throw new ApiError('not_found', 'The grocery list was not found.');
    let added = 0, skipped = 0;
    for (const ing of r.ingredients) {
      const dupe = await t.one('select 1 from list_items where list_id = $1 and not done and lower(text) = lower($2)', [g.id, ing.text]);
      if (dupe) { skipped++; continue; }
      await t.exec('insert into list_items (household_id, list_id, text, sort_order, recipe_id, created_by) values ($1,$2,$3,(select coalesce(max(sort_order),0)+1 from list_items where list_id = $2),$4,$5)', [c.hid, g.id, ing.text, id, c.userId ?? null]); added++;
    }
    return { added, skipped };
  }), { write: true }),
  listMeals: def('read', [zDate, zDate], async (c, from, to): Promise<MealEntry[]> => (await tenant(c, (t) => t.all<{ id: string; plan_date: string; slot: MealEntry['slot']; recipe_id: string | null; title: string; position: number }>('select id, plan_date, slot, recipe_id, title, position from meal_plan_entries where plan_date between $1 and $2 order by plan_date, position, created_at', [from, to])))
    .map((r) => ({ id: r.id, planDate: r.plan_date, slot: r.slot, recipeId: r.recipe_id, title: r.title, position: r.position }))),
  addMeal: def('member', [z.object({ planDate: zDate, slot, title: zStr(120), recipeId: zId.nullable() })], async (c, i): Promise<MealEntry> => {
    if (!clean(i.title)) throw new ApiError('missing', 'Type what is on the menu.');
    const r = await tenant(c, (t) => t.one<{ id: string; position: number }>('insert into meal_plan_entries (household_id, plan_date, slot, recipe_id, title, position) values ($1,$2,$3,$4,$5,(select count(*) from meal_plan_entries where plan_date = $2 and slot = $3)) returning id, position', [c.hid, i.planDate, i.slot, i.recipeId, clean(i.title)]));
    return { id: r!.id, planDate: i.planDate, slot: i.slot, recipeId: i.recipeId, title: clean(i.title), position: r!.position };
  }, { write: true }),
  deleteMeal: def('member', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from meal_plan_entries where id = $1', [id])); }, { write: true }),
};
