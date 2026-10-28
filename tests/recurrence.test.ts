import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { expandEvent, taskOccursOn, buildRrule, parseRrule } from '../src/lib/recurrence';
import type { EventItem, Task } from '../src/lib/types';

const TZ = 'America/New_York';
const ev = (o: Partial<EventItem>): EventItem => ({
  id: 'e1', calendarId: null, profileId: 'p', categoryId: null, title: 'T', description: '', location: '', allDay: false,
  startsAt: DateTime.fromISO('2026-10-26T07:30', { zone: TZ }).toUTC().toISO()!, endsAt: DateTime.fromISO('2026-10-26T08:00', { zone: TZ }).toUTC().toISO()!,
  tz: TZ, rrule: 'FREQ=WEEKLY;BYDAY=MO', recurrenceUntil: null, alertMinutes: [], source: 'local', ...o,
});
const local = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toFormat('yyyy-MM-dd HH:mm');

test('weekly event keeps 7:30 local time across the November clock change', () => {
  const out = expandEvent(ev({}), '2026-10-25T00:00:00Z', '2026-11-20T00:00:00Z', []);
  assert.deepEqual(out.map((o) => local(o.startsAt)), ['2026-10-26 07:30', '2026-11-02 07:30', '2026-11-09 07:30', '2026-11-16 07:30']);
});
test('an override changes one occurrence and a cancel removes one', () => {
  const rid = DateTime.fromISO('2026-11-02T07:30', { zone: TZ }).toUTC().toISO()!;
  const rid2 = DateTime.fromISO('2026-11-09T07:30', { zone: TZ }).toUTC().toISO()!;
  const out = expandEvent(ev({}), '2026-10-25T00:00:00Z', '2026-11-20T00:00:00Z', [
    { id: 'o1', eventId: 'e1', recurrenceId: rid, cancelled: false, title: 'Moved title' }, { id: 'o2', eventId: 'e1', recurrenceId: rid2, cancelled: true }]);
  assert.equal(out.length, 3);
  assert.equal(out.find((o) => o.recurrenceId === rid)!.title, 'Moved title');
});
test('recurrenceUntil stops the series', () => {
  const until = DateTime.fromISO('2026-11-05T00:00', { zone: TZ }).toUTC().toISO()!;
  const out = expandEvent(ev({ recurrenceUntil: until }), '2026-10-25T00:00:00Z', '2026-12-20T00:00:00Z', []);
  assert.equal(out.length, 2);
});
test('all-day multi-day event spans midnight to midnight', () => {
  const s = DateTime.fromISO('2026-11-01', { zone: TZ }).toUTC().toISO()!, e = DateTime.fromISO('2026-11-03', { zone: TZ }).toUTC().toISO()!;
  const out = expandEvent(ev({ allDay: true, startsAt: s, endsAt: e, rrule: null }), DateTime.fromISO('2026-11-02', { zone: TZ }).toUTC().toISO()!, DateTime.fromISO('2026-11-03', { zone: TZ }).toUTC().toISO()!, []);
  assert.equal(out.length, 1);
});
test('a one-off outside the window is not returned', () => {
  assert.equal(expandEvent(ev({ rrule: null }), '2026-12-01T00:00:00Z', '2026-12-08T00:00:00Z', []).length, 0);
});
const task = (o: Partial<Task>): Task => ({ id: 't', groupId: 'g', profileId: 'p', kind: 'chore', title: 'x', emoji: '', timeOfDay: null, dueTime: null, startsOn: '2026-10-01', endsOn: null, rrule: 'FREQ=WEEKLY;BYDAY=TU,FR', starValue: 1, active: true, sortOrder: 0, ...o });
test('weekly chore falls on its days only', () => {
  assert.equal(taskOccursOn(task({}), '2026-10-27'), true); // Tuesday
  assert.equal(taskOccursOn(task({}), '2026-10-28'), false); // Wednesday
  assert.equal(taskOccursOn(task({}), '2026-10-30'), true); // Friday
});
test('one-off chore falls only on its start date, and not before it starts or after it ends', () => {
  assert.equal(taskOccursOn(task({ rrule: null, startsOn: '2026-10-28' }), '2026-10-28'), true);
  assert.equal(taskOccursOn(task({ rrule: null, startsOn: '2026-10-28' }), '2026-10-29'), false);
  assert.equal(taskOccursOn(task({ rrule: 'FREQ=DAILY', endsOn: '2026-10-10' }), '2026-10-11'), false);
});
test('rrule helpers round trip', () => {
  assert.deepEqual(parseRrule(buildRrule('weekly', [1, 3])), { kind: 'weekly', weekdays: [1, 3] });
  assert.equal(parseRrule(buildRrule('weekdays')).kind, 'weekdays');
  assert.equal(parseRrule(null).kind, 'none');
});
