import { test, expect, signUp, must, rpc, isoDay, sql, checkProblems } from './fixtures';

const G = 'http://localhost:4010';
const fg = async (body: object) => (await fetch(`${G}/_ctl`, { method: 'POST', body: JSON.stringify(body) })).json();
const TZ = 'America/New_York';
const POSTED = 'POST /calendar/v3/calendars/family%40gmail.com/events';

test.beforeEach(async () => { await fg({ set: { down: false, rotate: false, expireSync: false }, unrevoke: true }); });

/** Connects the way a person does, leaving "What should it do?" on whatever the screen offers first. */
async function connectDefault(page: any) {
  await page.goto('/settings/calendars');
  await page.getByRole('button', { name: /Connect Google/ }).click();
  await page.waitForURL(/settings\/calendars/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).length, { timeout: 15000 }).toBeGreaterThan(0);
  return (await must<any[]>(page, 'listConnections'))[0];
}
/** Adds an event on the screen without touching the Google choice. */
async function addOnScreen(page: any, title: string) {
  await page.goto(`/calendar/event/new?date=${isoDay(1)}`);
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Family' }).click();
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.waitForURL(/\/calendar(\?|$)/);
}
const evRow = (title: string) => sql(`select source || ',' || coalesce(external_id,'') from events where title = '${title}'`);

test('GW-1 connecting with the screen\'s first choice, an event added here goes to Google without touching anything', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  const conn = await connectDefault(page);
  expect(conn.mode).toBe('two_way');
  // a calendar to receive new events was chosen for them: the account's main one
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).find((c) => c.isDefaultTarget)?.externalId, { timeout: 15000 }).toBe('family@gmail.com');
  const t = 'Pushed ' + Date.now().toString(36);
  await page.goto(`/calendar/event/new?date=${isoDay(1)}`);
  await expect(page.getByLabel('Also save to Google Calendar')).toHaveValue(/.+/); // preselected, not "No"
  await addOnScreen(page, t);
  expect(evRow(t)).toMatch(/^synced,new-/);
  expect(((await fg({})).log as string[]).some((l) => l.startsWith(POSTED))).toBe(true);
  checkProblems(problems);
});

test('GW-2 a view-only connection says so on the event form; switching to both ways and signing in again fixes it', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  await page.goto('/settings/calendars');
  await page.getByText('Show events only', { exact: true }).click();
  await page.getByRole('button', { name: /Connect Google/ }).click();
  await page.waitForURL(/settings\/calendars/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).length, { timeout: 15000 }).toBeGreaterThan(0);
  // the form explains why nothing goes to Google
  await page.goto(`/calendar/event/new?date=${isoDay(1)}`);
  await expect(page.getByRole('note')).toContainText('connected for viewing only');
  await expect(page.getByLabel('Also save to Google Calendar')).toHaveCount(0);
  const local = 'Local only ' + Date.now().toString(36);
  await addOnScreen(page, local);
  expect(evRow(local)).toBe('local,');
  // turn on "go back to Google": Google must approve editing, so the connection asks to sign in again
  await page.goto('/settings/calendars');
  await page.getByText('Let changes here go back to Google').click();
  await page.getByRole('button', { name: /Reconnect/ }).first().click();
  await page.waitForURL(/settings\/calendars/);
  await expect.poll(async () => (await must<any[]>(page, 'listConnections'))[0].status, { timeout: 15000 }).not.toBe('needs_reauth');
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).some((c) => c.isDefaultTarget), { timeout: 15000 }).toBe(true);
  const t = 'After upgrade ' + Date.now().toString(36);
  await addOnScreen(page, t);
  expect(evRow(t)).toMatch(/^synced,new-/);
  checkProblems(problems);
});

test('GW-3 a both-ways connection with no calendar chosen still saves to Google, and the choice comes back by itself', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  const conn = await connectDefault(page);
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).some((c) => c.isDefaultTarget), { timeout: 15000 }).toBe(true);
  sql(`update synced_calendars set is_default_target = false where connection_id = '${conn.id}'`); // how connections made before this fix look
  const t = 'No default ' + Date.now().toString(36);
  await addOnScreen(page, t);
  expect(evRow(t)).toMatch(/^synced,new-/);
  await must(page, 'reloadConnection', [conn.id]);
  expect((await must<any[]>(page, 'listSyncedCalendars')).filter((c) => c.isDefaultTarget)).toHaveLength(1);
  checkProblems(problems);
});

test('GW-4 a read-only Google calendar (holidays) is never offered, and a forced request is refused with the reason', async ({ page, problems, allowProblems }) => {
  await signUp(page, { tz: TZ });
  await connectDefault(page);
  const cals = await must<any[]>(page, 'listSyncedCalendars');
  const hol = cals.find((c) => c.externalId.startsWith('holidays'));
  expect(hol.canWrite).toBe(false);
  await must(page, 'updateSyncedCalendar', [hol.id, { enabled: true }]);
  const set = await rpc(page, 'updateSyncedCalendar', [hol.id, { isDefaultTarget: true }]);
  expect(set.ok).toBe(false); expect(set.error?.code).toBe('read_only');
  await page.goto(`/calendar/event/new?date=${isoDay(1)}`);
  const options = await page.getByLabel('Also save to Google Calendar').locator('option').allInnerTexts();
  expect(options.join('|')).not.toContain('holidays');
  expect(options.join('|')).not.toContain('US holidays');
  const ps = await must<any[]>(page, 'listProfiles');
  const push = await rpc(page, 'createEvent', [{ profileId: ps.find((p) => p.kind === 'household').id, categoryId: null, title: 'Into holidays', description: '', location: '', allDay: false, startsAt: `${isoDay(2)}T15:00:00.000Z`, endsAt: `${isoDay(2)}T16:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [], saveToCalendarId: hol.id }]);
  expect(push.ok).toBe(false); expect(push.error?.code).toBe('read_only');
  expect(evRow('Into holidays')).toBe('');
  allowProblems();
});
