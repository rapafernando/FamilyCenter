import { test, expect, signUp, must, rpc, isoDay, sql, checkProblems } from './fixtures';

const G = 'http://localhost:4010';
const fg = async (body: object) => (await fetch(`${G}/_ctl`, { method: 'POST', body: JSON.stringify(body) })).json();
const TZ = 'America/New_York';

test.beforeEach(async () => { await fg({ set: { down: false, rotate: false, expireSync: false, writeError: null }, unrevoke: true }); });
test.afterAll(async () => { await fg({ set: { writeError: null } }); });

async function connect(page: any, viewOnly = false) {
  await page.goto('/settings/calendars');
  if (viewOnly) await page.getByText('Show events only', { exact: true }).click();
  await page.getByRole('button', { name: /Connect Google/ }).click();
  await page.waitForURL(/settings\/calendars/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).length, { timeout: 15000 }).toBeGreaterThan(0);
  if (!viewOnly) await expect.poll(async () => (await must<any[]>(page, 'listSyncedCalendars')).some((c) => c.isDefaultTarget), { timeout: 15000 }).toBe(true);
  return (await must<any[]>(page, 'listConnections'))[0];
}
async function pushViaRpc(page: any, title: string, calId: string) {
  const ps = await must<any[]>(page, 'listProfiles');
  return rpc(page, 'createEvent', [{ profileId: ps.find((p: any) => p.kind === 'household').id, categoryId: null, title, description: '', location: '', allDay: false, startsAt: `${isoDay(2)}T15:00:00.000Z`, endsAt: `${isoDay(2)}T16:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [], saveToCalendarId: calId }]);
}

test('GD-1 a healthy connection passes every check, and the test event is created and removed again', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  await page.getByRole('button', { name: 'Test saving to Google' }).click();
  const box = page.getByRole('status', { name: 'Result of the test' });
  await expect(box).toContainText('Saving to Google works.');
  await expect(box).toContainText('The test event was removed again');
  const log = (await fg({})).log as string[];
  const posts = log.filter((l) => l.startsWith('POST /calendar/v3/calendars/family%40gmail.com/events'));
  const dels = log.filter((l) => l.startsWith('DELETE /calendar/v3/calendars/family%40gmail.com/events/'));
  expect(posts.length).toBeGreaterThan(0); expect(dels.length).toBeGreaterThan(0);
  expect(sql(`select count(*) from events where title like 'FamilyCenter test%'`)).toBe('0');
  checkProblems(problems);
});

test('GD-2 a view-only connection is told, in plain words, what to turn on', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  await connect(page, true);
  await page.getByRole('button', { name: 'Test saving to Google' }).click();
  const box = page.getByRole('status', { name: 'Result of the test' });
  await expect(box).toContainText('does not work yet');
  await expect(box).toContainText('Let changes here go back to Google');
  checkProblems(problems);
});

test('GD-3 Google refusing for missing permission is reported as such, in the test and on the event', async ({ page, problems, allowProblems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  await fg({ set: { writeError: { status: 403, reason: 'insufficientPermissions', message: 'Insufficient Permission' } } });
  await page.getByRole('button', { name: 'Test saving to Google' }).click();
  const box = page.getByRole('status', { name: 'Result of the test' });
  await expect(box).toContainText('does not work yet');
  await expect(box).toContainText('permission to edit events');
  const target = (await must<any[]>(page, 'listSyncedCalendars')).find((c) => c.isDefaultTarget);
  const r = await pushViaRpc(page, 'Refused ' + Date.now().toString(36), target.id);
  expect(r.ok).toBe(false);
  expect(r.error?.message).toContain('permission to edit events');
  expect(r.error?.message).not.toContain('could not be reached');
  allowProblems();
});

test('GD-4 a Calendar API that is switched off in the Google Cloud project is named as the cause', async ({ page, problems, allowProblems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  await fg({ set: { writeError: { status: 403, reason: 'accessNotConfigured', message: 'Google Calendar API has not been used in project 1 before or it is disabled.' } } });
  await page.getByRole('button', { name: 'Test saving to Google' }).click();
  await expect(page.getByRole('status', { name: 'Result of the test' })).toContainText('Google Calendar API is switched off');
  allowProblems();
});

test('GD-5 no calendar chosen for new events is reported', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  const conn = await connect(page);
  sql(`update synced_calendars set is_default_target = false where connection_id = '${conn.id}'`);
  const r = await must<any>(page, 'testGoogleWrite', [conn.id]);
  expect(r.ok).toBe(false);
  expect(r.steps.at(-1).label).toContain('A calendar is chosen');
  checkProblems(problems);
});

async function localEvent(page: any, title: string) {
  const ps = await must<any[]>(page, 'listProfiles');
  const r = await rpc(page, 'createEvent', [{ profileId: ps.find((p: any) => p.kind === 'household').id, categoryId: null, title, description: '', location: '', allDay: false, startsAt: `${isoDay(2)}T15:00:00.000Z`, endsAt: `${isoDay(2)}T16:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [], saveToCalendarId: null }]);
  expect(r.ok).toBe(true);
  return (r as any).result?.id ?? sql(`select id from events where title = '${title}'`);
}
const row = (title: string) => sql(`select source || ',' || coalesce(external_id,'') from events where title = '${title}'`);

