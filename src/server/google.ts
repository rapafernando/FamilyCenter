// Google Calendar through Google's public Calendar API with the household's own OAuth client.
// Scopes are the fewest that work: read-only for one-way, event editing for two-way.
import { z } from 'zod';
import { DateTime } from 'luxon';
import { ApiError, type Connection, type ConnStatus, type SyncedCalendar } from '@/lib/types';
import { plain, withTenant, type Tx } from './db';
import { env } from './env';
import { decrypt, encrypt, randomToken, sign, verify } from './crypto';
import { sendMail } from './mailer';
import { deleteSetting, getSetting, googleConfig, putSetting } from './instance';
import { def, tenant, zId, type Ctx, type Jar } from './rpc';

type Kind = 'app' | 'worker';
const SC_LIST = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const SC_READ = 'https://www.googleapis.com/auth/calendar.events.readonly';
const SC_WRITE = 'https://www.googleapis.com/auth/calendar.events';
const scopesFor = (mode: 'one_way' | 'two_way') => [SC_LIST, mode === 'two_way' ? SC_WRITE : SC_READ];
export const googleConfigured = async (kind: Kind = 'app') => (await googleConfig(kind)).source !== 'none';
const OAUTH_COOKIE = 'fc_oauth';
const REAUTH_EMAIL_EVERY_MS = 3 * 86400_000;

/* ------------------------------------------------------------------ errors */
/** Google refused the saved sign-in for good. Only the person can fix it, by signing in again. */
export class GoogleAuthError extends Error {}
/** Network trouble, a 5xx or a rate limit. Worth trying again later. */
export class GoogleTransientError extends Error {}

/* ------------------------------------------------------------------ tokens */
const accessCache = new Map<string, { token: string; exp: number }>();

async function tokenRequest(params: Record<string, string>, kind: Kind = 'app') {
  const cfg = await googleConfig(kind);
  let r: Response;
  try {
    r = await fetch(env.googleTokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }), signal: AbortSignal.timeout(15_000) });
  } catch { throw new GoogleTransientError('Could not reach Google.'); }
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (r.ok) return j;
  if (j.error === 'invalid_grant' || j.error === 'invalid_client' || j.error === 'unauthorized_client') throw new GoogleAuthError(j.error);
  throw new GoogleTransientError(`Google answered ${r.status}${j.error ? ` (${j.error})` : ''}.`);
}

type SecretRow = { secret_encrypted: Buffer | null; secret_key_id: number | null };
async function refreshToken(hid: string, connId: string, kind: Kind, force = false): Promise<string> {
  const hit = accessCache.get(connId);
  if (!force && hit && hit.exp > Date.now() + 60_000) return hit.token;
  const row = await withTenant(hid, (t) => t.one<SecretRow>('select secret_encrypted, secret_key_id from calendar_connections where id = $1', [connId]), kind);
  if (!row?.secret_encrypted || row.secret_key_id === null) throw new GoogleAuthError('no_secret');
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(row.secret_encrypted, row.secret_key_id) }, kind);
  if (!j.access_token) throw new GoogleTransientError('Google sent no access token.');
  accessCache.set(connId, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  if (j.refresh_token) { // Google sometimes rotates the refresh token. Keep the new one.
    const e = encrypt(j.refresh_token);
    await withTenant(hid, (t) => t.exec('update calendar_connections set secret_encrypted = $2, secret_key_id = $3 where id = $1', [connId, e.data, e.keyId]), kind);
  }
  return j.access_token;
}

/** The daily check. Refreshes the token, records what happened, and tells the owners if they need to sign in again. */
export async function checkConnectionToken(hid: string, connId: string, kind: Kind = 'app'): Promise<void> {
  try {
    await refreshToken(hid, connId, kind, true);
    await withTenant(hid, (t) => t.exec("update calendar_connections set token_checked_at = now(), token_failures = 0, last_error = null, reauth_notified_at = null, status = case when status in ('error','needs_reauth') then 'ok' else status end where id = $1", [connId]), kind);
  } catch (e) {
    accessCache.delete(connId);
    if (e instanceof GoogleAuthError) {
      const conn = await withTenant(hid, (t) => t.one<{ account_email: string | null; reauth_notified_at: string | null }>(
        "update calendar_connections set token_checked_at = now(), status = 'needs_reauth', last_error = 'Google no longer accepts this sign-in. Sign in again to keep syncing.' where id = $1 returning account_email, reauth_notified_at", [connId]), kind);
      if (conn && (!conn.reauth_notified_at || Date.now() - Date.parse(conn.reauth_notified_at) > REAUTH_EMAIL_EVERY_MS)) {
        await notifyOwners(hid, connId, conn.account_email ?? 'your Google account', kind);
      }
      return;
    }
    const msg = e instanceof GoogleTransientError ? e.message : 'Unexpected error while checking the sign-in.';
    await withTenant(hid, (t) => t.exec("update calendar_connections set token_checked_at = now(), token_failures = token_failures + 1, last_error = $2, status = case when status = 'ok' and token_failures + 1 >= 3 then 'error' else status end where id = $1", [connId, msg]), kind);
  }
}

