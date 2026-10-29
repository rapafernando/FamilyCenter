import { test, expect, signUp, rpc, must, sql, makeAdmin, checkProblems, a11y } from './fixtures';

const G = 'http://localhost:4010';
const fg = async (body: object) => (await fetch(`${G}/_ctl`, { method: 'POST', body: JSON.stringify(body) })).json();
const CLIENT = { id: 'ui-client-1.apps.googleusercontent.com', secret: 'ui-secret-9d41' };

test.afterEach(async ({ page }) => {
  await fg({ set: { client: null }, unrevoke: true });
  await rpc(page, 'clearGoogleSetup').catch(() => {});
  sql(`delete from instance_settings where key like 'google_%'`);
});

test('GS-1 the server owner enters the Google client in Settings, it is checked, stored encrypted, and used to connect', async ({ page, problems }) => {
  const em = await signUp(page, { household: 'Google Setup House' });
  makeAdmin(em);
  await fg({ set: { client: CLIENT } });
  await page.goto('/settings/google');
  await expect(page.getByRole('heading', { name: 'Google connection' })).toBeVisible();
  await a11y(page);
  await expect(page.getByLabel('Redirect address for Google')).toHaveValue('http://localhost:3100/api/v1/sync/oauth/google/callback');
  // a wrong secret is caught by the check, not discovered later
  await page.getByLabel('Client ID').fill(CLIENT.id);
  await page.getByLabel('Client secret').fill('not-the-secret');
  await page.getByRole('button', { name: 'Save and check' }).click();
  await expect(page.getByText('Google did not accept them')).toBeVisible();
  await expect(page.getByText(/does not recognise this client ID and secret/)).toBeVisible();
  // the right one
  await page.getByLabel('Client secret').fill(CLIENT.secret);
  await page.getByRole('button', { name: 'Save and check' }).click();
  await expect(page.getByText('Google accepts them')).toBeVisible();
  await expect(page.getByText(/The secret ends in/)).toContainText('9d41');
  // the secret is never sent back to the browser, and is not readable in the database
  const shown = JSON.stringify(await must(page, 'getGoogleSetup'));
  expect(shown).not.toContain(CLIENT.secret);
  expect(sql(`select coalesce(value,'') || encode(secret_encrypted,'escape') from instance_settings where key='google_client'`)).not.toContain(CLIENT.secret);
  // and the saved client, not the server's settings file, is what signs in to Google
  await page.goto('/settings/calendars');
  await page.getByRole('button', { name: /Connect Google/ }).click();
  await page.waitForURL(/settings\/calendars/);
  await expect(page.getByText('Google Calendar connected').first()).toBeVisible({ timeout: 15000 });
  // changing the client while a calendar is connected says what will happen
  const swap = await must<any>(page, 'saveGoogleSetup', [{ clientId: 'other-client.apps.googleusercontent.com', clientSecret: 'other-secret-1' }]);
  expect(swap.warnings.join(' ')).toMatch(/sign in to Google again/);
  expect(swap.check.ok).toBe(false);
  checkProblems(problems);
});

test('GS-2 saving without a secret keeps the old one; removing falls back to the settings file; odd client IDs get a warning', async ({ page, problems }) => {
  const em = await signUp(page, { household: 'Google Keep House' });
  makeAdmin(em);
  await fg({ set: { client: CLIENT } });
  const first = await must<any>(page, 'saveGoogleSetup', [{ clientId: CLIENT.id, clientSecret: CLIENT.secret }]);
  expect(first.check.ok).toBe(true);
  expect(first.warnings).toEqual([]);
  const again = await must<any>(page, 'saveGoogleSetup', [{ clientId: CLIENT.id, status: 'production' }]);
  expect(again.check.ok).toBe(true);
  expect(again.setup.status).toBe('production');
  const odd = await must<any>(page, 'saveGoogleSetup', [{ clientId: 'my-project-name' }]);
  expect(odd.warnings.join(' ')).toMatch(/googleusercontent/);
  expect(odd.warnings.join(' ')).not.toMatch(/sign in to Google again/); // nothing is connected yet, so nothing would be signed out
  const bad = await rpc(page, 'saveGoogleSetup', [{ clientId: 'two words', clientSecret: 'x' }]);
  expect(bad.ok).toBe(false);
  const gone = await must<any>(page, 'clearGoogleSetup');
  expect(gone.source).toBe('env');
  checkProblems(problems);
});

test('GS-3 only the person who runs the server can see or change it, even with the PIN', async ({ page, browser, problems, allowProblems }) => {
  await signUp(page, { household: 'Not Admin House' });
  for (const [m, a] of [['getGoogleSetup', []], ['saveGoogleSetup', [{ clientId: 'x.apps.googleusercontent.com', clientSecret: 'y' }]], ['clearGoogleSetup', []], ['testGoogleSetup', []]] as [string, unknown[]][]) {
    const r = await rpc(page, m, a);
    expect(r.ok, m).toBe(false);
    expect(r.error!.code, m).toBe('forbidden');
  }
  await page.goto('/settings/google');
  await expect(page.getByText('Only the person who set up this server')).toBeVisible();
  // signed out
  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  expect((await rpc(anon, 'getGoogleSetup')).error?.code).toBe('unauthenticated');
  await ctx.close();
  allowProblems();
});
