import { test, expect, signUp, must, rpc, sql, checkProblems, joinAs } from './fixtures';
import { deflateSync } from 'node:zlib';

// A small real PNG of one colour, built here so the tests need no image files.
function crc(buf: Buffer) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type: string, data: Buffer) { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); }
export function png(r: number, g: number, b: number, size = 8): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: size }, () => Buffer.from([r, g, b])))]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const url = (b: Buffer, mime = 'image/png') => `data:${mime};base64,${b.toString('base64')}`;
const item = (b: Buffer, caption = '', mime = 'image/png') => ({ dataUrl: url(b, mime), caption, width: 8, height: 8 });

test.describe('F15 photos and ads', () => {
  test('F15-H1/H2 upload on the screen, the screensaver shows them and a labelled card after the third', async ({ page, problems }) => {
    await signUp(page, { tz: 'America/New_York' });
    await must(page, 'updateHousehold', [{ adsEnabled: true, adsEveryNPhotos: 3 }]);
    const album = await must<any>(page, 'createAlbum', ['Lake']);
    await page.goto('/settings/photos');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add pictures' }).first().click();
    await (await chooser).setFiles([1, 2, 3].map((i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: png(40 * i, 90, 200 - 40 * i, 32) })));
    await expect.poll(async () => (await must<any[]>(page, 'listAlbums'))[0]?.photos.length, { timeout: 15000 }).toBe(3);
    // screensaver: photos then a sponsored card (the page's timers are sped up)
    await page.clock.install();
    await page.goto('/screensaver');
    await expect(page.getByRole('dialog', { name: 'Photo screensaver' })).toBeVisible();
    let adAt = -1;
    for (let step = 0; step < 7 && adAt < 0; step++) {
      if (await page.getByText(/sponsored/i).first().isVisible().catch(() => false)) { adAt = step; break; }
      await page.clock.runFor(9000);
    }
    expect(adAt, 'a labelled sponsored card appears after exactly three photos').toBe(3);
    // H2: tapping the card shows a code to scan and stays in the app
    await page.getByRole('button', { name: /sponsored|learn more|open/i }).first().click().catch(async () => { await page.getByText(/sponsored/i).first().click(); });
    await expect(page.locator('img[alt*="QR" i], img[src^="data:image/png"]').first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/screensaver');
    checkProblems(problems);
  });

  test('F15-E1 text or SVG pretending to be a picture is refused; F15-E2 over 8 MB refused; F15-E5 duplicate stored once', async ({ page }) => {
    await signUp(page);
    const album = await must<any>(page, 'createAlbum', ['Tests']);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
    expect((await rpc(page, 'addPhotos', [album.id, [item(svg, 'bad', 'image/png')]])).ok, 'svg as png').toBe(false);
    expect((await rpc(page, 'addPhotos', [album.id, [item(Buffer.from('hello world'), 'text', 'image/jpeg')]])).ok, 'text as jpeg').toBe(false);
    expect((await rpc(page, 'addPhotos', [album.id, [item(svg, 'svg', 'image/svg+xml')]])).ok, 'svg mime').toBe(false);
    const big = Buffer.concat([png(1, 2, 3), Buffer.alloc(9 * 1024 * 1024)]);
    expect((await rpc(page, 'addPhotos', [album.id, [item(big, 'big')]])).ok, '9 MB').toBe(false);
    const one = png(10, 20, 30);
    await must(page, 'addPhotos', [album.id, [item(one, 'a')]]);
    await must(page, 'addPhotos', [album.id, [item(one, 'a again')]]);
    const a = (await must<any[]>(page, 'listAlbums'))[0];
    expect(a.photos).toHaveLength(1);
    const files = sql(`select count(*) from photos where album_id='${album.id}'`);
    expect(files).toBe('1');
  });

  test('F15-E3 ads switched off: no sponsored card; F15-E4 pictures need a sign-in; other households cannot open them', async ({ page, browser, allowProblems }) => {
    await signUp(page);
    const album = await must<any>(page, 'createAlbum', ['Private']);
    await must(page, 'addPhotos', [album.id, [item(png(5, 5, 5), 'one'), item(png(6, 6, 6), 'two'), item(png(7, 7, 7), 'three'), item(png(8, 8, 8), 'four')]]);
    await must(page, 'updateHousehold', [{ adsEnabled: false }]);
    const slides = (await must<any>(page, 'screensaverSlides', [12, 0])).slides as any[];
    expect(slides.filter((s) => s.type === 'ad')).toHaveLength(0);
    await must(page, 'updateHousehold', [{ adsEnabled: true, adsEveryNPhotos: 3 }]);
    const withAds = (await must<any>(page, 'screensaverSlides', [12, 0])).slides as any[];
    expect(withAds.filter((s) => s.type === 'ad').length).toBeGreaterThan(0);
    const first = withAds.indexOf(withAds.find((s) => s.type === 'ad'));
    expect(first, 'never an ad before three photos').toBeGreaterThanOrEqual(3);
    const photo = (withAds.find((s) => s.type === 'photo') as any).dataUrl as string;
    expect(photo).toMatch(/^\/api\/photo\//);
    const ok = await page.request.get(photo);
    expect(ok.status()).toBe(200);
    expect(ok.headers()['x-content-type-options']).toBe('nosniff');
    expect(ok.headers()['content-security-policy']).toContain('sandbox');
    // minimum frequency: every 2 photos is refused
    expect((await rpc(page, 'updateHousehold', [{ adsEveryNPhotos: 2 }])).ok).toBe(false);
    // signed out
    const anon = await browser.newContext();
    expect((await anon.request.get(`http://localhost:3100${photo}`)).status()).toBe(401);
    await anon.close();
    // another household
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.88.8.8' } });
    const b = await ctx.newPage();
    await signUp(b, { household: 'Nosy Photos' });
    expect((await b.request.get(photo)).status()).toBe(404);
    expect((await rpc(b, 'listAlbums')).r).toHaveLength(0);
    const ph = sql(`select id from photos where album_id='${album.id}' limit 1`);
    expect((await rpc(b, 'deletePhoto', [ph])).ok === true && sql(`select count(*) from photos where id='${ph}' and deleted_at is null`) === '0').toBe(false);
    await ctx.close();
    allowProblems();
  });

  test('F15-N1 a forged ad hand-off link goes nowhere', async ({ page }) => {
    for (const t of ['forged', 'abc.def', 'eyJ0IjoiYWQifQ.AAAA', '../../etc/passwd']) {
      const r = await page.request.get(`/api/v1/ads/handoff/${encodeURIComponent(t)}`, { maxRedirects: 0 });
      expect(r.status(), t).toBeGreaterThanOrEqual(400);
      expect(r.status(), t).toBeLessThan(500);
    }
  });

  test('F15 a viewer can see photos but not add or remove them', async ({ page, browser, allowProblems }) => {
    await signUp(page);
    const album = await must<any>(page, 'createAlbum', ['Look']);
    await must(page, 'addPhotos', [album.id, [item(png(1, 1, 1))]]);
    const v = await joinAs(page, browser, 'Can only look');
    expect((await rpc(v.page, 'addPhotos', [album.id, [item(png(2, 2, 2))]])).ok).toBe(false);
    expect((await rpc(v.page, 'screensaverSlides', [5, 0])).ok).toBe(true);
    await v.ctx.close();
    allowProblems();
  });
});