async function notifyOwners(hid: string, connId: string, account: string, kind: Kind) {
  const owners = await withTenant(hid, async (t) => {
    await t.exec('update calendar_connections set reauth_notified_at = now() where id = $1', [connId]);
    return t.all<{ email: string }>("select u.email from household_members m join users u on u.id = m.user_id where m.household_id = $1 and m.role in ('owner','adult')", [hid]);
  }, kind);
  const link = `${env.baseUrl}/settings/calendars`;
  for (const o of owners) {
    await sendMail(o.email, 'Your family calendar needs you to sign in to Google again',
      `Google stopped accepting the saved sign-in for ${account}, so new events are not coming in.\n\nYour existing events stay on the calendar. To start syncing again, open ${link} and choose Reconnect.\n\nIf this keeps happening, check that your Google Cloud consent screen is set to "In production". Apps left in "Testing" lose their sign-in every 7 days.`);
  }
}

/* ------------------------------------------------------------------ Google API */
async function gfetch(token: string, path: string, init: { method?: string; body?: unknown; etag?: string | null } = {}) {
  let r: Response;
  try {
    r = await fetch(`${env.googleApiBase}${path}`, { method: init.method ?? 'GET', signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.etag ? { 'if-match': init.etag } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch { throw new GoogleTransientError('Could not reach Google.'); }
  if (r.status === 401) throw new GoogleAuthError('401');
  if (r.status === 204) return { status: 204, json: null as never };
  const json = await r.json().catch(() => ({})) as never;
  if (!r.ok && ![404, 410, 412].includes(r.status)) {
    const reason = (json as { error?: { errors?: { reason?: string }[] } })?.error?.errors?.[0]?.reason;
    if (r.status === 403 && reason && !/rate|quota/i.test(reason)) throw new ApiError('google_denied', 'Google did not allow that. Reconnect and approve all the requested permissions.');
    throw new GoogleTransientError(`Google answered ${r.status}.`);
  }
  return { status: r.status, json };
}

type GEvent = { id: string; etag?: string; status?: string; summary?: string; description?: string; location?: string; start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[]; recurringEventId?: string; originalStartTime?: { date?: string; dateTime?: string }; reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] } };
type GCal = { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string };

/* ------------------------------------------------------------------ sync */
const COLOR_FALLBACK = '#4F8FD9';
const hex = (c?: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : COLOR_FALLBACK);

function parseExdates(lines: string[], tz: string): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const m = /^EXDATE([^:]*):(.+)$/i.exec(l); if (!m) continue;
    const zone = /TZID=([^;:]+)/i.exec(m[1])?.[1] ?? tz; const dateOnly = /VALUE=DATE(?!-)/i.test(m[1]);
    for (const v of m[2].split(',')) {
      const d = dateOnly || /^\d{8}$/.test(v) ? DateTime.fromFormat(v, 'yyyyLLdd', { zone: tz }).startOf('day')
        : v.endsWith('Z') ? DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss'Z'", { zone: 'utc' }) : DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss", { zone });
      if (d.isValid) out.push(d.toUTC().toISO()!);
    }
  }
  return out;
}
const atStart = (x: { date?: string; dateTime?: string } | undefined, tz: string) =>
  x?.date ? DateTime.fromISO(x.date, { zone: tz }).startOf('day') : x?.dateTime ? DateTime.fromISO(x.dateTime) : null;

