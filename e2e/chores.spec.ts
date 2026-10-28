import { test, expect, signUp, must, rpc, isoDay, sql, a11y, checkProblems, joinAs, readPairingCode, linkScreen } from './fixtures';

const TZ = 'America/New_York';
const task = (profileIds: string[], over: Record<string, unknown> = {}) => ({ profileIds, title: 'Feed the cat', emoji: '🐱', kind: 'chore', timeOfDay: null, dueTime: null, startsOn: isoDay(0), endsOn: null, rrule: null, starValue: 0, ...over });
async function house(page: any, name = 'Cass') {
  await signUp(page, { name, tz: TZ });
  const ps = await must<any[]>(page, 'listProfiles');
  return { me: ps.find((p) => p.kind === 'person'), family: ps.find((p) => p.kind === 'household') };
}
const balance = async (page: any, id: string) => (await must<any[]>(page, 'listProfiles')).find((p) => p.id === id).starBalance as number;

test.describe('F06 create chores', () => {
  test('F06-H1 add a chore on the screen; F06-E1 empty name; F06-E4 long name', async ({ page, problems }) => {
    const { me } = await house(page, 'Cass');
    await page.goto('/chores/new');
    await page.getByRole('button', { name: 'Add chore' }).click(); // empty name: the form refuses
    await expect(page).toHaveURL(/chores\/new/);
    await page.getByLabel('Name').fill('Feed the cat');
    await page.getByRole('button', { name: 'Cass' }).click();
    await page.getByRole('button', { name: 'Add chore' }).click();
    await page.waitForURL(/\/chores$/);
    await expect(page.getByText('Feed the cat').first()).toBeVisible();
    // long name with emoji at phone width
    await must(page, 'createTasks', [task([me.id], { title: 'Sacar la basura, reciclar y lavar los platos del almuerzo de la abuela Núñez 🍽️🗑️' })]);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/chores');
    await expect(page.getByText(/Sacar la basura/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    await a11y(page);
    checkProblems(problems);
  });

  test('F06-H2 a chore for two people makes two chores', async ({ page }) => {
    const { me } = await house(page);
    const kid = await must<any>(page, 'createProfile', [{ name: 'Kiko', color: '#2a6f4f' }]);
    await page.goto('/chores/new');
    await page.getByLabel('Name').fill('Make the bed');
    await page.getByRole('button', { name: 'Cass' }).click();
    await page.getByRole('button', { name: 'Kiko' }).click();
    await page.getByRole('button', { name: 'Add chore' }).click();
    await page.waitForURL(/\/chores$/);
    expect(sql(`select count(*) from tasks where title='Make the bed' and profile_id in ('${me.id}','${kid.id}')`)).toBe('2');
  });

  test('F06-E2 weekly Mon/Wed is not on Tuesday; F06-E3 chore becomes a routine and back', async ({ page }) => {
    const { me } = await house(page);
    let d = 1; while (new Date(isoDay(d) + 'T12:00:00Z').getUTCDay() !== 1) d++;
    const mon = isoDay(d), tue = isoDay(d + 1), wed = isoDay(d + 2);
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Trash out', startsOn: mon, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' })]);
    const on = async (day: string) => (await must<any[]>(page, 'listTasksForDay', [day])).some((x) => x.task.id === t.id);
    expect([await on(mon), await on(tue), await on(wed)]).toEqual([true, false, true]);
    await must(page, 'updateTask', [t.id, { kind: 'routine', timeOfDay: 'morning' }]);
    const r = await must<any>(page, 'getTask', [t.id]);
    expect(r.kind).toBe('routine'); expect(r.timeOfDay).toBe('morning');
    await must(page, 'updateTask', [t.id, { kind: 'chore', timeOfDay: null }]);
    const back = await must<any>(page, 'getTask', [t.id]);
    expect(back.kind).toBe('chore'); expect(back.timeOfDay).toBeNull();
    expect(await on(wed)).toBe(true);
  });
});

