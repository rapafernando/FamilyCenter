import { DateTime } from 'luxon';
import { addDays, dateOfInstant, startOfWeek } from './time';
import type { ISODate, Occurrence } from './types';

export type View = 'day' | 'week' | 'month';

/** The first and last day shown, and the label, for a view around a date. */
export function windowFor(view: View, date: ISODate, weekStartsOn: number) {
  if (view === 'day') return { start: date, endExclusive: addDays(date, 1), label: DateTime.fromISO(date).toFormat('cccc, LLLL d') };
  if (view === 'week') {
    const s = startOfWeek(date, weekStartsOn), e = addDays(s, 6);
    const a = DateTime.fromISO(s), b = DateTime.fromISO(e);
    return { start: s, endExclusive: addDays(s, 7), label: a.month === b.month ? `${a.toFormat('LLLL d')} – ${b.toFormat('d')}` : `${a.toFormat('LLL d')} – ${b.toFormat('LLL d')}` };
  }
  const first = DateTime.fromISO(date).startOf('month'), last = first.endOf('month');
  const s = startOfWeek(first.toISODate()!, weekStartsOn), e = addDays(startOfWeek(last.toISODate()!, weekStartsOn), 7);
  return { start: s, endExclusive: e, label: first.toFormat('LLLL yyyy') };
}
export function step(view: View, date: ISODate, dir: 1 | -1): ISODate {
  if (view === 'day') return addDays(date, dir);
  if (view === 'week') return addDays(date, 7 * dir);
  return DateTime.fromISO(date).plus({ months: dir }).startOf('month').toISODate()!;
}
/** Every date an occurrence appears on (a three-day trip shows on three days). */
export function occurrenceDays(o: Occurrence, tz: string): ISODate[] {
  const s = dateOfInstant(o.startsAt, tz);
  let e = dateOfInstant(o.endsAt, tz);
  if (o.allDay || DateTime.fromISO(o.endsAt).setZone(tz).toFormat('HH:mm') === '00:00') e = addDays(e, -1);
  if (e < s) e = s;
  const out: ISODate[] = []; for (let d = s; d <= e && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}
export function groupByDay(list: Occurrence[], tz: string): Map<ISODate, Occurrence[]> {
  const m = new Map<ISODate, Occurrence[]>();
  for (const o of list) for (const d of occurrenceDays(o, tz)) { (m.get(d) ?? m.set(d, []).get(d)!).push(o); }
  return m;
}
