import { test, expect, signUp, must, rpc, sql, checkProblems, joinAs, a11y } from './fixtures';

const G = 'http://localhost:4010';
const fg = async (body: object) => (await fetch(`${G}/_ctl`, { method: 'POST', body: JSON.stringify(body) })).json();

test.beforeEach(async () => { await fg({ pickerReset: true, set: { denyNext: false } }); });

async function houseWithAlbum(page: any, household: string) {
  await signUp(page, { household });
  return must<any>(page, 'createAlbum', ['From Google']);
}
const choose = (page: any) => page.getByRole('button', { name: 'Choose photos in Google Photos' });

test('PH-1 choose photos in Google: sign in, pick in Google, the app keeps its own copies, and the access is let go', async ({ page, problems }) => {
  const album = await houseWithAlbum(page, 'Picker House');
  await page.goto('/settings/photos');
  await expect(page.getByRole('heading', { name: 'Google Photos' })).toBeVisible();
  await a11y(page);
  await choose(page).click();
  // back from Google's sign-in: step 2 asks the person to pick in Google's window
  await expect(page.getByText('Step 2.')).toBeVisible({ timeout: 15000 });
  const open = page.getByRole('link', { name: 'Open Google Photos' });
  expect(await open.getAttribute('href')).toMatch(/\/picker-ui\/ps-[a-z0-9]+\/autoclose$/);
  await a11y(page);
  expect(sql(`select count(*) from photos where album_id = '${album.id}'`)).toBe('0');
  // the person presses Done in Google
  await fg({ picker: { done: true } });
  await expect(page.getByText('Added 3 photos')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/2 were skipped/)).toBeVisible(); // a video and a file that is not a picture
  const albums = await must<any[]>(page, 'listAlbums');
  expect(albums.find((a) => a.id === album.id).photos.length).toBe(3);
  // pictures are served to the signed-in member
  const first = albums.find((a) => a.id === album.id).photos[0];
  const img = await page.request.get(first.url ?? `/api/photo/${first.id}`);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toBe('image/png');
  // nothing stays linked: the token is erased, Google's session is deleted, and the sign-in is revoked
  expect(sql(`select (token_encrypted is null)::text || ',' || status from photo_imports where album_id = '${album.id}' order by created_at desc limit 1`)).toBe('true,done');
  const log = (await fg({})).log.join('\n');
  expect(log).toContain('DELETE /picker/v1/sessions/');
  expect(log).toContain('POST /revoke');
  checkProblems(problems);
});

test('PH-2 choosing the same photos again adds nothing new, and says so', async ({ page, problems }) => {
  await houseWithAlbum(page, 'Picker Twice House');
  await page.goto('/settings/photos');
  await fg({ picker: { done: true } });
  await choose(page).click();
  await expect(page.getByText('Added 3 photos')).toBeVisible({ timeout: 25000 });
  await choose(page).click();
  await expect(page.getByText('No new photos added')).toBeVisible({ timeout: 25000 });
  await expect(page.getByText(/5 were skipped/)).toBeVisible();
  const albums = await must<any[]>(page, 'listAlbums');
  expect(albums[0].photos.length).toBe(3);
  checkProblems(problems);
});

test('PH-3 refusing in Google adds nothing and explains', async ({ page, problems }) => {
  const album = await houseWithAlbum(page, 'Picker Denied House');
  await page.goto('/settings/photos');
  await fg({ set: { denyNext: true } });
  await choose(page).click();
  await expect(page.getByText('Google Photos was not connected')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/\/settings\/photos$/);
  expect(sql(`select count(*) from photo_imports where album_id = '${album.id}'`)).toBe('0');
  checkProblems(problems);
});

test('PH-4 only a signed-in grown-up with the PIN can start it; a viewer and a locked Settings are refused', async ({ page, browser, problems }) => {
  const album = await houseWithAlbum(page, 'Picker Rules House');
  const viewer = await joinAs(page, browser, 'Can only look', 'Looker');
  // the PIN was entered a moment ago; take it away
  await page.context().clearCookies({ name: 'fc_unlock' });
  const locked = await rpc(page, 'startPhotosImport', [album.id]);
  expect(locked.ok).toBe(false); expect(locked.error?.code).toBe('locked');
  const no = await rpc(viewer.page, 'startPhotosImport', [album.id]);
  expect(no.ok).toBe(false); expect(no.error?.code).toBe('forbidden');
  const noGet = await rpc(viewer.page, 'getPhotosImport', ['00000000-0000-0000-0000-000000000000']);
  expect(noGet.ok).toBe(false);
  // an album that is not this household's is not found
  await page.goto('/settings');
  await must(page, 'verifyPin', ['2468']);
  const other = await rpc(page, 'startPhotosImport', ['00000000-0000-0000-0000-000000000000']);
  expect(other.ok).toBe(false); expect(other.error?.code).toBe('not_found');
  await viewer.ctx.close();
  checkProblems(problems);
});

test('PH-5 if Google closes the window before anyone picks, the screen says so and nothing is kept', async ({ page, problems }) => {
  const album = await houseWithAlbum(page, 'Picker Gone House');
  await page.goto('/settings/photos');
  await choose(page).click();
  await expect(page.getByText('Step 2.')).toBeVisible({ timeout: 15000 });
  await fg({ picker: { gone: true } });
  await expect(page.getByText('The photos were not added')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/closed this session/)).toBeVisible();
  expect(sql(`select (token_encrypted is null)::text || ',' || status from photo_imports where album_id = '${album.id}' order by created_at desc limit 1`)).toBe('true,expired');
  // trying again works
  await fg({ pickerReset: true });
  await choose(page).click();
  await expect(page.getByText('Step 2.')).toBeVisible({ timeout: 15000 });
  checkProblems(problems);
});

test('PH-6 cancelling while waiting lets go of the Google access', async ({ page, problems }) => {
  const album = await houseWithAlbum(page, 'Picker Cancel House');
  await page.goto('/settings/photos');
  await choose(page).click();
  await expect(page.getByText('Step 2.')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Step 2.')).toBeHidden();
  await expect.poll(() => sql(`select (token_encrypted is null)::text || ',' || status from photo_imports where album_id = '${album.id}' order by created_at desc limit 1`)).toBe('true,cancelled');
  checkProblems(problems);
});
