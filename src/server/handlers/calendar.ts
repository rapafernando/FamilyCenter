import { z } from 'zod';
import { DateTime } from 'luxon';
import { ApiError, type Category, type Countdown, type EventItem, type EventOverride, type Occurrence } from '@/lib/types';
import { expandEvent } from '@/lib/recurrence';
import { def, tenant, zDate, zHex, zId, zInstant, zStr } from '../rpc';
import { clean } from './core';
import { pushEventToGoogle, pushSyncedChange } from '../google';

type ERow = { id: string; calendar_id: string | null; profile_id: string; category_id: string | null; title: string; description: string | null; location: string | null; all_day: boolean; starts_at: string; ends_at: string; tz: string; rrule: string | null; recurrence_until: string | null; alert_minutes: number[]; source: EventItem['source'] };
const ECOLS = 'id, calendar_id, profile_id, category_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, recurrence_until, alert_minutes, source';
export const mapEvent = (r: ERow): EventItem => ({ id: r.id, calendarId: r.calendar_id, profileId: r.profile_id, categoryId: r.category_id, title: r.title, description: r.description ?? '', location: r.location ?? '', allDay: r.all_day, startsAt: r.starts_at, endsAt: r.ends_at, tz: r.tz, rrule: r.rrule, recurrenceUntil: r.recurrence_until, alertMinutes: r.alert_minutes, source: r.source });
type ORow = { id: string; event_id: string; recurrence_id: string; cancelled: boolean; title: string | null; description: string | null; location: string | null; starts_at: string | null; ends_at: string | null; profile_id: string | null };
const mapOverride = (o: ORow): EventOverride => ({ id: o.id, eventId: o.event_id, recurrenceId: o.recurrence_id, cancelled: o.cancelled, title: o.title ?? undefined, description: o.description ?? undefined, location: o.location ?? undefined, startsAt: o.starts_at ?? undefined, endsAt: o.ends_at ?? undefined, profileId: o.profile_id ?? undefined });

