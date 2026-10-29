import { test, expect, signUp, signIn, signOut, rpc, must, sql, email, PASSWORD, PIN, checkProblems, joinAs, readPairingCode, linkScreen } from './fixtures';

test.describe('Settings need the parent PIN', () => {
  test('PIN-1 sign-up asks for a 4-digit parent PIN and will not continue without one', async ({ page, problems, allowProblems }) => {
    const hn = `Pinless ${Date.now()}`;
    await page.goto('/signup');
    await page.getByLabel('Your name').fill('No Pin');
    await page.getByLabel('Email').fill(email('nopin'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Household name').fill(hn);
    await page.getByLabel(/Parent PIN/).fill('12');
    await page.getByRole('button', { name: 'Create household' }).click();
    await expect(page).toHaveURL(/signup/);
    expect(sql(`select count(*) from households where name='${hn}'`)).toBe('0');
    await page.getByLabel(/Parent PIN/).fill('1357');
    await page.getByRole('button', { name: 'Create household' }).click();
    await page.waitForURL(/settings\/profiles/);
    expect(sql(`select count(*) from households where name='${hn}' and parent_pin_hash is not null`)).toBe('1');
    allowProblems();
  });

  test('PIN-2 signing in on a new device still asks for the PIN, on screen and on the server', async ({ page, browser, problems, allowProblems }) => {
    const em = await signUp(page, { household: 'Pin House' });
    // the owner who just signed up is already unlocked for five minutes
    expect((await rpc(page, 'updateHousehold', [{ location: 'Home' }])).ok).toBe(true);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.55.5.5' } });
    const p = await ctx.newPage();
    await signIn(p, em);
    await p.waitForURL(/calendar|settings|chores/);
    const before = await rpc(p, 'updateHousehold', [{ location: 'Sneaky' }]);
    expect(before.ok).toBe(false);
    expect(before.error!.code).toBe('locked');
    await p.goto('/settings/household');
    await expect(p.getByRole('heading', { name: 'Parents only' })).toBeVisible();
    // wrong PIN is refused with a message; nothing opens
    for (const d of '1111') await p.getByRole('button', { name: d, exact: true }).click();
    await expect(p.getByText('That PIN did not match')).toBeVisible();
    await expect(p.getByRole('heading', { name: 'Parents only' })).toBeVisible();
    for (const d of PIN) await p.getByRole('button', { name: d, exact: true }).click();
    await expect(p.getByLabel('Household name')).toBeVisible();
    expect((await rpc(p, 'updateHousehold', [{ location: 'Home 2' }])).ok).toBe(true);
    // a reload within the five minutes does not ask again
    await p.reload();
    await expect(p.getByLabel('Household name')).toBeVisible();
    // the other settings pages are covered by the same unlock
    for (const r of ['/settings/profiles', '/settings/devices', '/settings/calendars', '/settings/photos', '/settings/ai', '/settings/display']) {
      await p.goto(r);
      await expect(p.getByRole('heading', { name: 'Parents only' }), r).toHaveCount(0);
    }
    // forgetting the unlock (cookie gone) locks the server again
    await ctx.clearCookies({ name: 'fc_unlock' });
    const after = await rpc(p, 'updateHousehold', [{ location: 'Again' }]);
    expect(after.error?.code).toBe('locked');
    await ctx.close();
    allowProblems();
  });

  test('PIN-3 a household without a PIN must set one before Settings open', async ({ page, browser, problems, allowProblems }) => {
    const hn = `Legacy ${Date.now()}`;
    const em = await signUp(page, { household: hn });
    sql(`update households set parent_pin_hash = null where name='${hn}'`);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.55.5.6' } });
    const p = await ctx.newPage();
    await signIn(p, em);
    await p.waitForURL(/calendar|settings|chores/);
    const r = await rpc(p, 'updateHousehold', [{ location: 'x' }]);
    expect(r.error?.code).toBe('pin_required');
    await p.goto('/settings/household');
    await expect(p.getByRole('heading', { name: 'Choose a parent PIN' })).toBeVisible();
    for (const d of '9753') await p.getByRole('button', { name: d, exact: true }).click();
    await expect(p.getByText('Enter it once more')).toBeVisible();
    for (const d of '9753') await p.getByRole('button', { name: d, exact: true }).click();
    await expect(p.getByLabel('Household name')).toBeVisible();
    expect(sql(`select count(*) from households where name='${hn}' and parent_pin_hash is not null`)).toBe('1');
    expect((await rpc(p, 'updateHousehold', [{ location: 'ok' }])).ok).toBe(true);
    await ctx.close();
    allowProblems();
  });

  test('PIN-4 the PIN cannot be switched off, and changing it needs the old unlock', async ({ page, browser, problems, allowProblems }) => {
    const em = await signUp(page, { household: 'Change Pin' });
    expect((await rpc(page, 'setPin', [null])).ok).toBe(false);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.55.5.7' } });
    const p = await ctx.newPage();
    await signIn(p, em);
    await p.waitForURL(/calendar|settings|chores/);
    expect((await rpc(p, 'setPin', ['0000'])).error?.code).toBe('locked');
    expect((await rpc(p, 'verifyPin', [PIN])).r).toBe(true);
    expect((await rpc(p, 'setPin', ['0000'])).ok).toBe(true);
    expect((await rpc(page, 'verifyPin', [PIN])).r).toBe(false);
    expect((await rpc(page, 'verifyPin', ['0000'])).r).toBe(true);
    await ctx.close();
    allowProblems();
  });

  test('PIN-5 an invited adult needs the PIN too, and a "can only look" member never gets into Settings', async ({ page, browser, problems, allowProblems }) => {
    await signUp(page, { household: 'Crew House' });
    const adult = await joinAs(page, browser, 'Adult', 'Ada');
    expect((await rpc(adult.page, 'updateHousehold', [{ location: 'x' }])).error?.code).toBe('locked');
    await adult.page.goto('/settings/profiles');
    await expect(adult.page.getByRole('heading', { name: 'Parents only' })).toBeVisible();
    expect((await rpc(adult.page, 'verifyPin', [PIN])).r).toBe(true);
    expect((await rpc(adult.page, 'updateHousehold', [{ location: 'x' }])).ok).toBe(true);
    const viewer = await joinAs(page, browser, 'Can only look', 'Vic');
    const v = await rpc(viewer.page, 'updateHousehold', [{ location: 'y' }]);
    expect(v.ok).toBe(false);
    expect((await rpc(viewer.page, 'verifyPin', [PIN])).r).toBe(true); // knowing the PIN does not make a viewer an editor
    expect((await rpc(viewer.page, 'updateHousehold', [{ location: 'y' }])).ok).toBe(false);
    await adult.ctx.close(); await viewer.ctx.close();
    allowProblems();
  });

  test('PIN-6 a paired wall screen needs the PIN for settings calls; without a PIN it cannot do them at all', async ({ page, browser, problems, allowProblems }) => {
    const hn = `Wall ${Date.now()}`;
    await signUp(page, { household: hn });
    const dctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.55.5.8' } });
    const d = await dctx.newPage();
    const code = await readPairingCode(d);
    await linkScreen(page, code, 'Wall');
    await d.waitForURL(/calendar/, { timeout: 15000 });
    expect((await rpc(d, 'listDevices')).error?.code).toBe('locked');
    expect((await rpc(d, 'verifyPin', ['0000'])).r).toBe(false);
    expect((await rpc(d, 'verifyPin', [PIN])).r).toBe(true);
    expect((await rpc(d, 'listDevices')).ok).toBe(true);
    sql(`update households set parent_pin_hash = null where name='${hn}'`);
    expect((await rpc(d, 'listDevices')).error?.code).toBe('pin_required');
    await dctx.close();
    allowProblems();
  });
});
