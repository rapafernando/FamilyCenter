// A second household must get nothing back, at every level: raw SQL, the row rules themselves, and every call that takes an id.
// Run: npm run test:isolation   (needs the local database from .env.local; it creates and removes its own households)
import '../src/server/loadenv.ts';
import assert from 'node:assert/strict';
const { plain, withTenant, pool } = await import('../src/server/db.ts');
const { createHousehold } = await import('../src/server/handlers/core.ts');
const { ensureRegistry } = await import('../src/server/handlers/index.ts');
const { call, registry } = await import('../src/server/rpc.ts');
const { ApiError } = await import('../src/lib/types.ts');

ensureRegistry();
let pass = 0; const failures: string[] = [];
const ok = (name: string) => { pass++; console.log('  ok  ', name); };
async function test(name: string, fn: () => Promise<void>) { try { await fn(); ok(name); } catch (e) { failures.push(name); console.log('  FAIL', name, '\n      ', e instanceof Error ? e.message : e); } }

const mk = async (tag: string) => {
  const u = await plain((t) => t.one<{ id: string }>('insert into users (email, name, password_hash) values ($1,$2,$3) returning id', [`iso-${tag}-${crypto.randomUUID()}@example.test`, tag, 'x']));
  const hid = await createHousehold(u!.id, `Iso ${tag}`, tag, 'America/New_York');
  const ids = await withTenant(hid, async (t) => {
    const fam = (await t.one<{ id: string }>("select id from profiles where kind='household'"))!.id;
    const person = (await t.one<{ id: string }>("select id from profiles where kind='person'"))!.id;
    const list = (await t.one<{ id: string }>('select id from lists where is_grocery'))!.id;
    const ev = (await t.one<{ id: string }>("insert into events (household_id, profile_id, title, starts_at, ends_at, tz) values ($1,$2,'Secret dentist','2030-01-01T10:00Z','2030-01-01T11:00Z','UTC') returning id", [hid, person]))!.id;
    const task = (await t.one<{ id: string }>("insert into tasks (household_id, group_id, profile_id, kind, title, starts_on, star_value) values ($1,gen_random_uuid(),$2,'chore','Secret chore','2030-01-01',3) returning id", [hid, person]))!.id;
    const reward = (await t.one<{ id: string }>("insert into rewards (household_id, profile_id, title, stars_needed) values ($1,$2,'Secret reward',5) returning id", [hid, person]))!.id;
    const item = (await t.one<{ id: string }>("insert into list_items (household_id, list_id, text) values ($1,$2,'Secret milk') returning id", [hid, list]))!.id;
    const recipe = (await t.one<{ id: string }>("insert into recipes (household_id, title, ingredients) values ($1,'Secret stew','[]') returning id", [hid]))!.id;
    const meal = (await t.one<{ id: string }>("insert into meal_plan_entries (household_id, plan_date, slot, title) values ($1,'2030-01-01','dinner','Secret supper') returning id", [hid]))!.id;
    const album = (await t.one<{ id: string }>("insert into photo_albums (household_id, name) values ($1,'Secret album') returning id", [hid]))!.id;
    const cat = (await t.one<{ id: string }>("insert into event_categories (household_id, name, color) values ($1,'Secret cat','#112233') returning id", [hid]))!.id;
    const cd = (await t.one<{ id: string }>("insert into countdowns (household_id, title, target_date) values ($1,'Secret day','2030-01-01') returning id", [hid]))!.id;
    return { fam, person, list, ev, task, reward, item, recipe, meal, album, cat, cd };
  });
  const jar = { get: () => undefined, set: () => {}, delete: () => {} };
  const ctx = (role: 'owner' | 'adult' | 'viewer' = 'owner') => ({ jar, ip: 'test', kind: 'user' as const, userId: u!.id, userName: tag, email: `${tag}@example.test`, platformAdmin: false, householdId: hid, role, unlocked: false });
  return { uid: u!.id, hid, ids, ctx };
};

