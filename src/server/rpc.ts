import { z } from 'zod';
import { ApiError, type Role } from '@/lib/types';
import { plain, withTenant, notifyChange, mapDbError, type Tx } from './db';
import { env } from './env';
import { sha256, sign, verify } from './crypto';

/* ------------------------------------------------------------------ who is calling */
export type CookieOpts = { maxAge?: number };
export type Jar = { get(name: string): string | undefined; set(name: string, value: string, o?: CookieOpts): void; delete(name: string): void };
export type Ctx = {
  jar: Jar; ip: string; kind: 'user' | 'device' | 'anon';
  userId?: string; userName?: string; email?: string; platformAdmin: boolean;
  householdId?: string; role?: Role; deviceId?: string; deviceName?: string; unlocked: boolean;
  /** A parent PIN exists for this household / was entered in this browser in the last five minutes. */
  pinSet: boolean; pinFresh: boolean;
};
export const COOKIE = { session: 'fc_session', device: 'fc_device', pending: 'fc_pairing', unlock: 'fc_unlock' } as const;
const DAY = 86400;

export function startSession(jar: Jar, userId: string, householdId: string | null, version: number) {
  jar.set(COOKIE.session, sign({ u: userId, h: householdId, sv: version }, 30 * DAY), { maxAge: 30 * DAY });
}

/** Whether the household has a parent PIN, and whether this browser entered it within the last five minutes (signed cookie). */
async function pinState(hid: string, jar: Jar) {
  const row = await withTenant(hid, (t) => t.one<{ x: number }>('select 1 as x from households where id = $1 and parent_pin_hash is not null', [hid]));
  const un = verify<{ h: string }>(jar.get(COOKIE.unlock));
  return { pinSet: !!row, pinFresh: !!un && un.h === hid };
}

export async function resolveCtx(jar: Jar, ip: string): Promise<Ctx> {
  const base: Ctx = { jar, ip, kind: 'anon', platformAdmin: false, unlocked: false, pinSet: false, pinFresh: false };
  const s = verify<{ u: string; h: string | null; sv: number }>(jar.get(COOKIE.session));
  if (s) {
    const u = await plain((t) => t.one<{ id: string; name: string | null; email: string; session_version: number; is_platform_admin: boolean }>(
      'select id, name, email, session_version, is_platform_admin from users where id = $1 and deletion_requested_at is null', [s.u]));
    if (u && u.session_version === s.sv) {
      const ms = await plain((t) => t.all<{ household_id: string; role: Role }>('select * from user_memberships($1)', [u.id]));
      const m = ms.find((x) => x.household_id === s.h) ?? ms[0];
      const pin = m ? await pinState(m.household_id, jar) : { pinSet: false, pinFresh: false };
      return { ...base, ...pin, kind: 'user', userId: u.id, userName: u.name ?? u.email, email: u.email, platformAdmin: u.is_platform_admin, householdId: m?.household_id, role: m?.role };
    }
  }
  const dev = jar.get(COOKIE.device);
  if (dev) {
    const d = await plain((t) => t.one<{ id: string; household_id: string; nickname: string }>('select * from auth_device($1)', [sha256(dev)]));
    if (d) {
      const pin = await pinState(d.household_id, jar);
      // Everyday adult actions on a screen stay open when no PIN has been chosen yet (older households); Settings never are.
      return { ...base, ...pin, kind: 'device', householdId: d.household_id, deviceId: d.id, deviceName: d.nickname, unlocked: !pin.pinSet || pin.pinFresh };
    }
  }
  return base;
}