const scope = z.enum(['this', 'following', 'all']);
const alerts = z.array(z.number().int().min(0).max(60 * 24 * 14)).max(5);
const CODE = { 0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'cloud-sun'], 3: ['Cloudy', 'cloud'], 45: ['Foggy', 'cloud'], 48: ['Foggy', 'cloud'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'], 95: ['Thunderstorms', 'storm'], 96: ['Thunderstorms', 'storm'], 99: ['Thunderstorms', 'storm'] } as Record<number, [string, string]>;
const wcache = new Map<string, { at: number; v: unknown }>();

async function guardWritable(t: { one: <T>(s: string, p?: unknown[]) => Promise<T | null> }, ev: { source: string; calendar_id: string | null; rrule: string | null }, scopeName: string) {
  if (ev.source !== 'synced') return;
  const c = await t.one<{ mode: string }>('select cc.mode from synced_calendars sc join calendar_connections cc on cc.id = sc.connection_id where sc.id = $1', [ev.calendar_id]);
  if (c?.mode !== 'two_way') throw new ApiError('read_only', 'This event comes from a Google calendar that is read only here. Change it in Google Calendar, or switch the connection to two-way.');
  if (ev.rrule && scopeName !== 'all') throw new ApiError('read_only', 'Change single repeats of a Google event in Google Calendar. Editing the whole series works here.');
}

export const calendar = {
  /* ---------------------------------------------------------------- categories, countdowns, weather */
  listCategories: def('read', [], async (c): Promise<Category[]> => tenant(c, (t) => t.all<Category>('select id, name, upper(color) as color from event_categories order by lower(name)'))),
  createCategory: def('adult', [z.object({ name: zStr(60), color: zHex })], async (c, i) => {
    if (!clean(i.name)) throw new ApiError('missing', 'Give the category a name.');
    return (await tenant(c, (t) => t.one<Category>('insert into event_categories (household_id, name, color) values ($1,$2,$3) returning id, name, upper(color) as color', [c.hid, clean(i.name), i.color])))!;
  }, { write: true }),
  deleteCategory: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from event_categories where id = $1', [id])); }, { write: true }),
  listCountdowns: def('read', [], async (c): Promise<Countdown[]> => (await tenant(c, (t) => t.all<{ id: string; title: string; target_date: string; emoji: string | null; show_on_display: boolean }>('select id, title, target_date, emoji, show_on_display from countdowns order by target_date')))
    .map((r) => ({ id: r.id, title: r.title, targetDate: r.target_date, emoji: r.emoji ?? '', showOnDisplay: r.show_on_display }))),
  createCountdown: def('adult', [z.object({ title: zStr(80), targetDate: zDate, emoji: zStr(8), showOnDisplay: z.boolean() })], async (c, i): Promise<Countdown> => {
    if (!clean(i.title)) throw new ApiError('missing', 'Give the countdown a name.');
    const r = (await tenant(c, (t) => t.one<{ id: string }>('insert into countdowns (household_id, title, target_date, emoji, show_on_display) values ($1,$2,$3,$4,$5) returning id', [c.hid, clean(i.title), i.targetDate, i.emoji || null, i.showOnDisplay])))!;
    return { id: r.id, title: clean(i.title), targetDate: i.targetDate, emoji: i.emoji, showOnDisplay: i.showOnDisplay };
  }, { write: true }),
  deleteCountdown: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from countdowns where id = $1', [id])); }, { write: true }),
  getWeather: def('read', [], async (c) => {
    const loc = (await tenant(c, (t) => t.one<{ location: string }>('select location from households where id = $1', [c.hid])))?.location.trim();
    if (!loc) return null;
    const hit = wcache.get(loc); if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
    try {
      const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc.split(',')[0])}&count=1`, { signal: AbortSignal.timeout(6000) })).json() as { results?: { latitude: number; longitude: number }[] };
      const g = geo.results?.[0]; if (!g) return null;
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`, { signal: AbortSignal.timeout(6000) })).json() as { current: { temperature_2m: number; weather_code: number }; daily: { temperature_2m_max: number[]; temperature_2m_min: number[] } };
      const [label, icon] = CODE[w.current.weather_code] ?? ['Weather', 'cloud'];
      const v = { tempF: Math.round(w.current.temperature_2m), low: Math.round(w.daily.temperature_2m_min[0]), high: Math.round(w.daily.temperature_2m_max[0]), label, icon };
      wcache.set(loc, { at: Date.now(), v }); return v;
    } catch { return null; }
  }),

  /* ---------------------------------------------------------------- events */
  listEvents: def('read', [z.object({ from: zInstant, to: zInstant, profileIds: z.array(zId).max(50).optional() })], async (c, q): Promise<Occurrence[]> => tenant(c, async (t) => {
    const evs = (await t.all<ERow>(`select ${ECOLS} from events e where deleted_at is null and starts_at < $2
        and (rrule is not null and (recurrence_until is null or recurrence_until >= $1) or ends_at >= $1)
        and (calendar_id is null or exists (select 1 from synced_calendars s where s.id = e.calendar_id and s.enabled))`, [q.from, q.to])).map(mapEvent);
    const ids = evs.filter((e) => e.rrule).map((e) => e.id);
    const ovs = ids.length ? (await t.all<ORow>('select id, event_id, recurrence_id, cancelled, title, description, location, starts_at, ends_at, profile_id from event_overrides where event_id = any($1)', [ids])).map(mapOverride) : [];
    const out = evs.flatMap((e) => expandEvent(e, q.from, q.to, ovs.filter((o) => o.eventId === e.id))).filter((o) => !q.profileIds || q.profileIds.includes(o.profileId));
    return out.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
  })),
  getEvent: def('read', [zId], async (c, id) => {
    const r = await tenant(c, (t) => t.one<ERow>(`select ${ECOLS} from events where id = $1 and deleted_at is null`, [id]));
    if (!r) throw new ApiError('not_found', 'That event was not found.');
    return mapEvent(r);
  }),
  createEvent: def('member', [z.object({
    profileId: zId, categoryId: zId.nullable(), title: zStr(200), description: zStr(4000), location: zStr(300), allDay: z.boolean(), startsAt: zInstant, endsAt: zInstant, tz: zStr(64),
    rrule: zStr(300).nullable(), alertMinutes: alerts, recurrenceUntil: zInstant.nullable().optional(), saveToCalendarId: zId.nullable().optional(), source: z.string().optional(), calendarId: z.string().nullable().optional(),
  })], async (c, i) => {
    if (!clean(i.title)) throw new ApiError('missing', 'Give the event a title.');
    if (!i.profileId) throw new ApiError('missing', 'Choose who this event is for.');
    if (i.endsAt < i.startsAt) throw new ApiError('invalid_time', 'The event cannot end before it starts.');
    if (i.saveToCalendarId) {
      const { id } = await pushEventToGoogle(c, { ...i, saveToCalendarId: i.saveToCalendarId });
      return mapEvent((await tenant(c, (t) => t.one<ERow>(`select ${ECOLS} from events where id = $1`, [id])))!);
    }
    return mapEvent((await tenant(c, (t) => t.one<ERow>(
      `insert into events (household_id, profile_id, category_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, recurrence_until, alert_minutes, source, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'local',$14) returning ${ECOLS}`,
      [c.hid, i.profileId, i.categoryId, clean(i.title), i.description || null, i.location || null, i.allDay, i.startsAt, i.endsAt, i.tz, i.rrule || null, i.recurrenceUntil ?? null, i.alertMinutes, c.userId ?? null])))!);
  }, { write: true }),
  updateEvent: def('member', [zId, z.object({
    title: zStr(200).optional(), description: zStr(4000).optional(), location: zStr(300).optional(), profileId: zId.optional(), categoryId: zId.nullable().optional(), allDay: z.boolean().optional(),
    startsAt: zInstant.optional(), endsAt: zInstant.optional(), rrule: zStr(300).nullable().optional(), alertMinutes: alerts.optional(),
  }), scope, zInstant.optional()], async (c, id, p, sc, recurrenceId) => {
    if (p.title !== undefined && !clean(p.title)) throw new ApiError('missing', 'Give the event a title.');
    if (p.startsAt && p.endsAt && p.endsAt < p.startsAt) throw new ApiError('invalid_time', 'The event cannot end before it starts.');
    await tenant(c, async (t) => {
      const ev = await t.one<ERow>(`select ${ECOLS} from events where id = $1 and deleted_at is null for update`, [id]);
      if (!ev) throw new ApiError('not_found', 'That event was not found.');
      await guardWritable(t, ev, sc);
      const set = async (target: string, f: Partial<Record<string, unknown>>) => {
        const keys = Object.keys(f); if (!keys.length) return;
        await t.exec(`update events set ${keys.map((k, n) => `${k} = $${n + 2}`).join(', ')} where id = $1`, [target, ...keys.map((k) => f[k])]);
      };
      const cols = (x: typeof p) => Object.fromEntries(Object.entries({ title: x.title === undefined ? undefined : clean(x.title), description: x.description, location: x.location, profile_id: x.profileId, category_id: x.categoryId, all_day: x.allDay, starts_at: x.startsAt, ends_at: x.endsAt, rrule: x.rrule, alert_minutes: x.alertMinutes }).filter(([, v]) => v !== undefined));
      if (!ev.rrule || sc === 'all') {
        const next = { ...p };
        if (ev.rrule && p.startsAt && p.endsAt && recurrenceId) {
          // move the whole series by the same number of days and onto the same clock time
          const occ = DateTime.fromISO(recurrenceId, { zone: ev.tz }), ns = DateTime.fromISO(p.startsAt, { zone: ev.tz }), ne = DateTime.fromISO(p.endsAt, { zone: ev.tz });
          const dd = Math.round(ns.startOf('day').diff(occ.startOf('day'), 'days').days);
          const st = DateTime.fromISO(ev.starts_at, { zone: ev.tz }).plus({ days: dd }).set({ hour: ns.hour, minute: ns.minute });
          next.startsAt = st.toUTC().toISO()!; next.endsAt = st.plus({ milliseconds: ne.toMillis() - ns.toMillis() }).toUTC().toISO()!;
        }
        const f = cols(next); if ('rrule' in p && !p.rrule) { f.rrule = null; f.recurrence_until = null; }
        await set(id, f);
      } else if (sc === 'this') {
        if (!recurrenceId) throw new ApiError('missing', 'The date of the repeat is needed.');
        await t.exec(`insert into event_overrides (household_id, event_id, recurrence_id, cancelled, title, description, location, starts_at, ends_at, profile_id)
          values ($1,$2,$3,false,$4,$5,$6,$7,$8,$9)
          on conflict (event_id, recurrence_id) do update set cancelled = false,
            title = coalesce(excluded.title, event_overrides.title), description = coalesce(excluded.description, event_overrides.description), location = coalesce(excluded.location, event_overrides.location),
            starts_at = coalesce(excluded.starts_at, event_overrides.starts_at), ends_at = coalesce(excluded.ends_at, event_overrides.ends_at), profile_id = coalesce(excluded.profile_id, event_overrides.profile_id)`,
          [c.hid, id, recurrenceId, p.title === undefined ? null : clean(p.title), p.description ?? null, p.location ?? null, p.startsAt ?? null, p.endsAt ?? null, p.profileId ?? null]);
      } else {
        if (!recurrenceId) throw new ApiError('missing', 'The date of the repeat is needed.');
        const len = DateTime.fromISO(ev.ends_at).toMillis() - DateTime.fromISO(ev.starts_at).toMillis();
        const startsAt = p.startsAt ?? recurrenceId; const endsAt = p.endsAt ?? DateTime.fromISO(recurrenceId).plus({ milliseconds: len }).toUTC().toISO()!;
        await t.exec(`insert into events (household_id, profile_id, category_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, recurrence_until, alert_minutes, source, created_by)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'local',$14)`,
          [c.hid, p.profileId ?? ev.profile_id, p.categoryId === undefined ? ev.category_id : p.categoryId, p.title === undefined ? ev.title : clean(p.title), p.description ?? ev.description, p.location ?? ev.location, p.allDay ?? ev.all_day, startsAt, endsAt, ev.tz, p.rrule === undefined ? ev.rrule : p.rrule, ev.recurrence_until, p.alertMinutes ?? ev.alert_minutes, c.userId ?? null]);
        await set(id, { recurrence_until: DateTime.fromISO(recurrenceId).minus({ seconds: 1 }).toUTC().toISO() });
      }
    });
    await pushSyncedChange(c, id, 'update');
  }, { write: true }),
  deleteEvent: def('member', [zId, scope.optional(), zInstant.optional()], async (c, id, sc = 'all', recurrenceId) => {
    await tenant(c, async (t) => {
      const ev = await t.one<ERow>(`select ${ECOLS} from events where id = $1 and deleted_at is null for update`, [id]);
      if (!ev) throw new ApiError('not_found', 'That event was not found.');
      await guardWritable(t, ev, sc);
      if (!ev.rrule || sc === 'all') { if (ev.source === 'synced') await pushSyncedChange(c, id, 'delete'); await t.exec('delete from events where id = $1', [id]); return; }
      if (!recurrenceId) throw new ApiError('missing', 'The date of the repeat is needed.');
      if (sc === 'this') await t.exec('insert into event_overrides (household_id, event_id, recurrence_id, cancelled) values ($1,$2,$3,true) on conflict (event_id, recurrence_id) do update set cancelled = true', [c.hid, id, recurrenceId]);
      else await t.exec('update events set recurrence_until = $2 where id = $1', [id, DateTime.fromISO(recurrenceId).minus({ seconds: 1 }).toUTC().toISO()]);
    });
  }, { write: true }),
};
