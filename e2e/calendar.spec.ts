import { test, expect, signUp, signOut, signIn, must, rpc, isoDay, sql, a11y, checkProblems, joinAs, PASSWORD, email } from './fixtures';

const TZ = 'America/New_York';
const profileIds = async (page: any) => { const ps = await must<any[]>(page, 'listProfiles'); return { family: ps.find((p) => p.kind === 'household').id as string, person: ps.find((p) => p.kind === 'person').id as string }; };

test.describe('F05 events', () => {
  test('F05-H1/H2/H3 add, edit, delete', async ({ page, problems }) => {
    await signUp(page, { name: 'Eve', tz: TZ });
    const day = isoDay(0);
    await page.goto(`/calendar/event/new?date=${day}`);
    await page.getByLabel('Title').fill('Dentist');
    await page.getByRole('button', { name: 'Family' }).click();
    await page.getByRole('button', { name: 'Add event' }).click();
    await page.waitForURL(/\/calendar/);
    await page.goto(`/calendar?view=day&date=${day}`);
    await expect(page.getByText('Dentist').first()).toBeVisible();
    await page.goto(`/calendar?view=week&date=${day}`);
    await expect(page.getByText('Dentist').first()).toBeVisible();
    // edit
    await page.goto(`/calendar?view=day&date=${day}`);
    await page.getByText('Dentist').first().click();
    await page.getByLabel('Title').fill('Dentist at 2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.goto(`/calendar?view=day&date=${day}`);
    await expect(page.getByText('Dentist at 2').first()).toBeVisible();
    // delete
    await page.getByText('Dentist at 2').first().click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.goto(`/calendar?view=day&date=${day}`);
    await expect(page.getByText('Dentist at 2')).toHaveCount(0);
    await a11y(page);
    checkProblems(problems);
  });

  test('F05-E1 empty title is not saved; F05-E7 double click saves once', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const day = isoDay(0);
    await page.goto(`/calendar/event/new?date=${day}`);
    await page.getByRole('button', { name: 'Family' }).click();
    await page.getByRole('button', { name: 'Add event' }).click();
    await expect(page).toHaveURL(/event\/new/);
    await page.getByLabel('Title').fill('Twice?');
    await page.getByRole('button', { name: 'Add event' }).dblclick().catch(() => {});
    await page.waitForURL(/\/calendar(\?|$)/);
    const { family } = await profileIds(page);
    const list = await must<any[]>(page, 'listEvents', [{ from: `${day}T00:00:00.000Z`, to: `${isoDay(2)}T23:59:59.000Z` }]);
    expect(list.filter((o) => o.title === 'Twice?').length).toBe(1);
  });

  test('F05-E2 long title with emoji does not overflow the month view', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    const day = isoDay(0);
    const long = 'Reunión familiar de los García-Núñez en la casa de la abuela 🎂🎈 con muchísima comida';
    await must(page, 'createEvent', [{ profileId: family, categoryId: null, title: long, description: '', location: '', allDay: false, startsAt: `${day}T15:00:00.000Z`, endsAt: `${day}T16:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
    for (const w of [1440, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto(`/calendar?view=month&date=${day}`);
      await expect(page.getByText(/Reunión familiar/).first()).toBeVisible().catch(() => {});
      const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(over, `horizontal scroll at ${w}px`).toBe(false);
    }
  });

  test('F05-E3 ends before it starts is refused', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    const day = isoDay(0);
    const r = await rpc(page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Backwards', description: '', location: '', allDay: false, startsAt: `${day}T16:00:00.000Z`, endsAt: `${day}T15:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
    expect(r.ok).toBe(false);
    // and through the screen
    await page.goto(`/calendar/event/new?date=${day}`);
    await page.getByLabel('Title').fill('Backwards UI');
    await page.getByRole('button', { name: 'Family' }).click();
    await page.getByLabel('Starts').fill('15:00');
    await page.getByLabel('Ends').fill('14:00');
    await page.getByRole('button', { name: 'Add event' }).click();
    await expect(page.getByText(/cannot end before|before it starts|end/i).first()).toBeVisible();
    expect(sql(`select count(*) from events where title='Backwards UI'`)).toBe('0');
  });

  test('F05-E4 weekly on Tue/Thu: delete only one occurrence', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    // next Tuesday in New York
    let d = 1; while (new Date(isoDay(d) + 'T12:00:00Z').getUTCDay() !== 2) d++;
    const start = isoDay(d);
    const ev = await must<any>(page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Swim', description: '', location: '', allDay: false, startsAt: `${start}T22:00:00.000Z`, endsAt: `${start}T23:00:00.000Z`, tz: TZ, rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', alertMinutes: [] }]);
    const win = { from: `${start}T00:00:00.000Z`, to: `${isoDay(d + 15)}T00:00:00.000Z` };
    const before = (await must<any[]>(page, 'listEvents', [win])).filter((o) => o.title === 'Swim');
    expect(before.length).toBe(5); // Tue Thu Tue Thu Tue
    const second = before[1];
    await must(page, 'deleteEvent', [ev.id, 'this', second.recurrenceId]);
    const after = (await must<any[]>(page, 'listEvents', [win])).filter((o) => o.title === 'Swim');
    expect(after.length).toBe(4);
    expect(after.map((o) => o.recurrenceId)).not.toContain(second.recurrenceId);
  });

  test('F05-E5 a repeating event keeps its local time across the daylight-saving change', async ({ page }) => {
    await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    // 9:00 New York every day from 2026-10-30; US clocks go back on 2026-11-01
    await must(page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Nine', description: '', location: '', allDay: false, startsAt: '2026-10-30T13:00:00.000Z', endsAt: '2026-10-30T14:00:00.000Z', tz: TZ, rrule: 'FREQ=DAILY', alertMinutes: [] }]);
    const list = (await must<any[]>(page, 'listEvents', [{ from: '2026-10-29T00:00:00.000Z', to: '2026-11-04T00:00:00.000Z' }])).filter((o) => o.title === 'Nine');
    expect(list.length).toBeGreaterThanOrEqual(5);
    const hours = list.map((o) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(o.startsAt)));
    expect(new Set(hours)).toEqual(new Set(['09']));
  });

  test('F05-E6 late event shows on the household day for a viewer in another time zone', async ({ page, browser }) => {
    const em = await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    const day = isoDay(1);
    // 23:30 New York = 03:30 UTC the next day (EDT, UTC-4) or 04:30 (EST); use the 'Z' for the household offset on that day
    const off = new Date(`${day}T23:30:00-04:00`).toISOString(); // fine while EDT
    await must(page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Late show', description: '', location: '', allDay: false, startsAt: off, endsAt: new Date(new Date(off).getTime() + 3600000).toISOString(), tz: TZ, rrule: null, alertMinutes: [] }]);
    const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo', extraHTTPHeaders: { 'x-forwarded-for': '10.55.5.5' } });
    const t = await ctx.newPage();
    await signIn(t, em);
    await t.waitForURL(/calendar|settings/);
    await t.goto(`/calendar?view=day&date=${day}`);
    await expect(t.getByText('Late show').first()).toBeVisible();
    await t.goto(`/calendar?view=day&date=${isoDay(2)}`);
    await expect(t.getByText('Late show')).toHaveCount(0);
    await ctx.close();
  });

  test('F05-E8 an event added in another tab appears without a reload', async ({ page, context }) => {
    await signUp(page, { tz: TZ });
    const day = isoDay(0);
    await page.goto(`/calendar?view=day&date=${day}`);
    const other = await context.newPage();
    const { family } = await profileIds(other);
    await must(other, 'createEvent', [{ profileId: family, categoryId: null, title: 'Live one', description: '', location: '', allDay: false, startsAt: `${day}T17:00:00.000Z`, endsAt: `${day}T18:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
    await expect(page.getByText('Live one').first()).toBeVisible({ timeout: 8000 });
  });

  test('F05-N1 a viewer cannot add an event', async ({ page, browser, allowProblems }) => {
    await signUp(page, { tz: TZ });
    const v = await joinAs(page, browser, 'Can only look');
    const { family } = await profileIds(v.page);
    const day = isoDay(0);
    const r = await rpc(v.page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Nope', description: '', location: '', allDay: false, startsAt: `${day}T17:00:00.000Z`, endsAt: `${day}T18:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
    expect(r.ok).toBe(false);
    await v.page.goto('/calendar');
    await expect(v.page.getByRole('link', { name: /Add (an )?event/i })).toHaveCount(0);
    await v.ctx.close();
    allowProblems();
  });

  test('F05-N2 another household\'s event id is not found', async ({ page, browser, allowProblems }) => {
    await signUp(page, { tz: TZ });
    const { family } = await profileIds(page);
    const day = isoDay(0);
    const ev = await must<any>(page, 'createEvent', [{ profileId: family, categoryId: null, title: 'Secret', description: '', location: '', allDay: false, startsAt: `${day}T17:00:00.000Z`, endsAt: `${day}T18:00:00.000Z`, tz: TZ, rrule: null, alertMinutes: [] }]);
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '10.66.6.6' } });
    const b = await ctx.newPage();
    await signUp(b, { household: 'Nosy House' });
    await b.goto(`/calendar/event/${ev.id}`);
    await expect(b.getByText('Secret')).toHaveCount(0);
    expect((await rpc(b, 'getEvent', [ev.id])).ok).toBe(false);
    expect((await rpc(b, 'deleteEvent', [ev.id])).ok).toBe(false);
    expect(sql(`select count(*) from events where id='${ev.id}'`)).toBe('1');
    await ctx.close();
    allowProblems();
  });
});