const A = await mk('a'), B = await mk('b');
const TENANT_TABLES = ['household_members', 'invitations', 'profiles', 'devices', 'event_categories', 'calendar_connections', 'synced_calendars', 'events', 'event_overrides', 'countdowns', 'tasks', 'task_completions', 'rewards', 'star_ledger', 'lists', 'list_items', 'recipes', 'meal_plan_entries', 'photo_albums', 'photos', 'ai_providers', 'ai_jobs'];

console.log('Row level security, raw SQL (connected as the web app role)');
await test('the web role is not a superuser and cannot bypass the rules', async () => {
  const r = await pool('app').query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
  assert.equal(r.rows[0].rolsuper, false); assert.equal(r.rows[0].rolbypassrls, false);
});
for (const tbl of TENANT_TABLES) {
  await test(`${tbl}: household A sees none of household B's rows`, async () => {
    const n = await withTenant(A.hid, (t) => t.one<{ n: number }>(`select count(*)::int as n from ${tbl} where household_id = $1`, [B.hid]));
    assert.equal(n!.n, 0);
  });
  await test(`${tbl}: with no household set, nothing is visible`, async () => {
    const c = await pool('app').connect();
    try { const r = await c.query(`select count(*)::int as n from ${tbl}`); assert.equal(r.rows[0].n, 0); } finally { c.release(); }
  });
}
await test('households: A cannot read household B', async () => {
  const n = await withTenant(A.hid, (t) => t.one<{ n: number }>('select count(*)::int as n from households where id = $1', [B.hid]));
  assert.equal(n!.n, 0);
});
await test('A cannot write a row that belongs to B', async () => {
  await assert.rejects(withTenant(A.hid, (t) => t.exec("insert into countdowns (household_id, title, target_date) values ($1,'x','2030-01-01')", [B.hid])), (e: unknown) => e instanceof ApiError);
});
await test('A cannot update or delete B rows (0 rows touched)', async () => {
  const r = await withTenant(A.hid, async (t) => ({ u: await t.exec("update events set title = 'hacked' where id = $1", [B.ids.ev]), d: await t.exec('delete from tasks where id = $1', [B.ids.task]) }));
  assert.deepEqual(r, { u: 0, d: 0 });
  const still = await withTenant(B.hid, (t) => t.one<{ title: string }>('select title from events where id = $1', [B.ids.ev]));
  assert.equal(still!.title, 'Secret dentist');
});
await test('A cannot point its own event at B\'s person (composite keys)', async () => {
  await assert.rejects(withTenant(A.hid, (t) => t.exec("insert into events (household_id, profile_id, title, starts_at, ends_at, tz) values ($1,$2,'x','2030-01-01T10:00Z','2030-01-01T11:00Z','UTC')", [A.hid, B.ids.person])));
});
await test('the lookup functions only answer for the exact token asked about', async () => {
  const d = await plain((t) => t.all('select * from auth_device($1)', ['not-a-real-hash']));
  assert.equal(d.length, 0);
  const m = await plain((t) => t.all<{ household_id: string }>('select * from user_memberships($1)', [A.uid]));
  assert.deepEqual(m.map((x) => x.household_id), [A.hid]);
});

