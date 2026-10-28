import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
import { ApiError, type Household, type Profile, type Role } from '@/lib/types';
import { MARKER_PRESETS } from '@/lib/markers.generated';
import { plain, withTenant } from '../db';
import { env } from '../env';
import { hashPassword, randomToken, sha256, sign, verify, verifyPassword } from '../crypto';
import { COOKIE, def, limit, startSession, tenant, zDate, zHex, zId, zStr } from '../rpc';
import { sendMail } from '../mailer';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

export const clean = (s: string) => s.trim();
const EMAIL = /^\S+@\S+\.\S+$/;
type HRow = { id: string; name: string; timezone: string; week_starts_on: number; default_view: Household['defaultView']; ads_enabled: boolean; ads_every_n_photos: number; location: string };
export const mapHousehold = (r: HRow): Household => ({ id: r.id, name: r.name, timezone: r.timezone, weekStartsOn: r.week_starts_on, defaultView: r.default_view, adsEnabled: r.ads_enabled, adsEveryNPhotos: r.ads_every_n_photos, location: r.location });
type PRow = { id: string; name: string; color: string; birthday: string | null; kind: Profile['kind']; star_balance: number };
export const mapProfile = (r: PRow): Profile => ({ id: r.id, name: r.name, color: r.color.toUpperCase(), birthday: r.birthday, kind: r.kind, starBalance: r.star_balance });
const HH = 'id, name, timezone, week_starts_on, default_view, ads_enabled, ads_every_n_photos, location';

/** Creates a household with its owner, the shared "Family" profile, the owner's own profile and the grocery list. */
export async function createHousehold(userId: string, name: string, personName: string, timezone: string) {
  const hid = crypto.randomUUID();
  await withTenant(hid, async (t) => {
    await t.exec('insert into households (id, name, timezone, ads_enabled) values ($1,$2,$3,$4)', [hid, name, timezone, env.adsDefaultOn]);
    await t.exec("insert into household_members (household_id, user_id, role) values ($1,$2,'owner')", [hid, userId]);
    await t.exec("insert into profiles (household_id, name, color, kind, sort_order) values ($1,'Family',$2,'household',0)", [hid, MARKER_PRESETS.graphite]);
    await t.exec("insert into profiles (household_id, name, color, kind, user_id, sort_order) values ($1,$2,$3,'person',$4,1)", [hid, personName, MARKER_PRESETS.sky, userId]);
    await t.exec("insert into lists (household_id, name, color, emoji, is_grocery, sort_order) values ($1,'Groceries',$2,'🛒',true,0)", [hid, MARKER_PRESETS.grass]);
  });
  return hid;
}

/** Puts a signed-in person into the household an invitation link belongs to, then makes that their current household. */
async function acceptInto(jar: import('../rpc').Jar, userId: string, userName: string, token: string) {
  const i = await plain((t) => t.one<{ id: string; household_id: string; role: string }>('select * from invitation_by_hash($1)', [sha256(token)]));
  if (!i) throw new ApiError('not_found', 'This invitation link has expired or was already used.');
  await withTenant(i.household_id, async (t) => {
    const used = await t.exec('update invitations set accepted_at = now(), accepted_by = $2 where id = $1 and accepted_at is null', [i.id, userId]);
    if (!used) throw new ApiError('not_found', 'This invitation link has expired or was already used.');
    await t.exec('insert into household_members (household_id, user_id, role) values ($1,$2,$3) on conflict do nothing', [i.household_id, userId, i.role]);
    await t.exec("insert into profiles (household_id, name, color, kind, user_id, sort_order) select $1,$2,$3,'person',$4,(select coalesce(max(sort_order),0)+1 from profiles) where not exists (select 1 from profiles where user_id = $4)", [i.household_id, userName, MARKER_PRESETS.teal, userId]);
  });
  const v = await plain((t) => t.one<{ session_version: number }>('select session_version from users where id = $1', [userId]));
  startSession(jar, userId, i.household_id, v!.session_version);
}

/** A link in an email that proves the person owns the address. Signed, so nothing is stored; it stops working after an hour. */
export async function sendVerification(userId: string, email: string) {
  if (!env.smtp()) return false;
  const token = sign({ k: 'verify', u: userId, e: email }, 86400);
  return sendMail(email, 'Confirm your email for Family Calendar', `Open this link to confirm your email address:\n\n${env.baseUrl}/verify/${token}\n\nThe link works for 24 hours. If you did not sign up, ignore this message.`);
}

