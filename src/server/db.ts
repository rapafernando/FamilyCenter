import pg from 'pg';
import { ApiError } from '@/lib/types';
import { env } from './env';

// Dates stay plain strings, instants become ISO strings, counts become numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(20, (v) => Number(v));

export type Tx = {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string, params?: unknown[]): Promise<number>;
};
const wrap = (c: pg.PoolClient | pg.Pool): Tx => ({
  async all(sql, params) { return (await c.query(sql, params as unknown[])).rows as never; },
  async one(sql, params) { return ((await c.query(sql, params as unknown[])).rows[0] ?? null) as never; },
  async exec(sql, params) { return (await c.query(sql, params as unknown[])).rowCount ?? 0; },
});

const g = globalThis as unknown as { __pools?: { app?: pg.Pool; worker?: pg.Pool } };
g.__pools ??= {};
export const pool = (kind: 'app' | 'worker' = 'app'): pg.Pool => {
  const p = (g.__pools ??= {});
  return (p[kind] ??= new pg.Pool({ connectionString: kind === 'app' ? env.databaseUrl : env.workerDatabaseUrl, max: 10 }));
};

/** Maps database rule violations to messages a person can act on. Anything unknown stays hidden. */
export function mapDbError(e: unknown): never {
  if (e instanceof ApiError) throw e;
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err?.code === '23514' && err.constraint === 'profiles_star_balance_check') throw new ApiError('not_enough_stars', 'There are not enough stars for that.');
  if (err?.code === '23505') {
    if (err.constraint === 'users_email_lower') throw new ApiError('email_taken', 'There is already an account with that email. Try signing in.');
    if (err.constraint === 'devices_nickname') throw new ApiError('name_taken', 'Another screen already has that name.');
    if (err.constraint === 'event_categories_name') throw new ApiError('name_taken', 'A category with that name already exists.');
    if (err.constraint === 'ai_providers_household_id_label_key') throw new ApiError('name_taken', 'You already have a key with that name.');
    throw new ApiError('duplicate', 'That already exists.');
  }
  if (err?.code === '23503') throw new ApiError('in_use', 'Something else still depends on this.');
  if (err?.code === '22P02' || err?.code === '22007' || err?.code === '22008') throw new ApiError('invalid', 'One of the values is not valid.');
  console.error('database error', err?.code, err?.constraint, err?.message);
  throw new ApiError('server_error', 'Something went wrong on our side. Try again in a moment.');
}

/** The only way route code gets a tenant-scoped database handle. Every row it can see belongs to `householdId`. */
export async function withTenant<T>(householdId: string, fn: (tx: Tx) => Promise<T>, kind: 'app' | 'worker' = 'app'): Promise<T> {
  const client = await pool(kind).connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.household_id', $1, true)", [householdId]);
    const r = await fn(wrap(client));
    await client.query('commit');
    return r;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    mapDbError(e);
  } finally { client.release(); }
}

/** For the few tables that are not tenant data (users, pairing codes, ads) and the narrow definer functions. */
export async function plain<T>(fn: (tx: Tx) => Promise<T>, kind: 'app' | 'worker' = 'app'): Promise<T> {
  const client = await pool(kind).connect();
  try { await client.query('begin'); const r = await fn(wrap(client)); await client.query('commit'); return r; }
  catch (e) { await client.query('rollback').catch(() => {}); mapDbError(e); }
  finally { client.release(); }
}

export const notifyChange = (householdId: string, type = 'change') =>
  pool().query('select pg_notify($1, $2)', ['changes', JSON.stringify({ h: householdId, t: type })]).catch(() => {});