console.log('Every call that takes an id, made by household A about household B');
const gone = (e: unknown) => e instanceof ApiError && ['not_found', 'in_use', 'invalid'].includes(e.code);
const probes: [string, unknown[]][] = [
  ['getEvent', [B.ids.ev]], ['updateEvent', [B.ids.ev, { title: 'hacked' }, 'all']], ['deleteEvent', [B.ids.ev]],
  ['getTask', [B.ids.task]], ['updateTask', [B.ids.task, { title: 'hacked' }]], ['setCompletion', [B.ids.task, '2030-01-01', true]],
  ['updateReward', [B.ids.reward, { title: 'hacked' }]], ['redeemReward', [B.ids.reward]],
  ['updateList', [B.ids.list, { name: 'hacked' }]], ['addItem', [B.ids.list, 'milk']], ['setItemDone', [B.ids.item, true]],
  ['getRecipe', [B.ids.recipe]], ['recipeToGrocery', [B.ids.recipe]],
  ['updateAlbum', [B.ids.album, { name: 'hacked' }]], ['addPhotos', [B.ids.album, []]],
  ['addBonusStars', [B.ids.person, 5, 'x']], ['updateProfile', [B.ids.person, { name: 'hacked' }]],
  ['updateConnection', [crypto.randomUUID(), { status: 'paused' }]], ['updateSyncedCalendar', [crypto.randomUUID(), { enabled: true }]], ['checkToken', [crypto.randomUUID()]],
  ['setDefaultAiProvider', [crypto.randomUUID()]], ['verifyAiProvider', [crypto.randomUUID()]], ['applyAiJob', [crypto.randomUUID(), []]],
];
for (const [m, a] of probes) {
  await test(`${m} on B's data is refused`, async () => {
    await assert.rejects(call(A.ctx() as never, m, a), gone);
  });
}
await test('listStarHistory about B\'s person returns nothing', async () => {
  assert.deepEqual(await call(A.ctx() as never, 'listStarHistory', [B.ids.person]), []);
});
await test('A\'s deletes of B ids leave B untouched', async () => {
  for (const [m, id] of [['deleteTask', B.ids.task], ['deleteReward', B.ids.reward], ['deleteList', B.ids.list], ['deleteItem', B.ids.item], ['deleteRecipe', B.ids.recipe], ['deleteMeal', B.ids.meal], ['deleteAlbum', B.ids.album], ['deleteCategory', B.ids.cat], ['deleteCountdown', B.ids.cd], ['deleteProfile', B.ids.person]] as const) {
    try { await call(A.ctx() as never, m, [id]); } catch (e) { assert.ok(gone(e) || (e instanceof ApiError && e.code === 'protected'), `${m}: ${e}`); }
  }
  const counts = await withTenant(B.hid, async (t) => ({
    tasks: (await t.one<{ n: number }>('select count(*)::int n from tasks'))!.n, rewards: (await t.one<{ n: number }>('select count(*)::int n from rewards'))!.n,
    recipes: (await t.one<{ n: number }>('select count(*)::int n from recipes'))!.n, meals: (await t.one<{ n: number }>('select count(*)::int n from meal_plan_entries'))!.n,
    albums: (await t.one<{ n: number }>('select count(*)::int n from photo_albums'))!.n, countdowns: (await t.one<{ n: number }>('select count(*)::int n from countdowns'))!.n,
    profiles: (await t.one<{ n: number }>("select count(*)::int n from profiles where kind='person'"))!.n, items: (await t.one<{ n: number }>('select count(*)::int n from list_items'))!.n,
  }));
  assert.deepEqual(counts, { tasks: 1, rewards: 1, recipes: 1, meals: 1, albums: 1, countdowns: 1, profiles: 1, items: 1 });
});
await test('list calls return only the caller\'s own rows', async () => {
  const evs = (await call(A.ctx() as never, 'listEvents', [{ from: '2029-12-01T00:00:00Z', to: '2030-02-01T00:00:00Z' }])) as { title: string }[];
  assert.deepEqual(evs.map((e) => e.title), ['Secret dentist']); // A's own event is A's, and B's is not in the list
  assert.equal(evs.length, 1);
  const lists = (await call(A.ctx() as never, 'listLists', [])) as { id: string; items: { text: string }[] }[];
  assert.ok(!lists.some((l) => l.items.some((i) => i.text === 'Secret milk' && l.id === B.ids.list)));
  const profiles = (await call(A.ctx() as never, 'listProfiles', [])) as { id: string }[];
  assert.ok(!profiles.some((p) => p.id === B.ids.person));
  const members = (await call(A.ctx() as never, 'listMembers', [])) as { members: { email: string }[] };
  assert.ok(members.members.every((m) => !m.email.startsWith('b@')));
});