test.describe('F07 checking off', () => {
  test('F07-H1 one tap checks it; F07-H2 celebration when the list is finished', async ({ page, problems }) => {
    const { me } = await house(page, 'Cass');
    await must(page, 'createTasks', [task([me.id], { title: 'Only chore' })]);
    await page.goto('/chores');
    const box = page.getByRole('checkbox', { name: /Only chore/ });
    await expect(box).not.toBeChecked();
    await page.getByText('Only chore').click();
    await expect(box).toBeChecked();
    await expect(page.getByText(/finished everything/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /Only chore/ })).toBeChecked();
    checkProblems(problems);
  });

  test('F07-E1 two quick taps leave one consistent state and the right stars; F07-E2 un-check returns stars', async ({ page }) => {
    const { me } = await house(page);
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Quick', starValue: 3 })]);
    await page.goto('/chores');
    await page.getByText('Quick').dblclick();
    await page.waitForTimeout(1200);
    const rows = Number(sql(`select count(*) from task_completions where task_id='${t.id}'`));
    expect(rows).toBeLessThanOrEqual(1);
    expect(await balance(page, me.id)).toBe(rows * 3);
    // check it for sure, then un-check
    await must(page, 'setCompletion', [t.id, isoDay(0), true]);
    expect(await balance(page, me.id)).toBe(3);
    await must(page, 'setCompletion', [t.id, isoDay(0), true]); // repeat: still one
    expect(sql(`select count(*) from task_completions where task_id='${t.id}'`)).toBe('1');
    expect(await balance(page, me.id)).toBe(3);
    await must(page, 'setCompletion', [t.id, isoDay(0), false]);
    expect(await balance(page, me.id)).toBe(0);
  });

  test('F07-E3 a check in one tab shows in the other', async ({ page, context }) => {
    const { me } = await house(page);
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Shared tick' })]);
    await page.goto('/chores');
    await expect(page.getByRole('checkbox', { name: /Shared tick/ })).not.toBeChecked();
    const other = await context.newPage();
    await other.goto('/chores');
    await other.getByText('Shared tick').click();
    await expect(page.getByRole('checkbox', { name: /Shared tick/ })).toBeChecked({ timeout: 8000 });
  });

  test('F07-E4 "today" follows the household time zone, not the browser', async ({ page }) => {
    await signUp(page, { tz: 'Pacific/Auckland' });
    const ps = await must<any[]>(page, 'listProfiles');
    const me = ps.find((p) => p.kind === 'person');
    const nzToday = isoDay(0, 'Pacific/Auckland');
    await must(page, 'createTasks', [task([me.id], { title: 'Kiwi chore', startsOn: nzToday, endsOn: nzToday })]);
    await page.goto('/chores');
    await expect(page.getByText('Kiwi chore')).toBeVisible();
  });

  test('F07-N1 a viewer cannot tick a chore', async ({ page, browser, allowProblems }) => {
    const { me } = await house(page);
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Look only' })]);
    const v = await joinAs(page, browser, 'Can only look');
    await v.page.goto('/chores');
    await v.page.getByText('Look only').click();
    await expect(v.page.getByText(/look but not change/i).first()).toBeVisible();
    expect(sql(`select count(*) from task_completions where task_id='${t.id}'`)).toBe('0');
    await v.ctx.close();
    allowProblems();
  });
});

