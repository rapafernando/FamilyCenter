import { DateTime } from 'luxon';
import type { ISODate } from './types';

export const todayIn = (tz: string): ISODate => DateTime.now().setZone(tz).toISODate()!;
export const addDays = (d: ISODate, n: number): ISODate => DateTime.fromISO(d).plus({ days: n }).toISODate()!;
export function startOfWeek(d: ISODate, weekStartsOn: number): ISODate {
  const dt = DateTime.fromISO(d); // luxon weekday: Monday=1..Sunday=7; weekStartsOn: 0=Sunday
  const diff = (dt.weekday % 7 - weekStartsOn + 7) % 7;
  return dt.minus({ days: diff }).toISODate()!;
}
export const dayRangeUTC = (from: ISODate, toExclusive: ISODate, tz: string) => ({
  from: DateTime.fromISO(from, { zone: tz }).startOf('day').toUTC().toISO()!,
  to: DateTime.fromISO(toExclusive, { zone: tz }).startOf('day').toUTC().toISO()!,
});
export const fmtTime = (iso: string, tz: string) => DateTime.fromISO(iso).setZone(tz).toFormat('h:mm a');
export const fmtDay = (iso: string, tz: string, f = 'ccc, LLL d') => DateTime.fromISO(iso).setZone(tz).toFormat(f);
export const fmtDate = (d: ISODate, f = 'cccc, LLLL d') => DateTime.fromISO(d).toFormat(f);
export const dateOfInstant = (iso: string, tz: string): ISODate => DateTime.fromISO(iso).setZone(tz).toISODate()!;
export const toInstant = (date: ISODate, time: string, tz: string) =>
  DateTime.fromISO(`${date}T${time || '00:00'}`, { zone: tz }).toUTC().toISO()!;
export const timeOfInstant = (iso: string, tz: string) => DateTime.fromISO(iso).setZone(tz).toFormat('HH:mm');
export const daysUntil = (target: ISODate, today: ISODate) => Math.round(DateTime.fromISO(target).diff(DateTime.fromISO(today), 'days').days);
export function describeTimes(o: { allDay: boolean; startsAt: string; endsAt: string; tz: string }) {
  if (o.allDay) return 'All day';
  const s = fmtTime(o.startsAt, o.tz), e = fmtTime(o.endsAt, o.tz);
  return s === e ? s : `${s} – ${e}`;
}
export const uid = (): string => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? globalThis.crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