console.log('Roles');
await test('a viewer can read but not change anything', async () => {
  await call(A.ctx('viewer') as never, 'listEvents', [{ from: '2029-12-01T00:00:00Z', to: '2030-02-01T00:00:00Z' }]);
  for (const [m, a] of [['createCountdown', [{ title: 'x', targetDate: '2030-01-01', emoji: '', showOnDisplay: true }]], ['addItem', [A.ids.list, 'x']], ['setCompletion', [A.ids.task, '2030-01-01', true]], ['deleteEvent', [A.ids.ev]]] as const)
    await assert.rejects(call(A.ctx('viewer') as never, m, a as unknown[]), (e: unknown) => e instanceof ApiError && e.code === 'forbidden', m);
});
await test('an adult cannot do owner-only things', async () => {
  await assert.rejects(call(A.ctx('adult') as never, 'exportAll', []), (e: unknown) => e instanceof ApiError && e.code === 'forbidden');
});
await test('a signed-out caller is refused by every call except the public ones', async () => {
  const anon = { jar: { get: () => undefined, set: () => {}, delete: () => {} }, ip: 'test-anon', kind: 'anon' as const, platformAdmin: false, unlocked: false };
  const open = new Set(['features', 'getSession', 'signUp', 'signIn', 'signOut', 'startPairing', 'pairingStatus', 'previewInvitation', 'startDemo', 'requestPasswordReset', 'resetPassword', 'verifyEmail']);
  for (const [name, d] of Object.entries(registry)) {
    if (d.level === 'public') { assert.ok(open.has(name), `${name} is public but not on the allowed list`); continue; }
    await assert.rejects(call(anon as never, name, []), (e: unknown) => e instanceof ApiError && e.code === 'unauthenticated', name);
  }
});
await test('a paired screen that has not entered the PIN cannot do adult things', async () => {
  await withTenant(A.hid, (t) => t.exec("update households set parent_pin_hash = 'x' where id = $1", [A.hid]));
  const dev = { jar: { get: () => undefined, set: () => {}, delete: () => {} }, ip: 'test', kind: 'device' as const, householdId: A.hid, deviceId: crypto.randomUUID(), platformAdmin: false, unlocked: false };
  await call(dev as never, 'listEvents', [{ from: '2029-12-01T00:00:00Z', to: '2030-02-01T00:00:00Z' }]);
  await assert.rejects(call(dev as never, 'createTasks', [{ profileIds: [A.ids.person], title: 'x', emoji: '', kind: 'chore', timeOfDay: null, dueTime: null, startsOn: '2030-01-01', endsOn: null, rrule: null, starValue: 1 }]), (e: unknown) => e instanceof ApiError && e.code === 'locked');
  await call({ ...dev, unlocked: true } as never, 'createTasks', [{ profileIds: [A.ids.person], title: 'x', emoji: '', kind: 'chore', timeOfDay: null, dueTime: null, startsOn: '2030-01-01', endsOn: null, rrule: null, starValue: 1 }]);
});

console.log('Stars cannot go below zero, and spent stars cannot be taken back');
await test('earn, spend, then un-check is refused; balance never negative', async () => {
  const day = '2030-02-02';
  const r1 = (await call(A.ctx() as never, 'setCompletion', [A.ids.task, day, true])) as { balance: number };
  assert.equal(r1.balance, 3);
  await call(A.ctx() as never, 'addBonusStars', [A.ids.person, 2, 'bonus']);
  await assert.rejects(call(A.ctx() as never, 'redeemReward', [A.ids.reward]).then(() => call(A.ctx() as never, 'redeemReward', [A.ids.reward])), (e: unknown) => e instanceof ApiError && e.code === 'not_enough_stars');
  await assert.rejects(call(A.ctx() as never, 'setCompletion', [A.ids.task, day, false]), (e: unknown) => e instanceof ApiError && e.code === 'stars_spent');
  const bal = await withTenant(A.hid, (t) => t.one<{ star_balance: number }>('select star_balance from profiles where id = $1', [A.ids.person]));
  assert.ok(bal!.star_balance >= 0);
});

console.log('Account deletion really deletes');
await test('deleting an account removes the user, the household and everything in it', async () => {
  await call(B.ctx() as never, 'deleteAccount', []);
  const left = await plain((t) => t.one<{ u: number; h: number; e: number }>('select (select count(*)::int from users where id = $1) u, (select count(*)::int from households where id = $2) h, (select count(*)::int from events where household_id = $2) e', [B.uid, B.hid]), 'worker');
  assert.deepEqual(left, { u: 0, h: 0, e: 0 });
});

await call(A.ctx() as never, 'deleteAccount', []).catch(() => {});
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failed:\n - ' + failures.join('\n - ')); process.exit(1); }
process.exit(0);
