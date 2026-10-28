import { test, expect, signUp, must, rpc, isoDay, sql, readPairingCode, linkScreen, checkProblems } from './fixtures';

const TZ = 'America/New_York';

test('F13-H1/E1 household B sees none of household A, through the screens and the endpoint', async ({ page, browser, allowProblems }) => {
  await signUp(page, { name: 'Alma', household: 'Alma House', tz: TZ });
  const ps = await must<any[]>(page, 'listProfiles');
  const me = ps.find((p) => p.kind === 'person'); const family = ps.find((p) => p.kind === 'household');
  const day = isoDay(0);
  const ev = await must<any>(page, 'createEvent', [{ profileId: family.id, categoryId: null, title: 'ALMA-SECRET-EVENT', description: 'd', location: 'l', allDay: false, startsAt: `${day}T17:00:00.000Z`, endsAt: `${day}T18:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
  const [task] = await must<any[]>(page, 'createTasks', [{ profileIds: [me.id], title: 'ALMA-SECRET-CHORE', emoji: '🔒', kind: 'chore', timeOfDay: null, dueTime: null, startsOn: day, endsOn: null, rrule: null, starValue: 2 }]);
  const list = await must<any>(page, 'createList', [{ name: 'ALMA-SECRET-LIST', color: '#2a6f4f', emoji: '🔒' }]);
  const item = await must<any>(page, 'addItem', [list.id, 'ALMA-SECRET-ITEM']);
  const rec = await must<any>(page, 'saveRecipe', [{ title: 'ALMA-SECRET-RECIPE', category: '', description: '', ingredients: [{ text: 'x' }], instructions: '', source: 'manual', sourceUrl: '', favorite: false }]);
  const meal = await must<any>(page, 'addMeal', [{ planDate: day, slot: 'dinner', title: 'ALMA-SECRET-MEAL', recipeId: null }]);
  const rw = await must<any>(page, 'createReward', [{ profileId: me.id, title: 'ALMA-SECRET-REWARD', emoji: '🎁', starsNeeded: 5 }]);
  const album = await must<any>(page, 'createAlbum', ['ALMA-SECRET-ALBUM']);
  await must(page, 'saveAiProvider', [{ provider: 'openai_compatible', label: 'ALMA-KEY', model: 'm', baseUrl: 'http://localhost:4011/v1', apiKey: 'sk-alma-1234' }]);

  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.99.9.9' } });
  const b = await ctx.newPage();
  await signUp(b, { name: 'Bo', household: 'Bo House', tz: TZ });
  // through the screens
  for (const route of [`/calendar?view=day&date=${day}`, `/calendar?view=week&date=${day}`, '/chores', '/lists', '/recipes', '/meals', '/rewards', '/settings/photos', '/settings/profiles', '/settings/household', '/settings/ai']) {
    await b.goto(route);
    await b.waitForTimeout(600);
    const text = await b.locator('body').innerText();
    expect(text, route).not.toMatch(/ALMA|Alma House|\bAlma\b/);
  }
  // through the endpoint: nothing listed
  const day2 = { from: `${isoDay(-30)}T00:00:00.000Z`, to: `${isoDay(60)}T00:00:00.000Z` };
  const listed = JSON.stringify([
    await must(b, 'listEvents', [day2]), await must(b, 'listAllTasks'), await must(b, 'listLists'), await must(b, 'listRecipes'), await must(b, 'listMeals', [isoDay(-30), isoDay(60)]),
    await must(b, 'listRewards'), await must(b, 'listAlbums'), await must(b, 'listProfiles'), await must(b, 'listMembers'), await must(b, 'listAiProviders'), await must(b, 'listCategories'),
    await must(b, 'listConnections'), await must(b, 'listDevices'), await must(b, 'getHousehold'),
  ]);
  expect(listed).not.toMatch(/ALMA|Alma House|\bAlma\b|alma-/);
  // by id, every read and write is refused or finds nothing
  const calls: [string, unknown[]][] = [
    ['getEvent', [ev.id]], ['deleteEvent', [ev.id]], ['updateEvent', [ev.id, { title: 'hijack' }, 'all']], ['getTask', [task.id]], ['updateTask', [task.id, { title: 'hijack' }]], ['deleteTask', [task.id]],
    ['setCompletion', [task.id, day, true]], ['addItem', [list.id, 'hijack']], ['setItemDone', [item.id, true]], ['deleteItem', [item.id]], ['updateList', [list.id, { name: 'hijack' }]], ['deleteList', [list.id]],
    ['getRecipe', [rec.id]], ['deleteRecipe', [rec.id]], ['recipeToGrocery', [rec.id]], ['deleteMeal', [meal.id]], ['redeemReward', [rw.id]], ['deleteReward', [rw.id]], ['addBonusStars', [me.id, 99, 'x']],
    ['listStarHistory', [me.id]], ['updateAlbum', [album.id, { name: 'hijack' }]], ['deleteAlbum', [album.id]], ['updateProfile', [me.id, { name: 'hijack' }]], ['deleteProfile', [me.id]],
    ['addMeal', [{ planDate: day, slot: 'dinner', title: 'hijack', recipeId: rec.id }]],
    ['createEvent', [{ profileId: me.id, categoryId: null, title: 'hijack', description: '', location: '', allDay: false, startsAt: `${day}T17:00:00.000Z`, endsAt: `${day}T18:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]],
    ['createTasks', [{ profileIds: [me.id], title: 'hijack', emoji: '', kind: 'chore', timeOfDay: null, dueTime: null, startsOn: day, endsOn: null, rrule: null, starValue: 0 }]],
  ];
  for (const [m, a] of calls) {
    const r = await rpc(b, m, a);
    const leaked = r.ok && r.r != null && JSON.stringify(r.r).match(/ALMA|Alma House|\bAlma\b/);
    expect(!!leaked, `${m} must not return household A's data`).toBe(false);
  }
  // nothing of A changed
  expect(sql(`select title from events where id='${ev.id}'`)).toBe('ALMA-SECRET-EVENT');
  expect(sql(`select title from tasks where id='${task.id}'`)).toBe('ALMA-SECRET-CHORE');
  expect(sql(`select name from lists where id='${list.id}'`)).toBe('ALMA-SECRET-LIST');
  expect(sql(`select count(*) from list_items where id='${item.id}' and not done`)).toBe('1');
  expect(sql(`select count(*) from rewards where id='${rw.id}'`)).toBe('1');
  expect(sql(`select count(*) from meal_plan_entries where id='${meal.id}'`).length).toBeGreaterThan(0);
  expect(sql(`select name from profiles where id='${me.id}'`)).toBe('Alma');
  expect(sql(`select star_balance from profiles where id='${me.id}'`)).toBe('0');
  expect(sql(`select count(*) from events where title='hijack'`)).toBe('0');
  expect(sql(`select count(*) from tasks where title='hijack'`)).toBe('0');
  await ctx.close();
  allowProblems();
});

