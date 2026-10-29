import { test, expect, signUp, must, readPairingCode, linkScreen, checkProblems, a11y } from './fixtures';

const rootPx = (p: any) => p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
const density = (p: any) => p.evaluate(() => document.documentElement.dataset.density);
/** Waits until the screen has applied its setting (before that the page is drawn at a stand-in size), then returns the text size. */
const settled = async (p: any, size: string) => { await expect.poll(() => p.evaluate(() => document.documentElement.dataset.size)).toBe(size); return rootPx(p); };

/** A signed-in owner plus a linked wall screen whose window is the given size (a 7 inch tablet is about 1024 by 600). */
async function house(page: any, browser: any, name: string, size = { width: 1024, height: 600 }) {
  await signUp(page, { household: name });
  const ctx = await browser.newContext({ viewport: size, extraHTTPHeaders: { 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.5` } });
  const display = await ctx.newPage();
  const code = await readPairingCode(display);
  await linkScreen(page, code, 'Tablet');
  await display.waitForURL(/calendar/, { timeout: 15_000 });
  const dev = (await must<any[]>(page, 'listDevices'))[0];
  return { display, ctx, dev };
}

test('SZ-1 the screen size is set per screen; automatic guesses from the pixels, and the text size nudges it', async ({ page, browser, problems }) => {
  const { display, ctx, dev } = await house(page, browser, 'Size Look House');
  // automatic on a 1024 x 600 window is a 7 inch tablet: smaller text and the compact layout
  await display.reload();
  expect(await settled(display, '7')).toBe(14);
  expect(await density(display)).toBe('compact');
  // through the Screens page
  await page.goto('/settings/devices');
  await a11y(page);
  await page.getByLabel('Screen size').selectOption('13');
  await expect.poll(async () => (await must<any[]>(page, 'listDevices'))[0].config.size).toBe('13');
  await display.reload();
  expect(await settled(display, '13')).toBe(20);
  expect(await density(display)).toBe('regular');
  await page.getByLabel('Screen size').selectOption('11');
  await expect.poll(async () => (await must<any[]>(page, 'listDevices'))[0].config.size).toBe('11');
  await display.reload();
  expect(await settled(display, '11')).toBe(18);
  // text size on top of the 7 inch setting
  await must(page, 'updateDevice', [dev.id, { config: { size: '7', zoom: 1 } }]);
  await display.reload();
  expect(await settled(display, '7')).toBe(15.75);
  // a bad value is refused
  const bad = await page.request.post('/api/rpc', { data: { m: 'updateDevice', a: [dev.id, { config: { size: '40' } }] } });
  expect((await bad.json()).ok).toBe(false);
  await ctx.close();
  checkProblems(problems);
});

test('SZ-2 on a 7 inch size the header is smaller, there is less to scroll, and nothing goes sideways in either direction of the tablet', async ({ page, browser, problems }) => {
  test.setTimeout(120000);
  const { display, ctx, dev } = await house(page, browser, 'Size Fit House');
  const measure = async (route: string, size: string) => {
    await display.goto(route);
    await settled(display, size); // the screen's own setting arrives a moment after the page
    await expect(display.getByRole('heading').first()).toBeVisible();
    return display.evaluate(() => ({ h: document.documentElement.scrollHeight, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, header: document.querySelector('header')?.getBoundingClientRect().height ?? 0 }));
  };
  const routes = ['/calendar', '/chores', '/lists', '/meals'];
  await must(page, 'updateDevice', [dev.id, { config: { size: '13' } }]);
  const big: Record<string, any> = {}; for (const r of routes) big[r] = await measure(r, '13');
  await must(page, 'updateDevice', [dev.id, { config: { size: '7' } }]);
  for (const view of [{ width: 1024, height: 600 }, { width: 600, height: 1024 }]) {
    await display.setViewportSize(view);
    for (const r of routes) {
      const small = await measure(r, '7');
      expect(small.over, `${r} at ${view.width}x${view.height} scrolls sideways`).toBeLessThanOrEqual(1);
      if (view.width === 1024) {
        expect(small.header, `${r} header`).toBeLessThan(big[r].header);
        expect(small.h, `${r} page height`).toBeLessThanOrEqual(big[r].h);
      }
    }
  }
  await ctx.close();
  checkProblems(problems);
});

test('SZ-3 a browser that is not a linked screen has its own size choice, remembered on that device', async ({ page, problems }) => {
  await signUp(page, { household: 'Size Browser House' });
  await page.goto('/settings/display');
  expect(await rootPx(page)).toBe(16);
  await a11y(page);
  await page.getByLabel('Screen size on this device').selectOption('13');
  await expect.poll(() => rootPx(page)).toBe(20);
  await page.getByLabel('Text size on this device').selectOption('-1');
  await expect.poll(() => rootPx(page)).toBe(17.5);
  await page.reload();
  await expect.poll(() => rootPx(page)).toBe(17.5);
  await page.getByLabel('Screen size on this device').selectOption('auto');
  await page.getByLabel('Text size on this device').selectOption('0');
  await expect.poll(() => rootPx(page)).toBe(16);
  checkProblems(problems);
});
