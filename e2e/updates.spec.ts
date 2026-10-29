import { test, expect, signUp, rpc, must, makeAdmin, checkProblems, a11y } from './fixtures';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const DIR = '/tmp/fc-updates-e2e';              // UPDATE_DIR in .env.local
const CURRENT = '1111111111111111111111111111111111111111'; // APP_COMMIT in .env.local
const NEWER = '2222222222222222222222222222222222222222';
const fh = async (body: object) => (await fetch('http://localhost:4012/_ctl', { method: 'POST', body: JSON.stringify(body) })).json();
const FRESH = { latest: NEWER, commitsStatus: 200, compare: 'ahead', changes: ['Add the family photo wall', 'Fix the chore reminder time', 'Faster calendar loading'] };

/** What the updater on the server does for its heartbeat and status, done by hand so the screen can be tested alone. */
const heartbeat = (on = true) => on
  ? writeFileSync(`${DIR}/heartbeat.json`, JSON.stringify({ at: new Date().toISOString(), head: CURRENT, branch: 'main' }))
  : rmSync(`${DIR}/heartbeat.json`, { force: true });
const setStatus = (o: object) => writeFileSync(`${DIR}/status.json`, JSON.stringify({ id: 'x', state: 'running', step: 'build', message: '', from: CURRENT, to: NEWER, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: [], ...o }));

test.beforeEach(async () => {
  mkdirSync(DIR, { recursive: true });
  for (const f of ['request', 'status.json', 'heartbeat.json']) rmSync(`${DIR}/${f}`, { force: true });
  await fh(FRESH);
});

async function adminHouse(page: any, name: string) { const em = await signUp(page, { household: name }); makeAdmin(em); return em; }

