import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const PASSWORD = 'correct-horse-9';
export const PIN = '2468';

/** Every test is a different visitor to the rate limiter, and fails on console errors or server (5xx) errors. */
export const test = base.extend<{ problems: string[]; allowProblems: () => void }>({
  problems: [async ({ page }, use) => {
    const problems: string[] = [];
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => problems.push('page error: ' + e.message.slice(0, 200)));
    page.on('response', (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    await use(problems);
  }, { auto: true }],
  allowProblems: async ({ problems }, use) => { await use(() => { problems.length = 0; }); },
});
// Checked after each test body by the afterEach in each spec file via checkProblems().
export const checkProblems = (problems: string[]) => expect(problems, 'console / server errors').toEqual([]);

export function email(tag = 'u') { return `${tag}-${uid()}@example.test`; }

/** Creates a new household through the sign-up screen and lands in the app. */
export async function signUp(page: Page, o: { name?: string; email?: string; household?: string; tz?: string; pin?: string } = {}) {
  const em = o.email ?? email('owner');
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(o.name ?? 'Test Owner');
  await page.getByLabel('Email').fill(em);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Household name').fill(o.household ?? 'Test House');
  await page.getByLabel(/Parent PIN/).fill(o.pin ?? PIN);
  if (o.tz) await page.getByLabel('Time zone').selectOption(o.tz);
  await page.getByRole('button', { name: 'Create household' }).click();
  await page.waitForURL(/\/settings\/profiles/);
  return em;
}

export async function signOut(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Sign out$/ }).click();
  await page.waitForURL(/\/(welcome|signin)/);
}

export async function signIn(page: Page, em: string, pw = PASSWORD) {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(em);
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: /^Sign in$/ }).click();
}

export async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}

/** Direct database helper for facts the screen cannot show (rows, mails). Uses the same local test database. */
export function sql(q: string): string {
  return execFileSync('psql', ['-h', '/tmp', '-p', '5433', '-U', 'postgres', 'family', '-Atc', q]).toString().trim();
}
export { expect };

/** Reads the 6-character code a display shows on /pair. */
export async function readPairingCode(display: Page) {
  await display.goto('/pair');
  const t = await display.locator('.sr-only', { hasText: /^Code / }).first().textContent();
  return t!.replace('Code', '').replace(/\s/g, '');
}
export async function linkScreen(page: Page, code: string, name: string) {
  await page.goto('/settings/devices/link');
  await page.getByLabel('Code on the screen').fill(code);
  await page.getByLabel('Name for this screen').fill(name);
  await page.getByRole('button', { name: 'Link screen' }).click();
}

/** Enters the parent PIN the way the PIN pad does: the server remembers it for five minutes in this browser. */
export async function unlockSettings(page: Page, pin = PIN) {
  const j = await rpc(page, 'verifyPin', [pin]);
  if (!j.ok || j.r !== true) throw new Error('PIN refused');
}

/** The owner invites someone by link; that person joins in a separate browser. Returns their page. */
export async function joinAs(owner: Page, browser: import('@playwright/test').Browser, role: 'Adult' | 'Can only look', name = 'Guest') {
  const to = email(role === 'Adult' ? 'adult' : 'viewer');
  await owner.goto('/settings/household');
  await owner.getByLabel('Invite by email').fill(to);
  await owner.getByLabel('As').selectOption({ label: role });
  await owner.getByRole('button', { name: 'Invite' }).click();
  const url = await owner.getByLabel(`Invitation link for ${to}`).inputValue();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7` } });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.getByLabel('Your name').fill(name);
  await p.getByLabel('Email').fill(to);
  await p.getByLabel('Password').fill(PASSWORD);
  await p.getByRole('button', { name: /Create account and join/ }).click();
  await p.waitForURL(/calendar|settings|chores/);
  return { page: p, ctx, email: to, url };
}

/** Calls the app's endpoint as the signed-in person in this browser. Returns the parsed answer. */
export async function rpc<T = any>(page: Page, m: string, a: unknown[] = []): Promise<{ ok: boolean; r?: T; error?: { code: string; message: string } }> {
  const res = await page.request.post('/api/rpc', { headers: { 'content-type': 'application/json' }, data: { m, a } });
  return res.json();
}
export async function must<T = any>(page: Page, m: string, a: unknown[] = []): Promise<T> {
  const j = await rpc<T>(page, m, a);
  if (!j.ok) throw new Error(`${m} failed: ${j.error?.code} ${j.error?.message}`);
  return j.r as T;
}
export const isoDay = (offset = 0, tz = 'America/New_York') => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