test.describe('F08 stars and rewards', () => {
  test('F08-H1/H2/E1/E3 earn, give bonus, redeem, and too few is refused', async ({ page, problems }) => {
    const { me } = await house(page, 'Cass');
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Star chore', starValue: 3 })]);
    await page.goto('/chores');
    await page.getByText('Star chore').click();
    await expect.poll(() => balance(page, me.id)).toBe(3);
    // reward for 5 on the screen
    await page.goto('/rewards');
    await page.getByRole('button', { name: 'Add a reward' }).click();
    await page.getByLabel('Name').fill('Movie night');
    await page.getByLabel('Stars needed').fill('5');
    await page.getByRole('button', { name: 'Save reward' }).click();
    await expect(page.getByRole('heading', { name: /Movie night/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /2 more to go/ })).toBeDisabled();
    const reward = (await must<any[]>(page, 'listRewards'))[0];
    expect((await rpc(page, 'redeemReward', [reward.id])).ok).toBe(false); // too few
    expect(await balance(page, me.id)).toBe(3);
    // bonus +10 then -4 shows in the history
    await page.getByLabel('How many').fill('10'); await page.getByRole('button', { name: 'Give', exact: true }).click();
    await expect.poll(() => balance(page, me.id)).toBe(13);
    await page.getByLabel('How many').fill('4'); await page.getByRole('button', { name: 'Take away' }).click();
    await expect.poll(() => balance(page, me.id)).toBe(9);
    await page.getByRole('button', { name: 'Redeem' }).click();
    await expect.poll(() => balance(page, me.id)).toBe(4);
    const hist = await must<any[]>(page, 'listStarHistory', [me.id]);
    expect(hist.map((h) => h.delta).sort((a, b) => a - b)).toEqual([-5, -4, 3, 10]);
    checkProblems(problems);
  });

  test('F08-E2 stars already spent cannot be taken back by un-checking; balance never negative', async ({ page }) => {
    const { me } = await house(page);
    const [t] = await must<any[]>(page, 'createTasks', [task([me.id], { title: 'Earn', starValue: 5 })]);
    await must(page, 'setCompletion', [t.id, isoDay(0), true]);
    const rw = await must<any>(page, 'createReward', [{ profileId: me.id, title: 'Treat', emoji: '🍦', starsNeeded: 5 }]);
    await must(page, 'redeemReward', [rw.id]);
    expect(await balance(page, me.id)).toBe(0);
    const r = await rpc(page, 'setCompletion', [t.id, isoDay(0), false]);
    expect(r.ok).toBe(false);
    expect(await balance(page, me.id)).toBe(0);
    expect(sql(`select count(*) from task_completions where task_id='${t.id}'`)).toBe('1');
  });

  test('F08-E4 reward cost 0, 501 and 2.5 are refused', async ({ page }) => {
    const { me } = await house(page);
    for (const n of [0, 501, 2.5, -3]) expect((await rpc(page, 'createReward', [{ profileId: me.id, title: 'Bad', emoji: '🎁', starsNeeded: n }])).ok, String(n)).toBe(false);
    expect((await rpc(page, 'createReward', [{ profileId: me.id, title: 'Good', emoji: '🎁', starsNeeded: 500 }])).ok).toBe(true);
  });

  test('F08-N1 a viewer cannot redeem or give stars', async ({ page, browser, allowProblems }) => {
    const { me } = await house(page);
    const rw = await must<any>(page, 'createReward', [{ profileId: me.id, title: 'Treat', emoji: '🍦', starsNeeded: 1 }]);
    await must(page, 'addBonusStars', [me.id, 5, 'seed']);
    const v = await joinAs(page, browser, 'Can only look');
    expect((await rpc(v.page, 'redeemReward', [rw.id])).ok).toBe(false);
    expect((await rpc(v.page, 'addBonusStars', [me.id, 50, 'cheat'])).ok).toBe(false);
    expect(await balance(page, me.id)).toBe(5);
    await v.ctx.close();
    allowProblems();
  });

  test('F08-N2 parent PIN: wrong tries on a display are limited', async ({ page, browser, allowProblems }) => {
    await house(page);
    await must(page, 'setPin', ['2468']);
    const dctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.44.4.4' } });
    const display = await dctx.newPage();
    const code = await readPairingCode(display);
    await linkScreen(page, code, 'Hall');
    await display.waitForURL(/calendar/, { timeout: 15000 });
    expect((await rpc(display, 'verifyPin', ['2468'])).r).toBe(true);
    for (let i = 0; i < 10; i++) await rpc(display, 'verifyPin', ['1111']);
    const locked = await rpc(display, 'verifyPin', ['2468']);
    expect(locked.r === true, 'even the right PIN is refused after 10 wrong tries').toBe(false);
    await dctx.close();
    allowProblems();
  });
});
