import { test, expect, signUp, must, rpc, isoDay, sql, checkProblems, joinAs } from './fixtures';

const G = 'http://localhost:4010';
const fg = async (body: object) => (await fetch(`${G}/_ctl`, { method: 'POST', body: JSON.stringify(body) })).json();
const TZ = 'America/New_York';
const dt = (days: number, hour = 15) => `${isoDay(days)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const win = () => ({ from: dt(-1, 0), to: dt(30, 0) });
const titles = async (page: any) => (await must<any[]>(page, 'listEvents', [win()])).map((o) => o.title);

async function connect(page: any, mode: 'Show events only' | 'Both ways' = 'Show events only') {
  await page.goto('/settings/calendars');
  await page.getByText(mode, { exact: true }).click();
  await page.getByRole('button', { name: /Connect Google/ }).click();
  await page.waitForURL(/settings\/calendars/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible({ timeout: 15000 });
  // the first sync runs in the background; wait for the calendars to arrive
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).length, { timeout: 15000 }).toBeGreaterThan(0);
  const conn = (await must<any[]>(page, 'listConnections'))[0];
  return conn;
}
const gEvent = (id: string, summary: string, day: number, extra: object = {}) => ({ id, summary, status: 'confirmed', start: { dateTime: dt(day, 15), timeZone: 'UTC' }, end: { dateTime: dt(day, 16), timeZone: 'UTC' }, ...extra });

test.beforeEach(async () => { await fg({ set: { down: false, rotate: false, expireSync: false }, unrevoke: true }); });

test.describe('F02 Google Calendar one way', () => {
  test('F02-H1/H2/E1/E2/E3/E4 connect, sync, repeating, all-day, resync, read-only', async ({ page, problems }) => {
    await signUp(page, { tz: TZ });
    const stamp = Date.now().toString(36);
    await fg({ put: gEvent('g-one-' + stamp, 'Dentist ' + stamp, 3) });
    await fg({ put: gEvent('g-rec-' + stamp, 'Piano ' + stamp, 2, { recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3', `EXDATE:${isoDay(9).replace(/-/g, '')}T150000Z`] }) });
    await fg({ put: { id: 'g-all-' + stamp, summary: 'Holiday ' + stamp, status: 'confirmed', start: { date: isoDay(5) }, end: { date: isoDay(6) } } });
    const conn = await connect(page);
    await page.goto('/settings/calendars');
    await expect(page.getByText(/family@gmail\.com/).first()).toBeVisible();
    await must(page, 'reloadConnection', [conn.id]);
    let occ = (await must<any[]>(page, 'listEvents', [win()]));
    expect(occ.filter((o) => o.title === 'Dentist ' + stamp)).toHaveLength(1);
    // F02-E1 weekly x3 with the middle one removed by EXDATE: two left
    expect(occ.filter((o) => o.title === 'Piano ' + stamp)).toHaveLength(2);
    // F02-E2 all-day shows on the right household day
    const hol = occ.find((o) => o.title === 'Holiday ' + stamp);
    expect(hol.allDay).toBe(true);
    expect(String(hol.startsAt).slice(0, 10)).toBe(isoDay(5));
    // F02-H2 a new event in Google appears after a sync; a cancelled one disappears
    await fg({ put: gEvent('g-new-' + stamp, 'Added later ' + stamp, 6) });
    await fg({ cancel: 'g-one-' + stamp });
    await must(page, 'reloadConnection', [conn.id]);
    const t = await titles(page);
    expect(t).toContain('Added later ' + stamp);
    expect(t).not.toContain('Dentist ' + stamp);
    // F02-E3 token expired (410): full resync, no duplicates
    await fg({ set: { expireSync: true } });
    await must(page, 'reloadConnection', [conn.id]);
    await must(page, 'reloadConnection', [conn.id]);
    const again = (await titles(page)).filter((x) => x === 'Added later ' + stamp);
    expect(again).toHaveLength(1);
    // F02-E4 editing a Google event in one-way mode is refused with a reason
    const ev = (await must<any[]>(page, 'listEvents', [win()])).find((o) => o.title === 'Added later ' + stamp);
    const r = await rpc(page, 'updateEvent', [ev.eventId, { title: 'Nope' }, 'all']);
    expect(r.ok).toBe(false);
    expect(r.error!.message.length).toBeGreaterThan(10);
    await page.goto(`/calendar/event/${ev.eventId}`);
    await expect(page.getByText('This event comes from Google Calendar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    checkProblems(problems);
  });

  test('F02-N1/N3 refusing on Google\'s screen, or a wrong state value, connects nothing', async ({ page, allowProblems }) => {
    await signUp(page, { tz: TZ });
    await page.goto('/api/v1/sync/oauth/google/callback?error=access_denied&state=whatever');
    await expect(page).toHaveURL(/settings\/calendars/);
    await page.goto('/api/v1/sync/oauth/google/callback?code=abc&state=forged');
    await expect(page).toHaveURL(/settings\/calendars/);
    expect(await must<any[]>(page, 'listConnections')).toHaveLength(0);
    // signed out, the return address does not work at all
    await page.context().clearCookies();
    const res = await page.request.get('/api/v1/sync/oauth/google/callback?code=abc&state=x', { maxRedirects: 0 });
    expect(res.status()).toBeLessThan(500);
    allowProblems();
  });

  test('F02-N2 a viewer cannot connect or remove', async ({ page, browser, allowProblems }) => {
    await signUp(page, { tz: TZ });
    const conn = await connect(page);
    const v = await joinAs(page, browser, 'Can only look');
    expect((await rpc(v.page, 'startGoogleConnect', ['one_way'])).ok).toBe(false);
    expect((await rpc(v.page, 'removeConnection', [conn.id])).ok).toBe(false);
    expect((await rpc(v.page, 'reloadConnection', [conn.id])).ok).toBe(false);
    await v.ctx.close();
    allowProblems();
  });

  test('F02-N3b another household cannot touch this connection', async ({ page, browser, allowProblems }) => {
    await signUp(page, { tz: TZ });
    const conn = await connect(page);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.7.7' } });
    const b = await ctx.newPage();
    await signUp(b, { household: 'Other House' });
    for (const m of ['reloadConnection', 'checkToken']) expect((await rpc(b, m, [conn.id])).ok, m).toBe(false);
    await rpc(b, 'removeConnection', [conn.id]); // removing something you cannot see does nothing (it may say "ok")
    await rpc(b, 'updateConnection', [conn.id, { mode: 'two_way', status: 'paused' }]);
    expect(sql(`select count(*) from calendar_connections where id='${conn.id}'`)).toBe('1');
    expect(sql(`select mode||status from calendar_connections where id='${conn.id}'`)).toBe('one_wayok');
    expect((await must<any[]>(b, 'listConnections'))).toHaveLength(0);
    await ctx.close();
    allowProblems();
  });

  test('F02 removing the account removes its events and revokes the token', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const stamp = Date.now().toString(36);
    await fg({ put: gEvent('g-rm-' + stamp, 'Remove me ' + stamp, 4) });
    const conn = await connect(page);
    await must(page, 'reloadConnection', [conn.id]);
    expect(await titles(page)).toContain('Remove me ' + stamp);
    await must(page, 'removeConnection', [conn.id]);
    expect(await titles(page)).not.toContain('Remove me ' + stamp);
    expect(sql(`select count(*) from calendar_connections where id='${conn.id}'`)).toBe('0');
  });

  test('F02-H3 token problems are shown, and Reconnect brings it back', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const conn = await connect(page);
    await fg({ revokeAll: true });
    await must(page, 'checkToken', [conn.id]);
    await page.goto('/settings/calendars');
    await expect(page.getByRole('button', { name: /Reconnect/ }).first()).toBeVisible();
    await fg({ unrevoke: true });
    await page.getByRole('button', { name: /Reconnect/ }).first().click();
    await page.waitForURL(/settings\/calendars/);
    await expect(page.getByText('Reconnected').first().or(page.getByText(/connected/i).first())).toBeVisible({ timeout: 15000 });
    expect((await must<any[]>(page, 'listConnections'))[0].status).toBe('ok');
  });
});

test.describe('F04 two way', () => {
  test('F04-H1/E1/N1 events saved to Google, edits patched, clashes refused, Google down keeps nothing half-done', async ({ page, problems, allowProblems }) => {
    await signUp(page, { tz: TZ });
    const conn = await connect(page, 'Both ways');
    expect(conn.mode).toBe('two_way');
    const cal = (await must<any[]>(page, 'listSyncedCalendars'))[0];
    await must(page, 'updateSyncedCalendar', [cal.id, { enabled: true, isDefaultTarget: true }]);
    const ps = await must<any[]>(page, 'listProfiles');
    const family = ps.find((p) => p.kind === 'household').id;
    const base = { profileId: family, categoryId: null, description: '', location: '', allDay: false, tz: TZ, rrule: null, alertMinutes: [] };
    const stamp = Date.now().toString(36);
    const made = await must<any>(page, 'createEvent', [{ ...base, title: 'Two way ' + stamp, startsAt: dt(3), endsAt: dt(3, 16), saveToCalendarId: cal.id }]);
    expect(made.source).toBe('synced');
    let log = (await fg({})).log as string[];
    expect(log.some((l) => l.startsWith('POST /calendar/v3/calendars/family%40gmail.com/events'))).toBe(true);
    await must(page, 'updateEvent', [made.id, { title: 'Two way renamed ' + stamp }, 'all']);
    log = (await fg({})).log;
    expect(log.some((l) => l.startsWith('PATCH'))).toBe(true);
    // F04-E1: Google changed the event in the meantime (new etag): our edit is refused, nothing overwritten
    const gid = sql(`select external_id from events where id='${made.id}'`);
    await fg({ put: { ...gEvent(gid, 'Changed in Google ' + stamp, 3) } });
    const clash = await rpc(page, 'updateEvent', [made.id, { title: 'Stale edit ' + stamp }, 'all']);
    expect(clash.ok, 'a stale edit must not overwrite Google').toBe(false);
    // F04-N1: Google down while saving
    await fg({ set: { down: true } });
    const before = (await must<any[]>(page, 'listEvents', [win()])).length;
    const down = await rpc(page, 'createEvent', [{ ...base, title: 'While down ' + stamp, startsAt: dt(4), endsAt: dt(4, 16), saveToCalendarId: cal.id }]);
    const after = await must<any[]>(page, 'listEvents', [win()]);
    if (down.ok) expect(after.filter((o) => o.title === 'While down ' + stamp)).toHaveLength(1);
    else { expect(down.error!.message.length).toBeGreaterThan(10); expect(after.length).toBe(before); }
    await fg({ set: { down: false } });
    allowProblems();
  });
});

test.describe('F02 / F04 calendar choices and upgrades', () => {
  test('F02-E6 turn every calendar off and one back on; F04-E2 upgrade one way to both ways keeps events and one connection', async ({ page, problems }) => {
    await signUp(page, { tz: TZ });
    const stamp = Date.now().toString(36);
    await fg({ put: gEvent('g-e6-' + stamp, 'Choir ' + stamp, 4) });
    const conn = await connect(page);
    await must(page, 'reloadConnection', [conn.id]);
    expect(await titles(page)).toContain('Choir ' + stamp);
    // F02-E6: all calendars off => their events leave the calendar; back on + reload => they return
    const cals = await must<any[]>(page, 'listSyncedCalendars');
    for (const c of cals) await must(page, 'updateSyncedCalendar', [c.id, { enabled: false }]);
    await must(page, 'reloadConnection', [conn.id]);
    expect(await titles(page)).not.toContain('Choir ' + stamp);
    await must(page, 'updateSyncedCalendar', [cals[0].id, { enabled: true }]);
    await must(page, 'reloadConnection', [conn.id]);
    expect((await titles(page)).filter((x) => x === 'Choir ' + stamp)).toHaveLength(1);
    // F04-E2: signing in again with "Both ways" upgrades the same connection
    await connect(page, 'Both ways');
    const conns = await must<any[]>(page, 'listConnections');
    expect(conns).toHaveLength(1);
    expect(conns[0].mode).toBe('two_way');
    expect((await titles(page)).filter((x) => x === 'Choir ' + stamp)).toHaveLength(1);
    checkProblems(problems);
  });
});