async function applyEvents(t: Tx, hid: string, cal: { id: string; profile_id: string | null }, items: GEvent[], tz: string, familyId: string, seen: Set<string>) {
  const profile = cal.profile_id ?? familyId;
  const masters = items.filter((i) => !i.recurringEventId); const instances = items.filter((i) => i.recurringEventId);
  for (const it of masters) {
    seen.add(it.id);
    if (it.status === 'cancelled') { await t.exec("delete from events where calendar_id = $1 and external_id = $2 and source = 'synced'", [cal.id, it.id]); continue; }
    const existing = await t.one<{ id: string; external_etag: string | null }>('select id, external_etag from events where calendar_id = $1 and external_id = $2', [cal.id, it.id]);
    if (existing && it.etag && existing.external_etag === it.etag) continue;
    const allDay = !!it.start?.date; const s = atStart(it.start, tz); const e = atStart(it.end, tz);
    if (!s || !e) continue;
    const rr = it.recurrence?.find((l) => l.toUpperCase().startsWith('RRULE:'))?.slice(6) ?? null;
    const alerts = (it.reminders?.overrides ?? []).filter((o) => o.method === 'popup').map((o) => o.minutes).filter((m) => Number.isInteger(m) && m >= 0 && m <= 20160).slice(0, 5);
    const vals = [(it.summary ?? '').trim().slice(0, 200) || '(No title)', (it.description ?? '').slice(0, 4000) || null, (it.location ?? '').slice(0, 300) || null, allDay, s.toUTC().toISO(), (e < s ? s : e).toUTC().toISO(), allDay ? tz : it.start?.timeZone ?? tz, rr, alerts, it.etag ?? null];
    let id = existing?.id;
    if (id) await t.exec('update events set title=$2, description=$3, location=$4, all_day=$5, starts_at=$6, ends_at=$7, tz=$8, rrule=$9, alert_minutes=$10, external_etag=$11, external_updated_at=now(), profile_id=$12 where id = $1', [id, ...vals, profile]);
    else id = (await t.one<{ id: string }>("insert into events (household_id, calendar_id, profile_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, alert_minutes, external_etag, source, external_id, external_updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'synced',$14,now()) returning id", [hid, cal.id, profile, ...vals, it.id]))!.id;
    for (const rid of parseExdates(it.recurrence ?? [], tz))
      await t.exec('insert into event_overrides (household_id, event_id, recurrence_id, cancelled) values ($1,$2,$3,true) on conflict (event_id, recurrence_id) do update set cancelled = true', [hid, id, rid]);
  }
  for (const it of instances) {
    const parent = await t.one<{ id: string }>('select id from events where calendar_id = $1 and external_id = $2', [cal.id, it.recurringEventId]);
    const orig = atStart(it.originalStartTime, tz);
    if (!parent || !orig) continue;
    const rid = orig.toUTC().toISO()!;
    if (it.status === 'cancelled') { await t.exec('insert into event_overrides (household_id, event_id, recurrence_id, cancelled, external_id) values ($1,$2,$3,true,$4) on conflict (event_id, recurrence_id) do update set cancelled = true', [hid, parent.id, rid, it.id]); continue; }
    const s = atStart(it.start, tz), e = atStart(it.end, tz);
    await t.exec(`insert into event_overrides (household_id, event_id, recurrence_id, cancelled, title, description, location, starts_at, ends_at, external_id) values ($1,$2,$3,false,$4,$5,$6,$7,$8,$9)
      on conflict (event_id, recurrence_id) do update set cancelled = false, title = excluded.title, description = excluded.description, location = excluded.location, starts_at = excluded.starts_at, ends_at = excluded.ends_at, external_id = excluded.external_id`,
      [hid, parent.id, rid, (it.summary ?? '').trim().slice(0, 200) || null, (it.description ?? '').slice(0, 4000) || null, (it.location ?? '').slice(0, 300) || null, s?.toUTC().toISO() ?? null, e?.toUTC().toISO() ?? null, it.id]);
  }
}

