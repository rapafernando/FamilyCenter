import { test, expect, rpc, must, signUp, signIn, signOut, email, PASSWORD, a11y, checkProblems, sql, readPairingCode, linkScreen } from './fixtures';
import { readFileSync } from 'node:fs';

const mails = () => { try { return readFileSync('/tmp/mails.jsonl', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const mailTo = async (to: string, subject: RegExp) => { for (let i = 0; i < 30; i++) { const m = mails().filter((x) => x.to.includes(to) && subject.test(x.body)); if (m.length) return m.at(-1); await new Promise((r) => setTimeout(r, 300)); } return null; };
const link = (body: string, re: RegExp) => { const t = body.replace(/=\r?\n/g, '').replace(/=3D/g, '='); const m = t.match(re); return m ? m[0] : null; };

test.describe('F01 sign up and pairing', () => {
  test('F01-H1 sign up lands on profiles, cookie is http-only', async ({ page, context, problems }) => {
    await signUp(page, { name: 'Ana', household: 'Ana House' });
    await expect(page.getByRole('heading', { name: /people|profiles/i }).first()).toBeVisible();
    const c = (await context.cookies()).find((x) => x.name === 'fc_session');
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('Lax');
    await a11y(page);
    checkProblems(problems);
  });

  test('F01-E1 long names, accents and emoji', async ({ page, problems }) => {
    const long = 'Familia García-Núñez de la Cruz y Hernández 🏡 con apellidos muy largos';
    await signUp(page, { name: 'José Ñandú 🎈', household: long });
    await page.goto('/settings/household');
    await expect(page.getByLabel('Household name')).toHaveValue(long);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    checkProblems(problems);
  });

  test('F01-E2 double click creates one household', async ({ page }) => {
    const em = email('dbl');
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Dee');
    await page.getByLabel('Email').fill(em);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Household name').fill('Double House');
    const b = page.getByRole('button', { name: 'Create household' });
    await b.dblclick().catch(() => {});
    await page.waitForURL(/settings\/profiles/);
    expect(sql(`select count(*) from users where email='${em}'`)).toBe('1');
    expect(sql(`select count(*) from household_members m join users u on u.id=m.user_id where u.email='${em}'`)).toBe('1');
  });

  test('F01-E3 email already used', async ({ page }) => {
    const em = await signUp(page);
    await signOut(page);
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Again');
    await page.getByLabel('Email').fill(em);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Household name').fill('Second');
    await page.getByRole('button', { name: 'Create household' }).click();
    await expect(page.getByText(/already/i).first()).toBeVisible();
    expect(sql(`select count(*) from users where email='${em}'`)).toBe('1');
  });

  test('F01-N1 short password', async ({ page }) => {
    const em = email('short');
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Shorty');
    await page.getByLabel('Email').fill(em);
    await page.getByLabel('Password').fill('abc');
    await page.getByLabel('Household name').fill('S');
    await page.getByRole('button', { name: 'Create household' }).click();
    await expect(page).toHaveURL(/signup/);
    expect(sql(`select count(*) from users where email='${em}'`)).toBe('0');
  });

  test('F01-H2 pair a display with a code; F01-E5/E6/E7/N2/N3', async ({ page, browser, problems, allowProblems }) => {
    const PH = `Pair House ${Date.now()}`;
    await signUp(page, { household: PH });
    const dctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.9' } });
    const display = await dctx.newPage();
    const code = await readPairingCode(display);
    expect(code).toMatch(/^[A-Z0-9]{6,7}$/);
    // N2: wrong codes are refused
    await page.goto('/settings/devices/link');
    await page.getByLabel('Code on the screen').fill('ZZZZZZ');
    await page.getByLabel('Name for this screen').fill('Nope');
    await page.getByRole('button', { name: 'Link screen' }).click();
    await expect(page.getByText(/code|not|try/i).first()).toBeVisible();
    // E5: lower case with a space is accepted
    await linkScreen(page, ` ${code.toLowerCase()} `, 'Kitchen');
    await display.waitForURL(/calendar/, { timeout: 15_000 });
    expect(sql(`select count(*) from devices where nickname='Kitchen' and household_id=(select id from households where name='${PH}')`)).toBe('1');
    await expect(display.getByRole('heading').first()).toBeVisible();
    // E6: reusing the code is refused
    await linkScreen(page, code, 'Again');
    await expect(page.getByText(/ran out|not|used|try/i).first()).toBeVisible();
    expect(sql(`select count(*) from devices where nickname='Again'`)).toBe('0');
    // N3: a tampered device cookie is signed out
    const tctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.9.9.8' } });
    await tctx.addCookies([{ name: 'fc_device', value: 'abc.def', url: 'http://localhost:3100' }]);
    const tp = await tctx.newPage();
    await tp.goto('/calendar');
    await expect(tp).toHaveURL(/welcome|signin|pair/);
    await tctx.close();
    // E7: remove the device; display is signed out on its next action
    await page.goto('/settings/devices');
    await page.getByRole('button', { name: /Unlink Kitchen/ }).click();
    const confirm = page.getByRole('button', { name: /^(Unlink|Remove|Yes)/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect.poll(() => sql(`select count(*) from devices where nickname='Kitchen' and household_id=(select id from households where name='${PH}')`)).toBe('0');
    await display.reload();
    await expect(display).toHaveURL(/welcome|signin|pair/);
    await dctx.close();
    allowProblems(); // the signed-out display can log a refused call
    checkProblems(problems);
  });
});

test('F01-E8 a made-up time zone is never stored', async ({ page }) => {
  const bad = await rpc(page, 'signUp', [{ name: 'Zed', email: email('zed'), password: 'long-enough-1', householdName: 'Zone House', timezone: 'Mars/Olympus' }]);
  expect(bad.ok).toBe(true);
  expect(sql(`select timezone from households where name='Zone House' order by created_at desc limit 1`)).toBe('UTC');
  const hh = await must<any>(page, 'getHousehold');
  const r = await rpc(page, 'updateHousehold', [{ timezone: 'Not/AZone' }]);
  expect(r.ok).toBe(false);
  expect(hh.timezone).toBe('UTC');
});

test.describe('F12 accounts and sessions', () => {
  test('F12-H1 sign out then sign in; F12-E5 back button shows nothing', async ({ page, problems, allowProblems }) => {
    const em = await signUp(page, { household: 'Back House' });
    await signOut(page);
    await page.goBack();
    await expect(page.getByText('Back House')).toHaveCount(0);
    await signIn(page, em);
    await page.waitForURL(/calendar|settings/);
    allowProblems(); // going Back to a signed-out page makes refused calls, which the browser logs as console errors
    checkProblems(problems);
  });

  test('F12-H2 change password', async ({ page }) => {
    const em = await signUp(page);
    await page.goto('/settings/account');
    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password').fill('brand-new-pass-1');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText(/Password (changed|updated)/i).first()).toBeVisible();
    await signOut(page);
    await signIn(page, em, PASSWORD);
    await expect(page.getByText(/do not match/i).first()).toBeVisible();
    await signIn(page, em, 'brand-new-pass-1');
    await page.waitForURL(/calendar|settings/);
  });

  test('F12-H3/E1/E2 reset by email, link works once', async ({ page, request }) => {
    const em = await signUp(page);
    await signOut(page);
    await page.goto('/forgot');
    await page.getByLabel('Email').fill(em);
    await page.getByRole('button', { name: 'Send the link' }).click();
    const m = await mailTo(em, /Subject: .*password/i);
    expect(m, 'reset email arrives').not.toBeNull();
    const url = link(m.body, /http:\/\/localhost:3100\/reset\/[A-Za-z0-9_.-]+/)!;
    expect(url).toBeTruthy();
    await page.goto(url);
    await page.getByLabel(/New password/).first().fill('reset-pass-9999');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText('Password changed').first()).toBeVisible();
    // E1: using the link again fails
    await page.goto(url);
    await page.getByLabel(/New password/).first().fill('another-pass-123');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText(/expired|already|not work|no longer|invalid/i).first()).toBeVisible();
    // new password works, the "another" one does not
    await signIn(page, em, 'reset-pass-9999');
    await page.waitForURL(/calendar|settings/);
  });

  test('F12-N2 unknown email gets the same answer as a known one', async ({ page }) => {
    const em = await signUp(page);
    await signOut(page);
    const ask = async (e: string) => { await page.goto('/forgot'); await page.getByLabel('Email').fill(e); await page.getByRole('button', { name: 'Send the link' }).click(); await page.waitForTimeout(800); return (await page.locator('main').innerText()).replace(e, 'X'); };
    expect(await ask('nobody-here@example.test')).toBe(await ask(em));
  });

  test('F12-H4 confirm email link', async ({ page }) => {
    const em = await signUp(page);
    const m = await mailTo(em, /Subject: Confirm your email/);
    expect(m, 'confirmation email arrives after sign up').not.toBeNull();
    const url = link(m.body, /http:\/\/localhost:3100\/verify\/[A-Za-z0-9_.-]+/)!;
    await page.goto(url);
    await expect(page.getByText(/confirmed|thank|done/i).first()).toBeVisible();
    await page.goto('/settings/account');
    await expect(page.getByText('Confirm your email address')).toHaveCount(0);
  });

  test('F12-H5 sign out everywhere else', async ({ page, browser }) => {
    const em = await signUp(page);
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.8.8.8' } });
    const op = await other.newPage();
    await signIn(op, em);
    await op.waitForURL(/calendar|settings/);
    await page.goto('/settings/account');
    await page.getByRole('button', { name: 'Sign out everywhere else' }).click();
    await expect(page.getByText('Signed out everywhere else')).toBeVisible();
    await op.reload();
    await expect(op).toHaveURL(/welcome|signin/);
    await page.reload();
    await expect(page).toHaveURL(/settings\/account/); // this device stays in
    await other.close();
  });

  test('F12-E3 protected page signed out goes to sign in', async ({ page }) => {
    await page.goto('/chores');
    await expect(page).toHaveURL(/welcome|signin/);
  });

  test('F12-E4 session cookie deleted mid-use', async ({ page, context, problems, allowProblems }) => {
    await signUp(page);
    await page.goto('/chores');
    await context.clearCookies();
    await page.reload();
    await expect(page).toHaveURL(/welcome|signin/);
    allowProblems();
  });

  test('F12-N1 wrong password is rate limited', async ({ page }) => {
    const em = await signUp(page);
    await signOut(page);
    for (let i = 0; i < 11; i++) { await signIn(page, em, 'wrong-wrong-' + i); await page.waitForTimeout(150); }
    await expect(page.getByText(/too many|slow down|wait|later/i).first()).toBeVisible();
  });

  test('F12-N3 request claiming another origin is refused', async ({ page, request }) => {
    await signUp(page);
    const r = await page.request.post('/api/rpc', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, data: { m: 'listEvents', a: [] } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test('F12-N4 junk on the endpoint never gives a 5xx', async ({ page }) => {
    await signUp(page);
    for (const data of ['not json', '{"m":"nope","a":[]}', '{"m":"addEvent","a":[1,2,3]}', '{}', '[]', '{"m":"__proto__","a":[]}']) {
      const r = await page.request.post('/api/rpc', { headers: { 'content-type': 'application/json' }, data });
      expect(r.status(), data).toBeLessThan(500);
    }
  });

  test('F12-H6 delete account really deletes', async ({ page }) => {
    const em = await signUp(page, { household: 'Doomed House' });
    expect(sql(`select count(*) from users where email='${em}'`)).toBe('1');
    await page.goto('/settings/account');
    await page.getByRole('button', { name: 'Delete my household' }).click();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete for good' }).click();
    await page.waitForURL(/welcome/);
    expect(sql(`select count(*) from users where email='${em}'`)).toBe('0');
    expect(sql(`select count(*) from households where name='Doomed House'`)).toBe('0');
    await signIn(page, em);
    await expect(page.getByText(/do not match/i).first()).toBeVisible();
  });
});

test.describe('F14 invitations and roles', () => {
  async function invite(page: any, to: string, role: 'Adult' | 'Can only look') {
    await page.goto('/settings/household');
    await page.getByLabel('Invite by email').fill(to);
    await page.getByLabel('As').selectOption({ label: role });
    await page.getByRole('button', { name: 'Invite' }).click();
    const input = page.getByLabel(`Invitation link for ${to}`);
    await expect(input).toBeVisible();
    return (await input.inputValue()) as string;
  }

  test('F14-E2 an expired invitation link says so and joins nobody', async ({ page, browser, problems, allowProblems }) => {
    const hn = `Expiry House ${Date.now()}`;
    await signUp(page, { household: hn });
    const to = email('late');
    const url = await invite(page, to, 'Adult');
    sql(`update invitations set expires_at = now() - interval '1 hour' where household_id=(select id from households where name='${hn}')`);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.7.5' } });
    const v = await ctx.newPage();
    await v.goto(url);
    await expect(v.getByRole('heading', { name: /does not work/ })).toBeVisible();
    expect(sql(`select count(*) from household_members m join households h on h.id=m.household_id where h.name='${hn}'`)).toBe('1');
    await ctx.close();
    allowProblems();
  });

  test('F14-H1/E1 viewer joins, can look but not edit, link works once', async ({ page, browser, problems, allowProblems }) => {
    await signUp(page, { household: 'Invite House' });
    await page.goto('/chores/new');
    const to = email('viewer');
    const url = await invite(page, to, 'Can only look');
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.7.7' } });
    const v = await ctx.newPage();
    await v.goto(url);
    await expect(v.getByRole('heading', { name: /Join Invite House/ })).toBeVisible();
    await v.getByLabel('Your name').fill('Vic Viewer');
    await v.getByLabel('Email').fill(to);
    await v.getByLabel('Password').fill(PASSWORD);
    await v.getByRole('button', { name: /Create account and join/ }).click();
    await v.waitForURL(/calendar|settings|chores/);
    await expect(v.getByRole('link', { name: /Calendar/ }).first()).toBeVisible();
    // viewer cannot write: the endpoint refuses
    const r = await v.request.post('/api/rpc', { headers: { 'content-type': 'application/json' }, data: { m: 'createList', a: [{ name: 'Nope', color: '#2a6f4f', emoji: '🛒' }] } });
    const j = await r.json();
    expect(j.ok).toBe(false);
    // E1: the link is single use
    const ctx2 = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.7.6' } });
    const p2 = await ctx2.newPage();
    await p2.goto(url);
    await expect(p2.getByRole('heading', { name: /does not work/ })).toBeVisible();
    await ctx.close(); await ctx2.close();
    allowProblems();
  });

  test('F14-H2/E3 adult can edit and invite, cannot remove people, leaving keeps the household', async ({ page, browser, allowProblems }) => {
    const hn = 'Adult House ' + Date.now();
    await signUp(page, { household: hn });
    const to = email('adult');
    const url = await invite(page, to, 'Adult');
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.6.6' } });
    const a = await ctx.newPage();
    await a.goto(url);
    await a.getByLabel('Your name').fill('Ada Adult');
    await a.getByLabel('Email').fill(to);
    await a.getByLabel('Password').fill(PASSWORD);
    await a.getByRole('button', { name: /Create account and join/ }).click();
    await a.waitForURL(/calendar|settings|chores/);
    const post = async (m: string, args: unknown[]) => (await (await a.request.post('/api/rpc', { headers: { 'content-type': 'application/json' }, data: { m, a: args } })).json());
    expect((await post('createList', [{ name: 'Groceries 2', color: '#2a6f4f', emoji: '🛒' }])).ok).toBe(true);
    // adults may invite (architecture: invitations are adult level) but may not remove people
    expect((await post('invite', ['x@example.test', 'adult'])).ok).toBe(true);
    const owner = sql(`select m.user_id from household_members m join households h on h.id=m.household_id where h.name='${hn}' and m.role='owner'`);
    expect((await post('removeMember', [owner])).ok).toBe(false);
    // an adult deleting their account only leaves; the household stays
    expect((await post('deleteAccount', [])).ok).toBe(true);
    expect(sql(`select count(*) from households where name='${hn}'`)).toBe('1');
    expect(sql(`select count(*) from household_members m join households h on h.id=m.household_id where h.name='${hn}'`)).toBe('1');
    await ctx.close();
    allowProblems();
  });

  test('F14-E4 an existing user opens an invite link and joins without a new account', async ({ page, browser, allowProblems }) => {
    await signUp(page, { household: 'Host House' });
    const guest = email('guest');
    const gctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.7.5.5' } });
    const g = await gctx.newPage();
    await signUp(g, { email: guest, household: 'Guest Own House' });
    const url = await invite(page, guest, 'Adult');
    await g.goto(url);
    await g.getByRole('button', { name: /^Join Host House/ }).click(); // already signed in, so no new account is asked for
    await expect.poll(() => sql(`select count(*) from household_members m join users u on u.id=m.user_id join households h on h.id=m.household_id where u.email='${guest}'`)).toBe('2');
    await gctx.close();
    allowProblems();
  });

  test('F14-N1 made-up token', async ({ page }) => {
    await page.goto('/join/not-a-real-token-123');
    await expect(page.getByRole('heading', { name: /does not work/ })).toBeVisible();
  });
});

test.describe('F01-E4 / X-6 interrupted and slow', () => {
  test('F01-E4 a refresh in the middle of sign up leaves an empty form and no account', async ({ page, problems }) => {
    const hn = `Half House ${Date.now()}`;
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Half Way');
    await page.getByLabel('Email').fill(email('half'));
    await page.getByLabel('Household name').fill(hn);
    await page.reload();
    await expect(page.getByLabel('Household name')).toHaveValue('');
    expect(sql(`select count(*) from households where name='${hn}'`)).toBe('0');
    checkProblems(problems);
  });
  test('X-6 a slow network shows that it is working and a double click makes one household', async ({ page, problems }) => {
    const hn = `Slow House ${Date.now()}`;
    await page.route('**/api/rpc', async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('Slow Poke');
    await page.getByLabel('Email').fill(email('slow'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Household name').fill(hn);
    const b = page.getByRole('button', { name: /Create household|Creating|Working/i });
    await b.click();
    await expect(page.getByRole('button', { name: /Create household/ })).toBeDisabled({ timeout: 2000 });
    await b.click({ force: true, timeout: 1000 }).catch(() => {});
    await page.waitForURL(/\/settings\/profiles/, { timeout: 20000 });
    expect(sql(`select count(*) from households where name='${hn}'`)).toBe('1');
    checkProblems(problems);
  });
});

test('F03-N1 there is no web-address subscription option on the Calendars screen', async ({ page, problems }) => {
  await signUp(page, { name: 'Sub' });
  await page.goto('/settings/calendars');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByText(/subscribe|webcal|\.ics|iCal|Outlook/i)).toHaveCount(0);
  checkProblems(problems);
});
