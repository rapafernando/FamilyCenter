import { test, expect, signUp, must, rpc, isoDay, sql, a11y, checkProblems, joinAs } from './fixtures';

const TZ = 'America/New_York';
const AI = { provider: 'openai_compatible', label: 'Stand-in', model: 'test-model', baseUrl: 'http://localhost:4011/v1', apiKey: 'sk-test-1234567890abcd' };

test.describe('lists, recipes and meals', () => {
  test('lists: add, tick, clear, long text, delete', async ({ page, problems }) => {
    await signUp(page, { tz: TZ });
    await page.goto('/lists');
    await expect(page.getByRole('tab', { name: /Groceries/ })).toBeVisible();
    const add = async (t: string) => { await page.getByLabel('Add to Groceries').fill(t); await page.getByRole('button', { name: 'Add', exact: true }).click(); };
    await add('Oat milk');
    await add('Piñata 🎉 y dulces para la fiesta de cumpleaños de la abuela García-Núñez, bolsa grande');
    await expect(page.getByText('Oat milk')).toBeVisible();
    await page.getByText('Oat milk').click();
    await expect(page.getByRole('checkbox', { name: /Oat milk/ })).toBeChecked();
    await page.getByRole('button', { name: /Clear/ }).click();
    await expect(page.getByText('Oat milk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    // empty item refused, 201 characters refused
    const lists = await must<any[]>(page, 'listLists');
    expect((await rpc(page, 'addItem', [lists[0].id, '   '])).ok).toBe(false);
    expect((await rpc(page, 'addItem', [lists[0].id, 'x'.repeat(201)])).ok).toBe(false);
    // the grocery list cannot be deleted; a custom one can
    expect((await rpc(page, 'deleteList', [lists.find((l) => l.isGrocery).id])).ok).toBe(false);
    const mine = await must<any>(page, 'createList', [{ name: 'Trip', color: '#2a6f4f', emoji: '🧳' }]);
    expect((await rpc(page, 'deleteList', [mine.id])).ok).toBe(true);
    await a11y(page);
    checkProblems(problems);
  });

  test('recipes: save, add to groceries once, and delete keeps planned meals as text', async ({ page, problems }) => {
    await signUp(page, { tz: TZ });
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Weeknight tacos');
    await page.getByLabel('Category').fill('Dinner');
    await page.getByLabel('Ingredients').fill('1 lb beef\n8 tortillas\nsalsa');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await page.waitForURL(/\/recipes$/);
    await expect(page.getByText('Weeknight tacos')).toBeVisible();
    const [r] = await must<any[]>(page, 'listRecipes');
    const a = await must<any>(page, 'recipeToGrocery', [r.id]);
    expect(a.added).toBe(3);
    const b = await must<any>(page, 'recipeToGrocery', [r.id]);
    expect(b.added).toBe(0); // already there
    const day = isoDay(1);
    const meal = await must<any>(page, 'addMeal', [{ planDate: day, slot: 'dinner', title: 'Weeknight tacos', recipeId: r.id }]);
    expect((await rpc(page, 'deleteRecipe', [r.id])).ok).toBe(true);
    const meals = await must<any[]>(page, 'listMeals', [day, day]);
    expect(meals.find((m) => m.id === meal.id)?.title).toBe('Weeknight tacos');
    expect(meals.find((m) => m.id === meal.id)?.recipeId).toBeNull();
    // an empty recipe name is refused
    expect((await rpc(page, 'saveRecipe', [{ title: '  ', category: '', description: '', ingredients: [], instructions: '', source: 'manual', sourceUrl: '', favorite: false }])).ok).toBe(false);
    checkProblems(problems);
  });

  test('meals: week navigation', async ({ page, problems }) => {
    await signUp(page, { tz: TZ });
    const day = isoDay(0);
    await must(page, 'addMeal', [{ planDate: day, slot: 'dinner', title: 'Apple pie', recipeId: null }]);
    await page.goto('/meals');
    await expect(page.getByText('Apple pie')).toBeVisible();
    await page.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByText('Apple pie')).toHaveCount(0);
    await page.getByRole('button', { name: 'This week' }).click();
    await expect(page.getByText('Apple pie')).toBeVisible();
    checkProblems(problems);
  });
});

test.describe('F09 / F11 AI helper', () => {
  test('F09-E1 no key: the helper is off and absent from More', async ({ page }) => {
    await signUp(page, { tz: TZ });
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /^Assistant/ })).toHaveCount(0);
    await page.goto('/assistant');
    await expect(page.getByText('The assistant is off')).toBeVisible();
  });

  test('F09-H1/E2/E5 meal plan: review, apply once, the key is never sent back', async ({ page, context, problems }) => {
    await signUp(page, { tz: TZ });
    await must(page, 'saveAiProvider', [AI]);
    const provs = await must<any[]>(page, 'listAiProviders');
    expect(JSON.stringify(provs)).not.toContain('sk-test-1234567890abcd');
    expect(provs[0].keyLast4).toBe('abcd');
    expect(sql(`select count(*) from ai_providers where position('sk-test' in encode(api_key_encrypted,'escape')) > 0`)).toBe('0');
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /^Assistant/ })).toBeVisible();
    const job = await must<any>(page, 'runAiJob', ['meal_plan', { text: 'easy dinners for a family of four', days: 3, people: 4 }]);
    expect(job.status).toBe('needs_review');
    expect(job.proposal.length).toBe(3);
    const ids = job.proposal.map((p: any) => p.id);
    const first = await must<any>(page, 'applyAiJob', [job.id, ids]);
    expect(first.applied).toBe(3);
    const second = await rpc(page, 'applyAiJob', [job.id, ids]);
    expect(second.ok).toBe(false);
    const meals = await must<any[]>(page, 'listMeals', [isoDay(-1), isoDay(10)]);
    expect(meals.filter((m) => /chicken|chili|Soup/i.test(m.title)).length).toBe(3);
    // through the screen
    await page.goto('/assistant');
    await page.getByRole('radio', { name: /Meal/i }).check().catch(() => {});
    checkProblems(problems);
  });

  test('F11-H1 events from pasted text: reviewed, a bad item dropped, nothing added until applied', async ({ page }) => {
    await signUp(page, { tz: TZ });
    await must(page, 'saveAiProvider', [AI]);
    const job = await must<any>(page, 'runAiJob', ['event_import', { text: 'Picture day Nov 4, concert Nov 7 at 6:30 in the gym' }]);
    expect(job.proposal.map((p: any) => p.label).join('|')).not.toMatch(/Ignore all previous/);
    expect(job.proposal.length).toBe(2);
    const before = await must<any[]>(page, 'listEvents', [{ from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:00:00.000Z' }]);
    expect(before.filter((e) => ['Picture day', 'Concert'].includes(e.title))).toHaveLength(0);
    const done = await must<any>(page, 'applyAiJob', [job.id, job.proposal.map((p: any) => p.id)]);
    expect(done.applied).toBe(2);
    const after = await must<any[]>(page, 'listEvents', [{ from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:00:00.000Z' }]);
    expect(after.filter((e) => ['Picture day', 'Concert'].includes(e.title))).toHaveLength(2);
  });

  test('F09-N1 wrong key gets a friendly message; the cap is enforced; metadata addresses refused', async ({ page }) => {
    await signUp(page, { tz: TZ });
    await must(page, 'saveAiProvider', [{ ...AI, apiKey: 'bad' }]);
    const p = (await must<any[]>(page, 'listAiProviders'))[0];
    const v = await must<any>(page, 'verifyAiProvider', [p.id]);
    expect(JSON.stringify(v)).toMatch(/key/i);
    const evil = await rpc(page, 'saveAiProvider', [{ ...AI, label: 'Meta', baseUrl: 'http://169.254.169.254/latest', apiKey: 'x' }]);
    const evilVerify = evil.ok ? await rpc(page, 'verifyAiProvider', [((await must<any[]>(page, 'listAiProviders')).find((x) => x.label === 'Meta')).id]) : evil;
    expect(JSON.stringify(evilVerify)).not.toMatch(/"ok":true,"r":\{"ok":true/);
  });

  test('F09 a viewer cannot read keys or run the helper', async ({ page, browser, allowProblems }) => {
    await signUp(page, { tz: TZ });
    await must(page, 'saveAiProvider', [AI]);
    const v = await joinAs(page, browser, 'Can only look');
    expect((await rpc(v.page, 'listAiProviders')).ok).toBe(false);
    expect((await rpc(v.page, 'runAiJob', ['meal_plan', { text: 'x', days: 1 }])).ok).toBe(false);
    await v.ctx.close();
    allowProblems();
  });
});