async function syncCalendar(hid: string, cal: { id: string; external_id: string; profile_id: string | null; sync_state: { token?: string } }, token: string, tz: string, familyId: string, kind: Kind) {
  const run = async (useToken: boolean) => {
    const items: GEvent[] = []; let page: string | undefined; let next: string | undefined;
    for (let n = 0; n < 20; n++) {
      const q = new URLSearchParams({ maxResults: '250', showDeleted: 'true' });
      if (useToken && cal.sync_state.token) q.set('syncToken', cal.sync_state.token); else q.set('timeMin', DateTime.utc().minus({ days: 90 }).toISO()!);
      if (page) q.set('pageToken', page);
      const r = await gfetch(token, `/calendars/${encodeURIComponent(cal.external_id)}/events?${q}`);
      if (r.status === 410) return null;
      if (r.status === 404) { return { gone: true as const }; }
      const j = r.json as { items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string };
      items.push(...(j.items ?? [])); page = j.nextPageToken; next = j.nextSyncToken;
      if (!page) return { items, next, full: !useToken || !cal.sync_state.token };
    }
    throw new GoogleTransientError('That calendar is too large to read in one go.');
  };
  let res = await run(true);
  if (res === null) res = await run(false);
  if (!res || 'gone' in res) return;
  const out = res;
  await withTenant(hid, async (t) => {
    const seen = new Set<string>();
    await applyEvents(t, hid, { id: cal.id, profile_id: cal.profile_id }, out.items, tz, familyId, seen);
    if (out.full) { // a full read lists everything that still exists, so anything else is gone
      const have = await t.all<{ id: string; external_id: string }>("select id, external_id from events where calendar_id = $1 and source = 'synced'", [cal.id]);
      const stale = have.filter((h) => !seen.has(h.external_id)).map((h) => h.id);
      if (stale.length) await t.exec('delete from events where id = any($1)', [stale]);
    }
    await t.exec("update synced_calendars set sync_state = jsonb_build_object('token', $2::text), last_synced_at = now() where id = $1", [cal.id, out.next ?? null]);
  }, kind);
}

/** Pulls the calendar list and every enabled calendar. One run per connection at a time. */
export async function syncConnection(hid: string, connId: string, kind: Kind = 'app'): Promise<void> {
  const info = await withTenant(hid, async (t) => {
    const c = await t.one<{ status: string }>('select status from calendar_connections where id = $1', [connId]);
    const h = await t.one<{ timezone: string }>('select timezone from households where id = $1', [hid]);
    const f = await t.one<{ id: string }>("select id from profiles where kind = 'household' limit 1");
    return c && h && f ? { status: c.status, tz: h.timezone, family: f.id } : null;
  }, kind);
  if (!info || info.status === 'paused' || info.status === 'needs_reauth') return;
  // One sync per connection at a time: whoever moves next_sync_at forward owns this run.
  const claimed = await withTenant(hid, (t) => t.exec("update calendar_connections set next_sync_at = now() + interval '4 minutes' where id = $1 and (next_sync_at is null or next_sync_at <= now() + interval '10 seconds')", [connId]), kind);
  if (!claimed) return;
  try {
    const token = await refreshToken(hid, connId, kind);
    const list = ((await gfetch(token, '/users/me/calendarList?minAccessRole=reader&maxResults=250')).json as { items?: GCal[] }).items ?? [];
    await withTenant(hid, async (t) => {
      for (const c of list) {
        await t.exec(`insert into synced_calendars (household_id, connection_id, external_id, name, color, enabled) values ($1,$2,$3,$4,$5,$6)
          on conflict (connection_id, external_id) do update set name = excluded.name, color = excluded.color`,
          [hid, connId, c.id, (c.summaryOverride ?? c.summary ?? c.id).slice(0, 120), hex(c.backgroundColor), !!c.primary]);
      }
      const ids = list.map((c) => c.id);
      await t.exec('delete from synced_calendars where connection_id = $1 and not (external_id = any($2))', [connId, ids]);
    }, kind);
    const cals = await withTenant(hid, (t) => t.all<{ id: string; external_id: string; profile_id: string | null; sync_state: { token?: string } }>('select id, external_id, profile_id, sync_state from synced_calendars where connection_id = $1 and enabled', [connId]), kind);
    for (const cal of cals) await syncCalendar(hid, cal, token, info.tz, info.family, kind);
    await withTenant(hid, (t) => t.exec("update calendar_connections set last_synced_at = now(), last_error = case when status = 'error' then null else last_error end, status = case when status = 'error' then 'ok' else status end where id = $1", [connId]), kind);
  } catch (e) {
    if (e instanceof GoogleAuthError) { accessCache.delete(connId); await checkConnectionToken(hid, connId, kind); return; }
    const msg = e instanceof GoogleTransientError || e instanceof ApiError ? e.message : 'Sync failed.';
    // Release the claim so the next try (the worker's retry, or the next scan) is allowed to run.
    await withTenant(hid, (t) => t.exec('update calendar_connections set last_error = $2, next_sync_at = now() where id = $1', [connId, msg]), kind);
    throw e;
  }
}