/* ------------------------------------------------------------------ what each call needs */
/** `settings` = what the Settings screens do: an adult or owner (or a paired screen) who has also entered the parent PIN. `admin` = settings, plus the person who runs this server. */
export type Level = 'public' | 'user' | 'read' | 'member' | 'adult' | 'owner' | 'settings' | 'admin';
function allowed(c: Ctx, level: Level) {
  if (level === 'public') return;
  if (c.kind === 'anon') throw new ApiError('unauthenticated', 'Sign in to continue.');
  if (level === 'user') { if (c.kind !== 'user') throw new ApiError('forbidden', 'Sign in with your account to do this.'); return; }
  if (!c.householdId) throw new ApiError('no_household', 'Create or join a household first.');
  if (level === 'read') return;
  if (level === 'settings' || level === 'admin') {
    if (c.kind === 'user' && c.role !== 'owner' && c.role !== 'adult') throw new ApiError('forbidden', 'Your role can look but not change things.');
    if (level === 'admin' && !(c.kind === 'user' && c.platformAdmin)) throw new ApiError('forbidden', 'Only the person who runs this server can do this.');
    if (!c.pinSet) throw new ApiError('pin_required', 'Choose a parent PIN first. Settings need it.');
    if (!c.pinFresh) throw new ApiError('locked', 'Enter the parent PIN to do this.');
    return;
  }
  if (c.kind === 'device') {
    if (level === 'member') return;
    if (level === 'adult' && c.unlocked) return;
    throw new ApiError('locked', 'Enter the parent PIN to do this.');
  }
  const r = c.role;
  if (level === 'member' || level === 'adult') { if (r === 'owner' || r === 'adult') return; }
  if (level === 'owner' && r === 'owner') return;
  throw new ApiError('forbidden', r === 'viewer' ? 'Your role can look but not change things.' : 'Only the household owner can do this.');
}

/* ------------------------------------------------------------------ handler table */
type Def = { level: Level; schema: z.ZodTypeAny; n: number; write: boolean; fn: (c: Ctx, ...a: never[]) => Promise<unknown> };
export const registry: Record<string, Def> = {};

export function def<const S extends readonly z.ZodTypeAny[], R>(level: Level, args: S, fn: (c: Ctx & { hid: string }, ...a: { [K in keyof S]: z.infer<S[K]> }) => Promise<R>, o: { write?: boolean } = {}) {
  return { level, schema: z.tuple(args as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]), n: args.length, write: o.write ?? false, fn: fn as unknown as Def['fn'] } satisfies Def;
}
export const tenant = <T,>(c: Ctx & { hid: string }, fn: (t: Tx) => Promise<T>) => withTenant(c.hid, fn);

/* ------------------------------------------------------------------ shared validators */
export const zId = z.string().uuid();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const zInstant = z.string().datetime({ offset: true });
export const zHex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const zStr = (n = 200) => z.string().max(n);

/* ------------------------------------------------------------------ rate limits (one web process; move to Postgres before running several) */
const hits = new Map<string, number[]>();
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now(); const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new ApiError('rate_limited', 'Too many tries. Wait a few minutes and try again.');
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}

/* ------------------------------------------------------------------ run one call */
export async function call(c: Ctx, method: string, args: unknown): Promise<unknown> {
  const d = registry[method];
  if (!d || !Object.prototype.hasOwnProperty.call(registry, method)) throw new ApiError('not_found', 'Unknown request.');
  allowed(c, d.level);
  const given = Array.isArray(args) ? [...args] : [];
  while (given.length < d.n) given.push(undefined);
  const parsed = d.schema.safeParse(given.slice(0, d.n));
  if (!parsed.success) throw new ApiError('invalid', 'One of the values is not valid.');
  const hid = c.householdId;
  try {
    const r = await d.fn({ ...c, hid: hid ?? '' } as never, ...(parsed.data as never[]));
    if (d.write && hid) void notifyChange(hid, method);
    return r === undefined ? null : r;
  } catch (e) { mapDbError(e); }
}

export const statusFor = (code: string) =>
  ({ unauthenticated: 401, forbidden: 403, locked: 403, pin_required: 403, not_found: 404, rate_limited: 429, server_error: 500, stars_spent: 409, not_enough_stars: 409, duplicate: 409, name_taken: 409, email_taken: 409, in_use: 409 } as Record<string, number>)[code] ?? 400;

export const unused = env; // keeps tree-shaking from dropping env during build analysis