test('GS-1 events that only exist in the app are sent to Google from Settings, once, and nothing is left behind', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  const a = 'Only here A ' + Date.now().toString(36), b = 'Only here B ' + Date.now().toString(36);
  await localEvent(page, a); await localEvent(page, b);
  expect(row(a)).toBe('local,');
  await page.goto('/settings/calendars');
  await page.getByRole('button', { name: 'Send them to Google' }).click();
  await expect(page.getByText('Sent 2 of 2 events to Google.')).toBeVisible();
  expect(row(a)).toMatch(/^synced,new-/); expect(row(b)).toMatch(/^synced,new-/);
  expect(sql(`select count(*) from events where title in ('${a}','${b}')`)).toBe('2'); // a following sync does not duplicate them
  await must(page, 'reloadConnection', [(await must<any[]>(page, 'listConnections'))[0].id]);
  expect(sql(`select count(*) from events where title in ('${a}','${b}')`)).toBe('2');
  await page.getByRole('button', { name: 'Send them to Google' }).click();
  await expect(page.getByText('Nothing to send.')).toBeVisible();
  checkProblems(problems);
});

test('GS-2 an app-only event says so on its own page, can be sent from there, and then says where it is in Google', async ({ page, problems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  const t = 'One event ' + Date.now().toString(36);
  const id = await localEvent(page, t);
  await page.goto(`/calendar/event/${id}`);
  await expect(page.getByRole('note').filter({ hasText: 'only in this app' })).toBeVisible();
  await page.getByRole('button', { name: 'Send to Google Calendar' }).click();
  await expect(page.getByRole('note').filter({ hasText: 'saved in Google Calendar' })).toBeVisible();
  expect(row(t)).toMatch(/^synced,new-/);
  checkProblems(problems);
});

test('GS-3 when Google refuses, the event stays in the app and the reason is shown', async ({ page, problems, allowProblems }) => {
  await signUp(page, { tz: TZ });
  await connect(page);
  const t = 'Refused send ' + Date.now().toString(36);
  const id = await localEvent(page, t);
  await fg({ set: { writeError: { status: 403, reason: 'insufficientPermissions', message: 'Insufficient Permission' } } });
  await page.goto(`/calendar/event/${id}`);
  await page.getByRole('button', { name: 'Send to Google Calendar' }).click();
  await expect(page.getByText('permission to edit events').first()).toBeVisible();
  expect(row(t)).toBe('local,');
  allowProblems();
});
