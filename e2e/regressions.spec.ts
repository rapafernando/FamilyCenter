// Each test here was written first to fail on a reported bug (see replica/bugs.md), then kept.
import { test, expect, signUp, signOut, checkProblems } from './fixtures';

test('BUG-001 a signed-out tab does not hammer the server and goes to the welcome page', async ({ page, allowProblems }) => {
  await signUp(page);
  await signOut(page);
  let calls = 0;
  page.on('request', (r) => { if (r.url().endsWith('/api/rpc')) calls++; });
  await page.goBack();
  await page.waitForTimeout(3000);
  expect(calls, 'rpc calls in 3 seconds').toBeLessThan(25);
  await expect(page).toHaveURL(/welcome|signin/);
  allowProblems(); // the refused calls show up as console errors; the bug is the count and the stuck screen
});

test('BUG-002 a viewer can reach Account, change their password, sign out, and leaving keeps the household', async ({ page, browser, allowProblems }) => {
  const { joinAs, sql, PASSWORD } = await import('./fixtures');
  const hname = 'Viewer Rights ' + Date.now();
  await signUp(page, { household: hname });
  const v = await joinAs(page, browser, 'Can only look', 'Vera');
  await v.page.goto('/settings/account');
  await expect(v.page.getByRole('heading', { name: 'Password and sign-in' })).toBeVisible();
  await v.page.getByLabel('Current password').fill(PASSWORD);
  await v.page.getByLabel('New password').fill('viewer-new-pass-1');
  await v.page.getByRole('button', { name: 'Change password' }).click();
  await expect(v.page.getByText(/Password (changed|updated)/i).first()).toBeVisible();
  // a viewer sees no export (refused for them) and no wording about deleting the whole household
  await expect(v.page.getByRole('button', { name: 'Download export' })).toHaveCount(0);
  await expect(v.page.getByText('removes the household')).toHaveCount(0);
  // leave: only the viewer's sign-in goes
  await v.page.getByRole('button', { name: /Delete my sign-in|Leave/ }).click();
  await v.page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await v.page.getByRole('button', { name: /Delete for good|Leave/ }).click();
  await v.page.waitForURL(/welcome/);
  expect(sql(`select count(*) from users where email='${v.email}'`)).toBe('0');
  expect(sql(`select count(*) from households where name='${hname}'`)).toBe('1');
  // and a viewer can sign out from the More screen (second viewer)
  const v2 = await joinAs(page, browser, 'Can only look', 'Vic');
  await v2.page.goto('/settings');
  await v2.page.getByRole('button', { name: /Sign out$/ }).click();
  await v2.page.waitForURL(/welcome|signin/);
  await v.ctx.close(); await v2.ctx.close();
  allowProblems();
});

test('BUG-003 a viewer is not offered add or edit controls', async ({ page, browser, allowProblems }) => {
  const { joinAs, must } = await import('./fixtures');
  await signUp(page, { household: 'Look Only House' });
  const ps = await must<any[]>(page, 'listProfiles');
  await must(page, 'createList', [{ name: 'Party', color: '#2a6f4f', emoji: '🎈' }]);
  const v = await joinAs(page, browser, 'Can only look');
  const p = v.page;
  for (const [route, name] of [['/calendar', /Add (an )?event/i], ['/chores', /Add (a )?chore/i], ['/recipes', /Add (a )?recipe/i]] as const) {
    await p.goto(route);
    await expect(p.getByRole('heading').first()).toBeVisible();
    await expect(p.getByRole('link', { name }), `${route} offers an add link`).toHaveCount(0);
  }
  await p.goto('/lists');
  await expect(p.getByRole('tab', { name: /Party/ })).toBeVisible();
  await expect(p.getByRole('button', { name: 'New list' })).toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  for (const route of ['/calendar/event/new', '/chores/new', '/recipes/new']) {
    await p.goto(route);
    await expect(p.getByText('Your role can look but not change things')).toBeVisible();
  }
  await v.ctx.close();
  allowProblems();
});

test('BUG-004 any time zone can be chosen, and the browser\'s own zone is the default', async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: 'Asia/Kolkata', extraHTTPHeaders: { 'x-forwarded-for': '10.31.3.1' } });
  const page = await ctx.newPage();
  await page.goto('/signup');
  await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Kolkata');
  for (const z of ['Pacific/Auckland', 'Europe/Paris', 'America/Toronto', 'Asia/Dubai', 'Africa/Johannesburg']) {
    await expect(page.getByLabel('Time zone').locator(`option[value="${z}"]`), z).toHaveCount(1);
  }
  const { signUp, sql } = await import('./fixtures');
  const em = await signUp(page, { household: 'Delhi House', tz: 'Pacific/Auckland' });
  expect(sql(`select timezone from households where name='Delhi House' order by created_at desc limit 1`)).toBe('Pacific/Auckland');
  await ctx.close();
});

test('BUG-005 a snack added to the meal plan is shown on the Meals screen', async ({ page }) => {
  const { must, isoDay } = await import('./fixtures');
  await signUp(page, { household: 'Snack House', tz: 'America/New_York' });
  await must(page, 'addMeal', [{ planDate: isoDay(0), slot: 'snack', title: 'Apple slices', recipeId: null }]);
  await page.goto('/meals');
  await expect(page.getByText('Apple slices')).toBeVisible();
  // and a snack can be added from the screen
  await page.getByRole('button', { name: /Add (a meal|another).*Snack/i }).first().click();
  await page.getByLabel('What is on the menu').fill('Popcorn');
  await page.getByRole('button', { name: 'Add meal' }).click();
  await expect(page.getByText('Popcorn')).toBeVisible();
});

test('BUG-006 a wall screen cannot invite people, and does not see members\' email addresses', async ({ page, browser, allowProblems }) => {
  const { must, rpc, readPairingCode, linkScreen } = await import('./fixtures');
  const em = await signUp(page, { household: 'Wall Rules House', tz: 'America/New_York' });
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.96.6.6' } });
  const display = await ctx.newPage();
  const code = await readPairingCode(display);
  await linkScreen(page, code, 'Wall');
  await display.waitForURL(/calendar/, { timeout: 15000 });
  // no PIN is set, so the screen counts as unlocked; inviting still needs a person's own sign-in
  expect((await rpc(display, 'invite', ['stranger@example.test', 'adult'])).ok, 'invite from a screen').toBe(false);
  expect((await rpc(display, 'revokeInvitation', ['00000000-0000-4000-8000-000000000000'])).ok, 'cancel invite from a screen').toBe(false);
  const mem = await rpc(display, 'listMembers');
  expect(JSON.stringify(mem.r ?? {}), 'members list on a screen').not.toContain(em);
  // the signed-in owner still sees emails
  expect(JSON.stringify((await must<any>(page, 'listMembers')))).toContain(em);
  await ctx.close();
  allowProblems();
});
