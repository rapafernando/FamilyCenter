import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import type { EventItem, EventOverride, ISODate, Occurrence, Task } from './types';

// Repeats are expanded "floating": the wall-clock fields are laid out in UTC, repeated, then put back in the
// event's own time zone. That keeps a 7:30 event at 7:30 across daylight saving.
const floating = (dt: DateTime) => new Date(Date.UTC(dt.year, dt.month - 1, dt.day, dt.hour, dt.minute, dt.second));
const fromFloating = (d: Date, zone: string) =>
  DateTime.fromObject({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() }, { zone });

function rule(rrule: string, start: DateTime, until: DateTime | null) {
  const o = RRule.parseString(rrule.replace(/^RRULE:/, ''));
  o.dtstart = floating(start);
  if (until) o.until = floating(until.setZone(start.zone));
  return new RRule(o);
}

export function expandEvent(ev: EventItem, fromISO: string, toISO: string, overrides: EventOverride[]): Occurrence[] {
  const start = DateTime.fromISO(ev.startsAt, { zone: ev.tz });
  const end = DateTime.fromISO(ev.endsAt, { zone: ev.tz });
  const from = DateTime.fromISO(fromISO), to = DateTime.fromISO(toISO);
  const base = (s: DateTime, e: DateTime, rid: string): Occurrence => {
    const ov = overrides.find((o) => o.eventId === ev.id && o.recurrenceId === rid);
    if (ov?.cancelled) return null as unknown as Occurrence;
    return {
      key: `${ev.id}@${rid}`, eventId: ev.id, recurrenceId: rid,
      title: ov?.title ?? ev.title, description: ov?.description ?? ev.description, location: ov?.location ?? ev.location,
      profileId: ov?.profileId ?? ev.profileId, categoryId: ev.categoryId, allDay: ev.allDay,
      startsAt: ov?.startsAt ?? s.toUTC().toISO()!, endsAt: ov?.endsAt ?? e.toUTC().toISO()!, tz: ev.tz,
      repeats: !!ev.rrule, source: ev.source, calendarId: ev.calendarId, alertMinutes: ev.alertMinutes,
    };
  };
  const overlaps = (o: Occurrence) => DateTime.fromISO(o.endsAt) > from && DateTime.fromISO(o.startsAt) < to;
  if (!ev.rrule) {
    const o = base(start, end, ev.startsAt);
    return o && (overlaps(o) || (DateTime.fromISO(o.startsAt) >= from && DateTime.fromISO(o.startsAt) < to)) ? [o] : [];
  }
  const until = ev.recurrenceUntil ? DateTime.fromISO(ev.recurrenceUntil) : null;
  const r = rule(ev.rrule, start, until);
  const spanDays = ev.allDay ? Math.round(end.diff(start, 'days').days) : 0;
  const durMs = end.toMillis() - start.toMillis();
  // look back one span so an occurrence that started before the window but runs into it still counts
  const lo = floating(from.setZone(ev.tz).minus({ milliseconds: Math.max(durMs, 0) + 86400000 }));
  const hi = floating(to.setZone(ev.tz));
  const out: Occurrence[] = [];
  for (const d of r.between(lo, hi, true)) {
    const s = fromFloating(d, ev.tz);
    const e = ev.allDay ? s.plus({ days: spanDays }) : s.plus({ milliseconds: durMs });
    const o = base(s, e, s.toUTC().toISO()!);
    if (o && overlaps(o)) out.push(o);
  }
  return out;
}

/** Does a chore or routine fall on this date? No repeat rule means it is a one-off on startsOn. */
export function taskOccursOn(t: Task, date: ISODate): boolean {
  if (!t.active || date < t.startsOn || (t.endsOn && date > t.endsOn)) return false;
  if (!t.rrule) return date === t.startsOn;
  const start = DateTime.fromISO(t.startsOn, { zone: 'utc' });
  const day = DateTime.fromISO(date, { zone: 'utc' });
  const r = rule(t.rrule, start, null);
  return r.between(floating(day), floating(day.plus({ hours: 23, minutes: 59 })), true).length > 0;
}

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export function buildRrule(kind: RepeatKind, weekdays: number[] = []): string | null {
  switch (kind) {
    case 'none': return null;
    case 'daily': return 'FREQ=DAILY';
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly': return weekdays.length ? `FREQ=WEEKLY;BYDAY=${weekdays.map((d) => DAYS[d]).join(',')}` : 'FREQ=WEEKLY';
    case 'monthly': return 'FREQ=MONTHLY';
    case 'yearly': return 'FREQ=YEARLY';
  }
}
export function parseRrule(rrule: string | null): { kind: RepeatKind; weekdays: number[] } {
  if (!rrule) return { kind: 'none', weekdays: [] };
  const o = RRule.parseString(rrule.replace(/^RRULE:/, ''));
  const wd = (Array.isArray(o.byweekday) ? o.byweekday : o.byweekday ? [o.byweekday] : []).map((d) => (typeof d === 'number' ? d : (d as { weekday: number }).weekday));
  if (o.freq === RRule.DAILY) return { kind: 'daily', weekdays: [] };
  if (o.freq === RRule.MONTHLY) return { kind: 'monthly', weekdays: [] };
  if (o.freq === RRule.YEARLY) return { kind: 'yearly', weekdays: [] };
  if (o.freq === RRule.WEEKLY) return wd.length === 5 && [0, 1, 2, 3, 4].every((d) => wd.includes(d)) ? { kind: 'weekdays', weekdays: wd } : { kind: 'weekly', weekdays: wd };
  return { kind: 'none', weekdays: [] };
}
