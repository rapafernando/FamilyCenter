import { withTenant } from './db';
import type { State } from '@/lib/data/state';

/** Copies a demo State (all made-up people) into a real household. Used by the seed script and demo mode. */
export async function importState(hid: string, s: State, personName: string) {
  await withTenant(hid, async (t) => {
    const map = new Map<string, string>();
    const m = (id: string | null | undefined) => (id ? map.get(id) ?? null : null);
    const fresh = (old: string) => { const n = crypto.randomUUID(); map.set(old, n); return n; };

    const existing = await t.all<{ id: string; name: string; kind: string }>('select id, name, kind from profiles');
    for (const p of s.profiles) {
      const hit = p.kind === 'household' ? existing.find((e) => e.kind === 'household') : existing.find((e) => e.kind === 'person' && p.name === personName && e.name === personName);
      if (hit) { map.set(p.id, hit.id); continue; }
      await t.exec('insert into profiles (id, household_id, name, color, birthday, kind, sort_order) values ($1,$2,$3,$4,$5,$6,10)', [fresh(p.id), hid, p.name, p.color, p.birthday, p.kind]);
    }
    for (const c of s.categories) await t.exec('insert into event_categories (id, household_id, name, color) values ($1,$2,$3,$4)', [fresh(c.id), hid, c.name, c.color]);
    for (const e of s.events) {
      await t.exec(`insert into events (id, household_id, profile_id, category_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, recurrence_until, alert_minutes, source)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'local')`, [fresh(e.id), hid, m(e.profileId), m(e.categoryId), e.title, e.description || null, e.location || null, e.allDay, e.startsAt, e.endsAt, e.tz, e.rrule, e.recurrenceUntil, e.alertMinutes]);
    }
    for (const o of s.overrides) if (m(o.eventId))
      await t.exec('insert into event_overrides (household_id, event_id, recurrence_id, cancelled, title, description, location, starts_at, ends_at, profile_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [hid, m(o.eventId), o.recurrenceId, o.cancelled, o.title ?? null, o.description ?? null, o.location ?? null, o.startsAt ?? null, o.endsAt ?? null, m(o.profileId)]);
    for (const c of s.countdowns) await t.exec('insert into countdowns (household_id, title, target_date, emoji, show_on_display) values ($1,$2,$3,$4,$5)', [hid, c.title, c.targetDate, c.emoji || null, c.showOnDisplay]);
    for (const k of s.tasks) {
      await t.exec(`insert into tasks (id, household_id, group_id, profile_id, kind, title, emoji, time_of_day, due_time, starts_on, ends_on, rrule, star_value, active, sort_order)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [fresh(k.id), hid, map.get(k.groupId) ?? fresh(k.groupId), m(k.profileId), k.kind, k.title, k.emoji || null, k.timeOfDay, k.dueTime, k.startsOn, k.endsOn, k.rrule, k.starValue, k.active, k.sortOrder]);
    }
    for (const c of s.completions) if (m(c.taskId))
      await t.exec('insert into task_completions (id, household_id, task_id, occurrence_on, completed_at) values ($1,$2,$3,$4,$5)', [fresh(c.id), hid, m(c.taskId), c.occurrenceOn, c.completedAt]);
    for (const r of s.rewards) await t.exec('insert into rewards (id, household_id, profile_id, title, emoji, stars_needed, active) values ($1,$2,$3,$4,$5,$6,$7)', [fresh(r.id), hid, m(r.profileId), r.title, r.emoji || null, r.starsNeeded, r.active]);
    for (const e of [...s.stars].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
      await t.exec('insert into star_ledger (household_id, profile_id, delta, reason, note, created_at) values ($1,$2,$3,$4,$5,$6)', [hid, m(e.profileId), e.delta, e.reason, e.note || null, e.createdAt]);
    const grocery = await t.one<{ id: string }>('select id from lists where is_grocery');
    for (const l of s.lists) {
      if (l.isGrocery && grocery) { map.set(l.id, grocery.id); continue; }
      await t.exec('insert into lists (id, household_id, name, color, emoji, sort_order) values ($1,$2,$3,$4,$5,$6)', [fresh(l.id), hid, l.name, l.color, l.emoji || null, l.sortOrder + 1]);
    }
    for (const r of s.recipes) await t.exec('insert into recipes (id, household_id, title, category, description, ingredients, instructions, source, favorite) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)', [fresh(r.id), hid, r.title, r.category || null, r.description || null, JSON.stringify(r.ingredients), r.instructions || null, r.source, r.favorite]);
    for (const i of s.items) if (m(i.listId)) await t.exec('insert into list_items (household_id, list_id, text, done, sort_order, recipe_id) values ($1,$2,$3,$4,$5,$6)', [hid, m(i.listId), i.text, i.done, i.sortOrder, m(i.recipeId)]);
    for (const x of s.meals) await t.exec('insert into meal_plan_entries (household_id, plan_date, slot, recipe_id, title, position) values ($1,$2,$3,$4,$5,$6)', [hid, x.planDate, x.slot, m(x.recipeId), x.title, x.position]);
  });
}