/* ------------------------------------------------------------------ writing back (two-way) */
type PushInput = { title: string; description: string; location: string; allDay: boolean; startsAt: string; endsAt: string; tz: string; rrule: string | null; alertMinutes: number[]; profileId: string; categoryId: string | null; saveToCalendarId?: string | null };
const toGoogle = (i: { title: string; description: string | null; location: string | null; allDay: boolean; startsAt: string; endsAt: string; tz: string; rrule: string | null; alertMinutes: number[] }) => {
  const day = (iso: string) => DateTime.fromISO(iso, { zone: i.tz }).toISODate()!;
  return {
    summary: i.title, description: i.description ?? '', location: i.location ?? '',
    start: i.allDay ? { date: day(i.startsAt) } : { dateTime: i.startsAt, timeZone: i.tz },
    end: i.allDay ? { date: day(i.endsAt) } : { dateTime: i.endsAt, timeZone: i.tz },
    ...(i.rrule ? { recurrence: [`RRULE:${i.rrule}`] } : {}),
    reminders: { useDefault: false, overrides: i.alertMinutes.map((m) => ({ method: 'popup', minutes: m })) },
  };
};
async function writableCalendar(t: Tx, calendarId: string) {
  const r = await t.one<{ external_id: string; conn_id: string; mode: string; status: string }>('select s.external_id, cc.id as conn_id, cc.mode, cc.status from synced_calendars s join calendar_connections cc on cc.id = s.connection_id where s.id = $1', [calendarId]);
  if (!r) throw new ApiError('not_found', 'That Google calendar was not found.');
  if (r.mode !== 'two_way') throw new ApiError('read_only', 'New events can only be saved to Google when the connection is two-way.');
  if (r.status === 'needs_reauth') throw new ApiError('needs_reauth', 'Google needs you to sign in again before this can sync.');
  return r;
}
const googleFailure = (e: unknown): never => {
  if (e instanceof ApiError) throw e;
  if (e instanceof GoogleAuthError) throw new ApiError('needs_reauth', 'Google needs you to sign in again before this can sync.');
  throw new ApiError('google_unavailable', 'Google Calendar could not be reached. Nothing was changed. Try again in a moment.');
};

export async function pushEventToGoogle(c: Ctx & { hid: string }, i: PushInput): Promise<{ id: string }> {
  const target = await tenant(c, (t) => writableCalendar(t, i.saveToCalendarId!));
  try {
    const token = await refreshToken(c.hid, target.conn_id, 'app');
    const r = await gfetch(token, `/calendars/${encodeURIComponent(target.external_id)}/events`, { method: 'POST', body: toGoogle({ ...i, description: i.description, location: i.location }) });
    const g = r.json as GEvent;
    return await tenant(c, async (t) => (await t.one<{ id: string }>(
      `insert into events (household_id, calendar_id, profile_id, category_id, title, description, location, all_day, starts_at, ends_at, tz, rrule, alert_minutes, source, external_id, external_etag, external_updated_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'synced',$14,$15,now(),$16) returning id`,
      [c.hid, i.saveToCalendarId, i.profileId, i.categoryId, i.title.trim(), i.description || null, i.location || null, i.allDay, i.startsAt, i.endsAt, i.tz, i.rrule || null, i.alertMinutes, g.id, g.etag ?? null, c.userId ?? null]))!);
  } catch (e) { return googleFailure(e); }
}

/** After a person edits or deletes a synced event here, mirror it to Google. If Google refuses, forget our etag so the next sync restores Google's version. */
export async function pushSyncedChange(c: Ctx & { hid: string }, eventId: string, action: 'update' | 'delete'): Promise<void> {
  const ev = await tenant(c, (t) => t.one<{ id: string; calendar_id: string; external_id: string; external_etag: string | null; title: string; description: string | null; location: string | null; all_day: boolean; starts_at: string; ends_at: string; tz: string; rrule: string | null; alert_minutes: number[] }>(
    "select id, calendar_id, external_id, external_etag, title, description, location, all_day, starts_at, ends_at, tz, rrule, alert_minutes from events where id = $1 and source = 'synced'", [eventId]));
  if (!ev) return;
  const target = await tenant(c, (t) => writableCalendar(t, ev.calendar_id));
  try {
    const token = await refreshToken(c.hid, target.conn_id, 'app');
    const path = `/calendars/${encodeURIComponent(target.external_id)}/events/${encodeURIComponent(ev.external_id)}`;
    if (action === 'delete') { await gfetch(token, path, { method: 'DELETE' }); return; }
    const r = await gfetch(token, path, { method: 'PATCH', body: toGoogle({ title: ev.title, description: ev.description, location: ev.location, allDay: ev.all_day, startsAt: ev.starts_at, endsAt: ev.ends_at, tz: ev.tz, rrule: ev.rrule, alertMinutes: ev.alert_minutes }), etag: ev.external_etag });
    if (r.status === 412) throw new ApiError('conflict', 'This event was changed in Google at the same time. Reload and try again.');
    await tenant(c, (t) => t.exec('update events set external_etag = $2 where id = $1', [eventId, (r.json as GEvent).etag ?? null]));
  } catch (e) {
    // (A delete runs inside the caller's transaction, which already holds this row.)
    if (action === 'update') await tenant(c, (t) => t.exec('update events set external_etag = null where id = $1', [eventId])).catch(() => {});
    googleFailure(e);
  }
}