test('UP-1 the page shows the version, finds what is new on GitHub, and says how to install the helper when it is missing', async ({ page, problems }) => {
  await adminHouse(page, 'Update Look House');
  await page.goto('/settings/updates');
  await expect(page.getByRole('heading', { name: 'Software updates' })).toBeVisible();
  await expect(page.getByLabel('Version in use')).toContainText('1111111');
  await expect(page.getByText('3 changes are ready')).toBeVisible();
  for (const c of ['Add the family photo wall', 'Fix the chore reminder time', 'Faster calendar loading']) await expect(page.getByRole('listitem').filter({ hasText: c })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update now' })).toBeDisabled();
  await expect(page.getByLabel('Command: sudo ./scripts/install-updater.sh')).toBeVisible();
  await a11y(page);
  checkProblems(problems);
});

test('UP-2 Update now asks first, writes the request for the updater, follows its progress, and ends on the new version', async ({ page, problems }) => {
  await adminHouse(page, 'Update Run House');
  heartbeat(true);
  await page.goto('/settings/updates');
  await expect(page.getByText('3 changes are ready')).toBeVisible();
  await expect(page.getByLabel('Command: sudo ./scripts/install-updater.sh')).toHaveCount(0);
  await page.getByRole('button', { name: 'Update now' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('A backup is saved first');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  expect(existsSync(`${DIR}/request`)).toBe(false);   // cancelling does nothing
  await page.getByRole('button', { name: 'Update now' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Update now' }).click();
  await expect(page.getByLabel('Update in progress')).toBeVisible();
  const req = readFileSync(`${DIR}/request`, 'utf8');
  expect(req).toMatch(/^id=[0-9a-f-]{36}\nforce=0\n$/);
  // a second request while one is waiting is refused
  const again = await rpc(page, 'requestUpdate');
  expect(again.ok).toBe(false); expect(again.error?.code).toBe('busy');
  // the updater takes it and reports
  rmSync(`${DIR}/request`);
  setStatus({ state: 'running', step: 'build', message: 'Building the new version. This takes a few minutes; the app keeps running meanwhile.' });
  await expect(page.getByLabel('Update in progress')).toContainText('Building the new version', { timeout: 10000 });
  await a11y(page);
  setStatus({ state: 'done', step: 'done', message: 'Now running 2222222.' });
  await expect(page.getByText('Updated to 2222222')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Reload this page' })).toBeVisible();
  checkProblems(problems);
});

test('UP-3 only the person who runs the server, with the PIN, can see or start updates', async ({ page, browser, problems }) => {
  const em = await adminHouse(page, 'Update Rules House');
  heartbeat(true);
  // someone who is not the server owner
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.9' } });
  const other = await ctx.newPage();
  await signUp(other, { household: 'Update Other House' });
  for (const m of ['getUpdateStatus', 'checkForUpdate', 'requestUpdate']) { const r = await rpc(other, m); expect(r.ok, m).toBe(false); expect(r.error?.code, m).toBe('forbidden'); }
  await other.goto('/settings/updates');
  await expect(other.getByText('Only the person who set up this server can update it')).toBeVisible();
  await ctx.close();
  // the server owner, once the PIN has timed out
  await page.context().clearCookies({ name: 'fc_unlock' });
  for (const m of ['checkForUpdate', 'requestUpdate']) { const r = await rpc(page, m); expect(r.ok, m).toBe(false); expect(r.error?.code, m).toBe('locked'); }
  expect(existsSync(`${DIR}/request`)).toBe(false);
  void em;
  checkProblems(problems);
});

test('UP-4 when GitHub cannot be reached or says no, the page says what to do', async ({ page, problems }) => {
  await adminHouse(page, 'Update Trouble House');
  await fh({ commitsStatus: 403 });
  await page.goto('/settings/updates');
  await expect(page.getByText('GitHub is limiting checks from this address')).toBeVisible();
  await fh({ commitsStatus: 404 });
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText(/no branch “main” in owner\/family/)).toBeVisible();
  await fh({ commitsStatus: 500 });
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('GitHub answered 500')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0);
  checkProblems(problems.filter((p) => !/403|404|500|Failed to load resource/.test(p)));
});

test('UP-5 already newest, newer than GitHub, and a version GitHub does not know', async ({ page, problems }) => {
  await adminHouse(page, 'Update Same House');
  await fh({ latest: CURRENT });
  await page.goto('/settings/updates');
  await expect(page.getByText('You have the newest version')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update now' })).toHaveCount(0);
  await fh({ latest: NEWER, compare: 'behind' });
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('This copy is newer than what GitHub has.')).toBeVisible();
  await fh({ latest: NEWER, compare: 'unknown' });
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByText('A different version is on GitHub')).toBeVisible();
  await expect(page.getByText(/does not recognise the version in use/)).toBeVisible();
  checkProblems(problems);
});

test('UP-6 a failed or rolled-back update is explained, with what the updater said', async ({ page, problems }) => {
  await adminHouse(page, 'Update Failed House');
  heartbeat(true);
  setStatus({ state: 'rolled_back', step: 'rollback', message: 'The new version did not start, so the old version (1111111) is running again.', log: ['12:00:01 [running/build] Building', '12:03:10 migrate failed'] });
  await page.goto('/settings/updates');
  await expect(page.getByText('The update did not work, so the old version is back')).toBeVisible();
  await page.getByText('What the updater said').click();
  await expect(page.getByText('12:03:10 migrate failed')).toBeVisible();
  await a11y(page);
  setStatus({ state: 'failed', step: 'check', message: 'Files in this folder were changed by hand, so nothing was touched.' });
  await page.reload();
  await expect(page.getByText('The update stopped')).toBeVisible();
  // a stuck run does not block a new request once it has ended
  const r = await rpc(page, 'requestUpdate');
  expect(r.ok).toBe(true);
  rmSync(`${DIR}/request`, { force: true });
  checkProblems(problems);
});

test('UP-7 a stopped updater is noticed, and requests are refused with a clear reason', async ({ page, problems }) => {
  await adminHouse(page, 'Update Stopped House');
  writeFileSync(`${DIR}/heartbeat.json`, JSON.stringify({ at: new Date(Date.now() - 10 * 60_000).toISOString(), head: CURRENT, branch: 'main' }));
  const r = await rpc(page, 'requestUpdate');
  expect(r.ok).toBe(false); expect(r.error?.code).toBe('not_installed'); expect(r.error?.message).toContain('install-updater.sh');
  const st = await must<any>(page, 'getUpdateStatus');
  expect(st.installed).toBe(false);
  expect(JSON.stringify(st)).not.toContain('/tmp/fc-updates-e2e'); // no server paths leak to the screen
  checkProblems(problems);
});