export const core = {
  /* ---------------------------------------------------------------- what this server can do */
  features: def('public', [], async () => ({ demo: env.allowDemo, googleConfigured: !!(env.googleClientId && env.googleClientSecret), googleOauthStatus: env.googleOauthStatus, smtp: !!env.smtp(), adsDefaultOn: env.adsDefaultOn })),

  /* ---------------------------------------------------------------- session */
  getSession: def('public', [], async (c) => {
    if (c.kind === 'user') return { user: { id: c.userId!, name: c.userName!, email: c.email! }, deviceId: null, role: c.role ?? null };
    if (c.kind === 'device') return { user: null, deviceId: c.deviceId!, role: null };
    return { user: null, deviceId: null, role: null };
  }),
  signUp: def('public', [z.object({ name: zStr(100), email: zStr(200), password: zStr(200), householdName: zStr(100).optional(), timezone: zStr(64), inviteToken: zStr(100).optional() })], async (c, i) => {
    limit(`signup:${c.ip}`, 10, 3600_000);
    const email = clean(i.email).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiError('invalid_email', 'Enter an email address like name@example.com.');
    if (i.password.length < 8) throw new ApiError('weak_password', 'Use at least 8 characters for the password.');
    if (!clean(i.name) || (!i.inviteToken && !clean(i.householdName ?? ''))) throw new ApiError('missing', 'Fill in your name and a name for the household.');
    if (i.inviteToken && !(await plain((t) => t.one('select 1 from invitation_by_hash($1)', [sha256(i.inviteToken!)])))) throw new ApiError('not_found', 'This invitation link has expired or was already used.');
    const tz = IANAZone.isValidZone(i.timezone) ? i.timezone : 'UTC';
    const hash = await hashPassword(i.password);
    const u = await plain((t) => t.one<{ id: string; session_version: number }>('insert into users (email, name, password_hash) values ($1,$2,$3) returning id, session_version', [email, clean(i.name), hash]));
    void sendVerification(u!.id, email);
    if (i.inviteToken) { await acceptInto(c.jar, u!.id, clean(i.name), i.inviteToken); return; }
    const hid = await createHousehold(u!.id, clean(i.householdName!), clean(i.name), tz);
    startSession(c.jar, u!.id, hid, u!.session_version);
  }, { write: false }),
  signIn: def('public', [zStr(200), zStr(200)], async (c, email, password) => {
    const e = clean(email).toLowerCase();
    limit(`signin:${c.ip}`, 30, 600_000); limit(`signin:${e}`, 10, 600_000);
    const u = await plain((t) => t.one<{ id: string; password_hash: string | null; session_version: number }>('select id, password_hash, session_version from users where lower(email) = $1 and deletion_requested_at is null', [e]));
    if (!(await verifyPassword(password, u?.password_hash ?? null)) || !u) throw new ApiError('invalid_credentials', 'That email and password do not match.');
    const ms = await plain((t) => t.all<{ household_id: string }>('select * from user_memberships($1)', [u.id]));
    startSession(c.jar, u.id, ms[0]?.household_id ?? null, u.session_version);
  }),
  signOut: def('public', [], async (c) => { c.jar.delete(COOKIE.session); }),
  signOutDevice: def('read', [], async (c) => {
    if (c.kind === 'device') await tenant(c, (t) => t.exec('delete from devices where id = $1', [c.deviceId]));
    c.jar.delete(COOKIE.device); c.jar.delete(COOKIE.unlock);
  }, { write: true }),
  signOutEverywhere: def('user', [], async (c) => {
    const v = await plain((t) => t.one<{ session_version: number }>('update users set session_version = session_version + 1 where id = $1 returning session_version', [c.userId]));
    startSession(c.jar, c.userId!, c.householdId ?? null, v!.session_version);
  }),

  /* ---------------------------------------------------------------- household */
  getHousehold: def('read', [], async (c) => mapHousehold((await tenant(c, (t) => t.one<HRow>(`select ${HH} from households where id = $1`, [c.hid])))!)),
  updateHousehold: def('adult', [z.object({
    name: zStr(100).optional(), timezone: zStr(64).optional(), weekStartsOn: z.number().int().min(0).max(6).optional(), defaultView: z.enum(['day', 'week', 'month']).optional(),
    adsEnabled: z.boolean().optional(), adsEveryNPhotos: z.number().int().optional(), location: zStr(120).optional(),
  })], async (c, p) => {
    if (p.adsEveryNPhotos !== undefined && (p.adsEveryNPhotos < 3 || p.adsEveryNPhotos > 10)) throw new ApiError('invalid', 'Choose between every 3 and every 10 photos.');
    if (p.timezone !== undefined && !IANAZone.isValidZone(p.timezone)) throw new ApiError('invalid', 'That time zone is not recognised.');
    if (p.name !== undefined && !clean(p.name)) throw new ApiError('missing', 'Give the household a name.');
    const col: Record<string, string> = { name: 'name', timezone: 'timezone', weekStartsOn: 'week_starts_on', defaultView: 'default_view', adsEnabled: 'ads_enabled', adsEveryNPhotos: 'ads_every_n_photos', location: 'location' };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(p)) if (v !== undefined) { vals.push(typeof v === 'string' ? clean(v) : v); sets.push(`${col[k]} = $${vals.length}`); }
    return tenant(c, async (t) => {
      if (sets.length) await t.exec(`update households set ${sets.join(', ')} where id = $${vals.length + 1}`, [...vals, c.hid]);
      return mapHousehold((await t.one<HRow>(`select ${HH} from households where id = $1`, [c.hid]))!);
    });
  }, { write: true }),

  /* ---------------------------------------------------------------- profiles */
  listProfiles: def('read', [], async (c) => (await tenant(c, (t) => t.all<PRow>('select id, name, color, birthday, kind, star_balance from profiles where archived_at is null order by sort_order, created_at'))).map(mapProfile)),
  createProfile: def('adult', [z.object({ name: zStr(80), color: zHex, birthday: zDate.nullable().optional(), kind: z.enum(['person', 'other']).optional() })], async (c, i) => {
    if (!clean(i.name)) throw new ApiError('missing', 'Give this person a name.');
    return mapProfile((await tenant(c, (t) => t.one<PRow>(
      "insert into profiles (household_id, name, color, birthday, kind, sort_order) values ($1,$2,$3,$4,$5,(select coalesce(max(sort_order),0)+1 from profiles)) returning id, name, color, birthday, kind, star_balance",
      [c.hid, clean(i.name), i.color, i.birthday || null, i.kind ?? 'person'])))!);
  }, { write: true }),
  updateProfile: def('adult', [zId, z.object({ name: zStr(80).optional(), color: zHex.optional(), birthday: zDate.nullable().optional() })], async (c, id, p) => {
    if (p.name !== undefined && !clean(p.name)) throw new ApiError('missing', 'Give this person a name.');
    return mapProfile((await tenant(c, (t) => t.one<PRow>(
      `update profiles set name = coalesce($2, name), color = coalesce($3, color), birthday = case when $4::boolean then $5::date else birthday end where id = $1
       returning id, name, color, birthday, kind, star_balance`,
      [id, p.name === undefined ? null : clean(p.name), p.color ?? null, p.birthday !== undefined, p.birthday ?? null])))
      ?? (() => { throw new ApiError('not_found', 'That profile was not found.'); })());
  }, { write: true }),
  deleteProfile: def('adult', [zId], async (c, id) => tenant(c, async (t) => {
    const p = await t.one<{ name: string; kind: string }>('select name, kind from profiles where id = $1', [id]);
    if (!p) throw new ApiError('not_found', 'That profile was not found.');
    if (p.kind === 'household') throw new ApiError('protected', 'The household profile cannot be deleted.');
    const n = await t.one<{ n: number }>('select count(*)::int as n from events where profile_id = $1 and deleted_at is null', [id]);
    if (n!.n > 0) throw new ApiError('in_use', `${p.name} still has events. Merge ${p.name} into someone else instead.`);
    await t.exec('delete from events where profile_id = $1', [id]); // only soft-deleted ones are left
    await t.exec('delete from profiles where id = $1', [id]);
  }), { write: true }),
  mergeProfiles: def('adult', [zId, zId], async (c, fromId, intoId) => tenant(c, async (t) => {
    if (fromId === intoId) throw new ApiError('invalid', 'Pick two different people.');
    const from = await t.one<{ name: string; kind: string; star_balance: number }>('select name, kind, star_balance from profiles where id = $1', [fromId]);
    const into = await t.one('select id from profiles where id = $1', [intoId]);
    if (!from || !into) throw new ApiError('not_found', 'That profile was not found.');
    if (from.kind === 'household') throw new ApiError('protected', 'The household profile cannot be merged away.');
    await t.exec('update events set profile_id = $2 where profile_id = $1', [fromId, intoId]);
    await t.exec('update event_overrides set profile_id = $2 where profile_id = $1', [fromId, intoId]);
    await t.exec('update tasks set profile_id = $2 where profile_id = $1', [fromId, intoId]);
    await t.exec('update rewards set profile_id = $2 where profile_id = $1', [fromId, intoId]);
    await t.exec('update synced_calendars set profile_id = $2 where profile_id = $1', [fromId, intoId]);
    if (from.star_balance > 0) await t.exec("insert into star_ledger (household_id, profile_id, delta, reason, note) values ($1,$2,$3,'manual',$4)", [c.hid, intoId, from.star_balance, `Merged from ${from.name}`]);
    await t.exec('delete from profiles where id = $1', [fromId]);
  }), { write: true }),

  /* ---------------------------------------------------------------- members and invitations */
  listMembers: def('read', [], async (c) => tenant(c, async (t) => {
    const ms = await t.all<{ id: string; name: string; email: string; role: Role }>(
      'select u.id, coalesce(u.name, u.email) as name, u.email, m.role from household_members m join users u on u.id = m.user_id order by m.created_at');
    const inv = await t.all<{ id: string; email: string; role: 'adult' | 'viewer'; expires_at: string }>('select id, email, role, expires_at from invitations where accepted_at is null and expires_at > now() order by created_at');
    return { members: ms.map((m) => ({ ...m, isYou: m.id === c.userId })), invitations: inv.map((i) => ({ id: i.id, email: i.email, role: i.role, token: '', expiresAt: i.expires_at })) };
  })),
  invite: def('adult', [zStr(200), z.enum(['adult', 'viewer'])], async (c, emailRaw, role) => {
    const email = clean(emailRaw).toLowerCase();
    if (!EMAIL.test(email)) throw new ApiError('invalid_email', 'Enter an email address like name@example.com.');
    limit(`invite:${c.hid}`, 20, 86400_000);
    const token = randomToken(24);
    const r = await tenant(c, async (t) => {
      const hh = await t.one<{ name: string }>('select name from households where id = $1', [c.hid]);
      const i = await t.one<{ id: string; expires_at: string }>("insert into invitations (household_id, email, role, token_hash, invited_by, expires_at) values ($1,$2,$3,$4,$5, now() + interval '7 days') returning id, expires_at", [c.hid, email, role, sha256(token), c.userId ?? null]);
      return { id: i!.id, expiresAt: i!.expires_at, household: hh!.name };
    });
    await sendMail(email, `You are invited to ${r.household}`, `You can join "${r.household}" on Family Calendar.\n\nOpen this link: ${env.baseUrl || ''}/join/${token}\n\nThe link works for 7 days.`);
    return { id: r.id, email, role, token, expiresAt: r.expiresAt };
  }, { write: true }),
  revokeInvitation: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from invitations where id = $1', [id])); }, { write: true }),
  setMemberRole: def('owner', [zId, z.enum(['owner', 'adult', 'viewer'])], async (c, id, role) => {
    if (id === c.userId) throw new ApiError('protected', 'You cannot change your own role.');
    if (role === 'owner') throw new ApiError('invalid', 'A household has one owner.');
    const n = await tenant(c, (t) => t.exec("update household_members set role = $2 where user_id = $1 and role <> 'owner'", [id, role]));
    if (!n) throw new ApiError('not_found', 'That person was not found.');
  }, { write: true }),
  removeMember: def('owner', [zId], async (c, id) => {
    if (id === c.userId) throw new ApiError('protected', 'You cannot remove yourself here.');
    const n = await tenant(c, (t) => t.exec("delete from household_members where user_id = $1 and role <> 'owner'", [id]));
    if (!n) throw new ApiError('not_found', 'That person was not found.');
  }, { write: true }),
  previewInvitation: def('public', [zStr(100)], async (c, token) => {
    limit(`invprev:${c.ip}`, 30, 600_000);
    const i = await plain((t) => t.one<{ household_name: string; email: string; role: string }>('select * from invitation_by_hash($1)', [sha256(token)]));
    if (!i) throw new ApiError('not_found', 'This invitation link has expired or was already used.');
    return { householdName: i.household_name, email: i.email, role: i.role as 'adult' | 'viewer' };
  }),
  acceptInvitation: def('user', [zStr(100)], async (c, token) => {
    limit(`invacc:${c.ip}`, 20, 600_000);
    await acceptInto(c.jar, c.userId!, c.userName!, token);
  }),

  /* ---------------------------------------------------------------- screens (devices) and pairing */
  listDevices: def('adult', [], async (c) => (await tenant(c, (t) => t.all<{ id: string; nickname: string; kind: 'display' | 'browser'; last_seen_at: string | null; created_at: string; config: Record<string, unknown> }>(
    'select id, nickname, kind, last_seen_at, created_at, config from devices where revoked_at is null order by created_at'))).map((d) => ({ id: d.id, nickname: d.nickname, kind: d.kind, lastSeenAt: d.last_seen_at, createdAt: d.created_at, config: d.config as { theme?: 'auto' | 'light' | 'dark'; idleMinutes?: number } }))),
  getDevice: def('read', [zId], async (c, id) => {
    const d = await tenant(c, (t) => t.one<{ id: string; nickname: string; kind: 'display' | 'browser'; last_seen_at: string | null; created_at: string; config: Record<string, unknown> }>('select id, nickname, kind, last_seen_at, created_at, config from devices where id = $1 and revoked_at is null', [id]));
    return d ? { id: d.id, nickname: d.nickname, kind: d.kind, lastSeenAt: d.last_seen_at, createdAt: d.created_at, config: d.config as { theme?: 'auto' | 'light' | 'dark'; idleMinutes?: number } } : null;
  }),
  updateDevice: def('adult', [zId, z.object({ nickname: zStr(60).optional(), config: z.object({ theme: z.enum(['auto', 'light', 'dark']).optional(), idleMinutes: z.number().int().min(0).max(240).optional() }).optional() })], async (c, id, p) => {
    if (p.nickname !== undefined && !clean(p.nickname)) throw new ApiError('missing', 'Give this screen a name.');
    const n = await tenant(c, (t) => t.exec('update devices set nickname = coalesce($2, nickname), config = coalesce($3::jsonb, config) where id = $1 and revoked_at is null', [id, p.nickname === undefined ? null : clean(p.nickname), p.config ? JSON.stringify(p.config) : null]));
    if (!n) throw new ApiError('not_found', 'That screen was not found.');
  }, { write: true }),
  removeDevice: def('adult', [zId], async (c, id) => { await tenant(c, (t) => t.exec('delete from devices where id = $1', [id])); }, { write: true }),
  startPairing: def('public', [], async (c) => {
    limit(`pair:${c.ip}`, 30, 3600_000);
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L
    const token = randomToken(32);
    for (let tries = 0; tries < 5; tries++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => A[b % A.length]).join('');
      const row = await plain(async (t) => {
        await t.exec('delete from device_pairing_codes where expires_at < now() - interval \'1 hour\'');
        return t.one<{ expires_at: string }>("insert into device_pairing_codes (code, poll_secret_hash, expires_at) values ($1,$2, now() + interval '10 minutes') on conflict (code) do nothing returning expires_at", [code, sha256(token)]);
      });
      if (row) { c.jar.set(COOKIE.pending, token, { maxAge: 700 }); return { code, expiresAt: row.expires_at }; }
    }
    throw new ApiError('server_error', 'Could not make a code. Try again.');
  }),
  pairingStatus: def('public', [zStr(10)], async (c, code) => {
    limit(`pairpoll:${c.ip}`, 600, 600_000);
    const token = c.jar.get(COOKIE.pending);
    if (!token) return 'expired' as const;
    const r = await plain((t) => t.one<{ expires_at: string; device_id: string | null }>('select expires_at, device_id from device_pairing_codes where code = $1 and poll_secret_hash = $2', [code.toUpperCase(), sha256(token)]));
    if (!r) return 'expired' as const;
    if (r.device_id) { c.jar.set(COOKIE.device, token, { maxAge: 3650 * 86400 }); c.jar.delete(COOKIE.pending); return 'paired' as const; }
    return new Date(r.expires_at) < new Date() ? ('expired' as const) : ('pending' as const);
  }),
  claimPairing: def('adult', [zStr(20), zStr(60)], async (c, codeRaw, nickname) => {
    limit(`claim:${c.userId ?? c.ip}`, 10, 600_000);
    const code = codeRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean(nickname)) throw new ApiError('missing', 'Give this screen a name, like Kitchen.');
    const row = await plain((t) => t.one<{ id: string; poll_secret_hash: string }>('select id, poll_secret_hash from device_pairing_codes where code = $1 and expires_at > now() and device_id is null', [code]));
    if (!row) throw new ApiError('bad_code', 'That code is not right, or it has expired. Check the screen and try again.');
    const dev = await tenant(c, async (t) => {
      const taken = await t.one('select 1 from devices where lower(nickname) = lower($1) and revoked_at is null', [clean(nickname)]);
      if (taken) throw new ApiError('name_taken', 'Another screen already has that name.');
      return t.one<{ id: string; nickname: string; created_at: string }>("insert into devices (household_id, nickname, kind, token_hash, config) values ($1,$2,'display',$3,'{\"theme\":\"auto\",\"idleMinutes\":5}') returning id, nickname, created_at", [c.hid, clean(nickname), row.poll_secret_hash]);
    });
    const won = await plain((t) => t.exec('update device_pairing_codes set claimed_at = now(), claimed_by = $2, household_id = $3, device_id = $4 where id = $1 and device_id is null', [row.id, c.userId ?? null, c.hid, dev!.id]));
    if (!won) { await tenant(c, (t) => t.exec('delete from devices where id = $1', [dev!.id])); throw new ApiError('bad_code', 'That code was just used on another screen.'); }
    return { id: dev!.id, nickname: dev!.nickname, kind: 'display' as const, lastSeenAt: null, createdAt: dev!.created_at, config: { theme: 'auto' as const, idleMinutes: 5 } };
  }, { write: true }),

  /* ---------------------------------------------------------------- parent PIN */
  hasPin: def('read', [], async (c) => !!(await tenant(c, (t) => t.one<{ x: number }>('select 1 as x from households where id = $1 and parent_pin_hash is not null', [c.hid])))),
  setPin: def('adult', [z.string().regex(/^\d{4}$/, 'pin').nullable()], async (c, pin) => {
    const h = pin === null ? null : await hashPassword(pin);
    await tenant(c, (t) => t.exec('update households set parent_pin_hash = $2 where id = $1', [c.hid, h]));
  }, { write: true }),
  verifyPin: def('read', [zStr(10)], async (c, pin) => {
    limit(`pin:${c.deviceId ?? c.userId}`, 10, 300_000);
    const r = await tenant(c, (t) => t.one<{ parent_pin_hash: string | null }>('select parent_pin_hash from households where id = $1', [c.hid]));
    if (!r?.parent_pin_hash) return true;
    const ok = await verifyPassword(pin, r.parent_pin_hash);
    if (ok && c.kind === 'device') c.jar.set(COOKIE.unlock, sign({ h: c.hid }, 300), { maxAge: 300 });
    return ok;
  }),

  /* ---------------------------------------------------------------- account */
  exportAll: def('owner', [], async (c) => tenant(c, async (t) => {
    const tables = ['households', 'profiles', 'event_categories', 'events', 'event_overrides', 'countdowns', 'tasks', 'task_completions', 'rewards', 'star_ledger', 'lists', 'list_items', 'recipes', 'meal_plan_entries', 'photo_albums'];
    const out: Record<string, unknown> = {};
    for (const n of tables) out[n] = await t.all(`select * from ${n}`);
    out.photos = await t.all('select id, album_id, mime, bytes, width, height, caption, created_at from photos where deleted_at is null');
    out.members = await t.all('select u.email, m.role from household_members m join users u on u.id = m.user_id');
    return JSON.stringify(out, null, 2);
  })),
  deleteAccount: def('user', [], async (c) => {
    const ms = await plain((t) => t.all<{ household_id: string; role: Role }>('select * from user_memberships($1)', [c.userId]));
    for (const m of ms) {
      // The owner's delete removes the whole household, as the screen says. Anyone else just leaves.
      if (m.role === 'owner') {
        await withTenant(m.household_id, (t) => t.exec('delete from households where id = $1', [m.household_id]));
        await rm(join(env.photoDir, m.household_id), { recursive: true, force: true });
      } else await withTenant(m.household_id, (t) => t.exec('delete from household_members where user_id = $1', [c.userId]));
    }
    await plain((t) => t.exec('delete from users where id = $1', [c.userId]));
    c.jar.delete(COOKIE.session);
  }),
};
void DateTime; void verify;