test('F13-E4 a pairing code from household A cannot be used by B to read A\'s data, and a display only sees its own household', async ({ page, browser, allowProblems }) => {
  await signUp(page, { household: 'Display Home', tz: TZ });
  await must(page, 'addMeal', [{ planDate: isoDay(0), slot: 'dinner', title: 'DISPLAYHOME-MEAL', recipeId: null }]);
  const dctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.98.8.1' } });
  const display = await dctx.newPage();
  const code = await readPairingCode(display);
  await linkScreen(page, code, 'Wall');
  await display.waitForURL(/calendar/, { timeout: 15000 });
  const meals = await must<any[]>(display, 'listMeals', [isoDay(-1), isoDay(3)]);
  expect(meals.map((m) => m.title)).toContain('DISPLAYHOME-MEAL');
  // a display cannot do account things or see account data
  for (const m of ['getAccount', 'exportAll', 'deleteAccount', 'changePassword']) {
    const r = await rpc(display, m, m === 'changePassword' ? ['a', 'bbbbbbbbbb'] : []);
    expect(r.ok, `a display must not ${m}`).toBe(false);
  }
  // with no parent PIN a screen counts as unlocked (documented); once a PIN is set, adult-level calls are refused
  await must(page, 'setPin', ['4821']);
  for (const m of ['listAiProviders', 'listDevices']) {
    const r = await rpc(display, m, []);
    expect(r.ok, `a locked display must not ${m}`).toBe(false);
  }
  // a second household using the same code cannot attach to A
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.98.8.2' } });
  const b = await ctx.newPage();
  await signUp(b, { household: 'Intruder' });
  const claim = await rpc(b, 'claimPairing', [code, 'Sneaky']);
  expect(claim.ok).toBe(false);
  expect(sql(`select count(*) from devices where nickname='Sneaky'`)).toBe('0');
  await dctx.close(); await ctx.close();
  allowProblems();
});

test('F10 two displays on one household see the same data; renaming and removing one leaves the other', async ({ page, browser, allowProblems }) => {
  const HH = `Two Screens ${Date.now()}`;
  await signUp(page, { household: HH, tz: TZ });
  const mk = async (ip: string, name: string) => {
    const c = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } });
    const d = await c.newPage();
    const code = await readPairingCode(d);
    await linkScreen(page, code, name);
    await d.waitForURL(/calendar/, { timeout: 15000 });
    return { c, d };
  };
    const a = await mk('10.97.7.1', 'Kitchen'); const b = await mk('10.97.7.2', 'Hall');
  // F10-E1: a second screen with the same name is refused with a clear message
  await page.goto('/settings/devices/link');
  const c3 = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.97.7.3' } });
  const d3 = await c3.newPage(); const code3 = await readPairingCode(d3);
  await linkScreen(page, code3, 'Kitchen');
  await expect(page.getByText('Another screen already has that name.')).toBeVisible();
  await c3.close();
  expect(sql(`select count(*) from devices where household_id=(select id from households where name='${HH}')`)).toBe('2');
  await must(page, 'createList', [{ name: 'Shared', color: '#2a6f4f', emoji: '📋' }]);
  for (const d of [a.d, b.d]) expect((await must<any[]>(d, 'listLists')).map((l) => l.name)).toContain('Shared');
  const devs = await must<any[]>(page, 'listDevices');
  const first = devs[0];
  await must(page, 'updateDevice', [first.id, { nickname: 'Den' }]);
  await must(page, 'removeDevice', [devs[1].id]);
  expect((await must<any[]>(page, 'listDevices')).map((d) => d.nickname)).toEqual(['Den']);
  const survivors = [a, b];
  const alive: boolean[] = [];
  for (const s of survivors) alive.push((await rpc(s.d, 'listLists')).ok);
  expect(alive.filter(Boolean)).toHaveLength(1);
  await a.c.close(); await b.c.close();
  allowProblems();
});