/* ------------------------------------------------------------------ sign-in flow */
const b64 = (b: Buffer) => b.toString('base64url');
export async function startGoogleConnect(c: Ctx & { hid: string }, mode: 'one_way' | 'two_way', reconnectId?: string) {
  if (!(await googleConfigured())) throw new ApiError('not_configured', 'Google sign-in is not set up on this server yet. See the setup notes.');
  const state = randomToken(24); const verifier = randomToken(48);
  const { createHash } = await import('node:crypto');
  const challenge = b64(createHash('sha256').update(verifier).digest());
  let useMode = mode;
  if (reconnectId) { // a reconnect keeps the connection's own mode
    const m = await tenant(c, (t) => t.one<{ mode: 'one_way' | 'two_way' }>('select mode from calendar_connections where id = $1', [reconnectId]));
    if (!m) throw new ApiError('not_found', 'That connection was not found.');
    useMode = m.mode;
  }
  c.jar.set(OAUTH_COOKIE, sign({ s: state, v: verifier, m: useMode, r: reconnectId ?? null, h: c.hid }, 600), { maxAge: 600 });
  const q = new URLSearchParams({ client_id: (await googleConfig()).clientId, redirect_uri: `${env.baseUrl}/api/v1/sync/oauth/google/callback`, response_type: 'code', scope: scopesFor(useMode).join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return { url: `${env.googleAuthUrl}?${q}` };
}

/** The route calls this with the query string Google sent back. Always returns where to send the browser next. */
export async function finishGoogleConnect(c: Ctx, params: URLSearchParams): Promise<string> {
  const back = (k: string) => `/settings/calendars?google=${k}`;
  const st = verify<{ s: string; v: string; m: 'one_way' | 'two_way'; r: string | null; h: string }>(c.jar.get(OAUTH_COOKIE));
  c.jar.delete(OAUTH_COOKIE);
  if (!st || params.get('state') !== st.s || !c.householdId || c.householdId !== st.h) return back('expired');
  if (params.get('error')) return back(params.get('error') === 'access_denied' ? 'denied' : 'failed');
  const code = params.get('code'); if (!code) return back('failed');
  try {
    const j = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: st.v, redirect_uri: `${env.baseUrl}/api/v1/sync/oauth/google/callback` });
    const granted = (j.scope ?? '').split(' ');
    if (!scopesFor(st.m).every((s) => granted.includes(s))) return back('scope');
    if (!j.refresh_token || !j.access_token) return back('failed');
    const cal = (await gfetch(j.access_token, '/users/me/calendarList?minAccessRole=reader&maxResults=250')).json as { items?: GCal[] };
    const email = cal.items?.find((x) => x.primary)?.id ?? 'Google account';
    const enc = encrypt(j.refresh_token);
    const hid = st.h;
    const id = await withTenant(hid, async (t) => {
      let target = st.r;
      if (!target) target = (await t.one<{ id: string }>("select id from calendar_connections where provider = 'google' and lower(account_email) = lower($1)", [email]))?.id ?? null;
      if (target) {
        await t.exec("update calendar_connections set secret_encrypted=$2, secret_key_id=$3, status='ok', last_error=null, token_failures=0, token_checked_at=now(), reauth_notified_at=null, next_sync_at=null, mode=$4, sync_state=jsonb_build_object('scopes',$5::text[]) where id=$1", [target, enc.data, enc.keyId, st.m, granted]);
        return target;
      }
      return (await t.one<{ id: string }>("insert into calendar_connections (household_id, provider, mode, display_name, account_email, secret_encrypted, secret_key_id, token_checked_at, sync_state, created_by) values ($1,'google',$2,'Google Calendar',$3,$4,$5,now(),jsonb_build_object('scopes',$6::text[]),$7) returning id",
        [hid, st.m, email, enc.data, enc.keyId, granted, c.userId ?? null]))!.id;
    });
    accessCache.set(id, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
    void syncConnection(hid, id).catch((e) => console.error('first sync failed', e instanceof Error ? e.message : e));
    return back('connected');
  } catch (e) { console.error('google connect failed', e instanceof Error ? e.message : e); return back('failed'); }
}

/* ------------------------------------------------------------------ RPCs */
type CRow = { id: string; mode: 'one_way' | 'two_way'; display_name: string; account_email: string | null; status: string; last_synced_at: string | null; token_checked_at: string | null; token_failures: number; last_error: string | null; created_at: string };
const CCOLS = 'id, mode, display_name, account_email, status, last_synced_at, token_checked_at, token_failures, last_error, created_at';
const mapConn = (r: CRow): Connection => {
  const stale = r.status === 'ok' && (!r.last_synced_at || Date.now() - Date.parse(r.last_synced_at) > 45 * 60_000);
  return { id: r.id, provider: 'google', mode: r.mode, displayName: r.display_name, accountEmail: r.account_email ?? '', status: (stale ? 'stale' : r.status) as ConnStatus, lastSyncedAt: r.last_synced_at, tokenCheckedAt: r.token_checked_at, tokenFailures: r.token_failures, lastError: r.last_error, connectedAt: r.created_at };
};
const getConn = async (c: Ctx & { hid: string }, id: string) => {
  const r = await tenant(c, (t) => t.one<CRow>(`select ${CCOLS} from calendar_connections where id = $1`, [id]));
  if (!r) throw new ApiError('not_found', 'That connection was not found.');
  return r;
};

export const connections = {
  listConnections: def('read', [], async (c) => (await tenant(c, (t) => t.all<CRow>(`select ${CCOLS} from calendar_connections order by created_at`))).map(mapConn)),
  listSyncedCalendars: def('read', [], async (c): Promise<SyncedCalendar[]> => (await tenant(c, (t) => t.all<{ id: string; connection_id: string; external_id: string; name: string; color: string | null; enabled: boolean; profile_id: string | null; is_default_target: boolean }>(
    'select id, connection_id, external_id, name, color, enabled, profile_id, is_default_target from synced_calendars order by created_at, name')))
    .map((r) => ({ id: r.id, connectionId: r.connection_id, externalId: r.external_id, name: r.name, color: (r.color ?? COLOR_FALLBACK).toUpperCase(), enabled: r.enabled, profileId: r.profile_id, isDefaultTarget: r.is_default_target }))),
  startGoogleConnect: def('settings', [z.enum(['one_way', 'two_way']), zId.optional()], async (c, mode, reconnectId) => startGoogleConnect(c, mode, reconnectId)),
  updateConnection: def('settings', [zId, z.object({ mode: z.enum(['one_way', 'two_way']).optional(), status: z.enum(['ok', 'paused']).optional() })], async (c, id, p) => {
    const cur = await getConn(c, id);
    await tenant(c, async (t) => {
      if (p.mode && p.mode !== cur.mode) {
        const scopes = (await t.one<{ s: string[] | null }>("select array(select jsonb_array_elements_text(sync_state->'scopes')) as s from calendar_connections where id = $1", [id]))?.s ?? [];
        const needsWrite = p.mode === 'two_way' && !scopes.includes(SC_WRITE);
        if (!needsWrite) await t.exec('update calendar_connections set mode = $2 where id = $1', [id, p.mode]);
        else await t.exec("update calendar_connections set mode = $2, status = 'needs_reauth', last_error = 'Two-way sync needs permission to edit events. Choose Reconnect and approve it.' where id = $1", [id, p.mode]);
        if (p.mode === 'one_way') await t.exec('update synced_calendars set is_default_target = false where connection_id = $1', [id]);
      }
      if (p.status && cur.status !== 'needs_reauth') await t.exec("update calendar_connections set status = $2, next_sync_at = null where id = $1", [id, p.status]);
    });
  }, { write: true }),
  updateSyncedCalendar: def('settings', [zId, z.object({ enabled: z.boolean().optional(), profileId: zId.nullable().optional(), isDefaultTarget: z.boolean().optional() })], async (c, id, p) => {
    await tenant(c, async (t) => {
      const cal = await t.one<{ connection_id: string; mode: string; enabled: boolean }>('select s.connection_id, cc.mode, s.enabled from synced_calendars s join calendar_connections cc on cc.id = s.connection_id where s.id = $1', [id]);
      if (!cal) throw new ApiError('not_found', 'That calendar was not found.');
      if (p.isDefaultTarget) {
        if (cal.mode !== 'two_way') throw new ApiError('read_only', 'New events can only be saved to Google when the connection is two-way.');
        await t.exec('update synced_calendars set is_default_target = false where is_default_target');
      }
      await t.exec('update synced_calendars set enabled = coalesce($2,enabled), is_default_target = coalesce($3,is_default_target) where id = $1', [id, p.enabled ?? null, p.isDefaultTarget ?? null]);
      if (p.enabled === false) await t.exec('update synced_calendars set is_default_target = false where id = $1', [id]);
      if ('profileId' in p) {
        const pid = p.profileId ?? (await t.one<{ id: string }>("select id from profiles where kind = 'household' limit 1"))!.id;
        await t.exec('update synced_calendars set profile_id = $2 where id = $1', [id, p.profileId ?? null]);
        await t.exec("update events set profile_id = $2 where calendar_id = $1 and source = 'synced'", [id, pid]);
      }
      if (p.enabled === true && !cal.enabled) await t.exec('update calendar_connections set next_sync_at = null where id = $1', [cal.connection_id]);
    });
    if (p.enabled === true) void tenant(c, (t) => t.one<{ connection_id: string }>('select connection_id from synced_calendars where id = $1', [id])).then((r) => r && syncConnection(c.hid, r.connection_id)).catch(() => {});
  }, { write: true }),
  reloadConnection: def('settings', [zId], async (c, id) => {
    const cur = await getConn(c, id);
    if (cur.status === 'needs_reauth') throw new ApiError('needs_reauth', 'Google needs you to sign in again before this can sync.');
    await tenant(c, (t) => t.exec('update calendar_connections set next_sync_at = null where id = $1', [id]));
    try { await syncConnection(c.hid, id); } catch (e) { googleFailure(e); }
    const after = await getConn(c, id);
    if (after.status === 'needs_reauth') throw new ApiError('needs_reauth', 'Google needs you to sign in again before this can sync.');
  }, { write: true }),
  checkToken: def('settings', [zId], async (c, id): Promise<Connection> => {
    await getConn(c, id);
    await checkConnectionToken(c.hid, id);
    return mapConn(await getConn(c, id));
  }, { write: true }),
  removeConnection: def('settings', [zId], async (c, id) => {
    const row = await tenant(c, (t) => t.one<SecretRow>('select secret_encrypted, secret_key_id from calendar_connections where id = $1', [id]));
    if (!row) return;
    if (row.secret_encrypted && row.secret_key_id !== null && (await googleConfigured())) { // tell Google to forget us; failure here must not block removal
      try { await fetch(env.googleRevokeUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decrypt(row.secret_encrypted, row.secret_key_id) }), signal: AbortSignal.timeout(8000) }); } catch { /* best effort */ }
    }
    accessCache.delete(id);
    await tenant(c, (t) => t.exec('delete from calendar_connections where id = $1', [id]));
  }, { write: true }),
};

/* ------------------------------------------------------------------ for the worker */
export async function connectionsDueForSync(): Promise<{ hid: string; id: string }[]> {
  return plain((t) => t.all<{ hid: string; id: string }>("select household_id as hid, id from calendar_connections where status = 'ok' and (next_sync_at is null or next_sync_at <= now()) order by next_sync_at nulls first limit 50"), 'worker');
}
export async function connectionsForTokenCheck(): Promise<{ hid: string; id: string }[]> {
  return plain((t) => t.all<{ hid: string; id: string }>("select household_id as hid, id from calendar_connections where provider = 'google' and status in ('ok','error') and secret_encrypted is not null and (token_checked_at is null or token_checked_at < now() - interval '23 hours')"), 'worker');
}
export type { Jar };

/** After the worker has given up on a connection for now, wait ten minutes before it is picked up again. */
export async function deferSync(hid: string, connId: string, kind: Kind = 'worker'): Promise<void> {
  await withTenant(hid, (t) => t.exec("update calendar_connections set next_sync_at = now() + interval '10 minutes' where id = $1", [connId]), kind);
}
