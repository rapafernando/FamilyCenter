// Runs every db/migrations/*.sql once, in order, as the database owner. Safe to run again.
// Usage: DATABASE_ADMIN_URL=postgres://owner:pw@host/db node scripts/migrate.mjs
// Also sets passwords for app_user and app_worker when APP_USER_PASSWORD / APP_WORKER_PASSWORD are set.
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const url = process.env.DATABASE_ADMIN_URL;
if (!url) { console.error('Set DATABASE_ADMIN_URL to a connection string for the database owner.'); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await c.query('begin');
    try { await c.query(sql); await c.query('insert into schema_migrations (name) values ($1)', [f]); await c.query('commit'); console.log('applied', f); }
    catch (e) { await c.query('rollback'); console.error('FAILED', f, e.message); process.exit(1); }
  }
  for (const [role, pw] of [['app_user', process.env.APP_USER_PASSWORD], ['app_worker', process.env.APP_WORKER_PASSWORD]]) {
    if (pw) { await c.query(`alter role ${role} login password ${c.escapeLiteral(pw)}`); console.log('password set for', role); }
  }
  console.log('database is up to date');
} finally { await c.end(); }
