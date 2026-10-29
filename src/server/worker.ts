// The background worker. Run it next to the web app: `npm run worker`.
// Everything here uses UTC and writes a row to job_runs / job_failures so you can see what happened.
import './loadenv';
import { plain } from './db';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env';
import { backupNow } from './backup';
import { checkConnectionToken, connectionsDueForSync, deferSync, connectionsForTokenCheck, syncConnection } from './google';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tries up to three times with a short pause. If it still fails, the failure goes to the dead-letter table and the worker moves on. */
async function runJob(name: string, subject: string | null, fn: () => Promise<void>, onGiveUp?: () => Promise<void>) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await fn(); await plain((t) => t.exec('insert into job_runs (name, last_run_at, last_error) values ($1, now(), null) on conflict (name) do update set last_run_at = now(), last_error = null', [name]), 'worker'); return; }
    catch (e) { last = (e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/g, 'postgres://…').slice(0, 500); if (attempt < 3) await sleep(2000 * 2 ** (attempt - 1)); }
  }
  log('job failed for good:', name, subject ?? '', last);
  if (onGiveUp) await onGiveUp().catch(() => {});
  await plain(async (t) => {
    await t.exec('insert into job_failures (job, subject, error, attempts) values ($1,$2,$3,3)', [name, subject, last]);
    await t.exec('insert into job_runs (name, last_run_at, last_error) values ($1, now(), $2) on conflict (name) do update set last_run_at = now(), last_error = $2', [name, last]);
  }, 'worker').catch(() => {});
}

/** True when `name` has not run for `everyMs`; claims the slot so two workers do not both run it. */
async function due(name: string, everyMs: number): Promise<boolean> {
  const n = await plain((t) => t.exec(`insert into job_runs (name, last_run_at) values ($1, now())
    on conflict (name) do update set last_run_at = now() where job_runs.last_run_at is null or job_runs.last_run_at < now() - ($2 || ' milliseconds')::interval`, [name, String(everyMs)]), 'worker');
  return n > 0;
}

async function cleanup() {
  await plain(async (t) => {
    await t.exec("delete from device_pairing_codes where expires_at < now() - interval '1 hour'");
    await t.exec("delete from invitations where expires_at < now() - interval '30 days'");
    await t.exec("update ai_jobs set input = '{}'::jsonb, input_purge_at = null where input_purge_at is not null and input_purge_at < now()");
    await t.exec("delete from ai_jobs where created_at < now() - interval '30 days'");
    await t.exec("delete from job_failures where created_at < now() - interval '90 days'");
    await t.exec("delete from photo_imports where created_at < now() - interval '2 days'");
  }, 'worker');
  // Sample households last one day.
  const old = await plain((t) => t.all<{ id: string }>("select id from users where email like 'demo-%@demo.invalid' and created_at < now() - interval '24 hours'"), 'worker');
  for (const u of old) {
    const hs = await plain((t) => t.all<{ household_id: string }>('select household_id from household_members where user_id = $1', [u.id]), 'worker');
    for (const h of hs) { await plain((t) => t.exec('delete from households where id = $1', [h.household_id]), 'worker'); await rm(join(env.photoDir, h.household_id), { recursive: true, force: true }); }
    await plain((t) => t.exec('delete from users where id = $1', [u.id]), 'worker');
  }
}

let stopping = false;
async function tick() {
  if (await due('google-sync-scan', 60_000)) {
    for (const c of await connectionsDueForSync()) await runJob('google-sync', c.id, () => syncConnection(c.hid, c.id, 'worker'), () => deferSync(c.hid, c.id));
  }
  if (await due('google-token-scan', 10 * 60_000)) {
    // Each connection is checked about once a day; this scan only picks the ones that are due (or were missed while the worker was down).
    for (const c of await connectionsForTokenCheck()) await runJob('google-token-check', c.id, () => checkConnectionToken(c.hid, c.id, 'worker'));
  }
  if (await due('cleanup', 3600_000)) await runJob('cleanup', null, cleanup);
  if (new Date().getUTCHours() === 3 && (await due('backup', 20 * 3600_000))) await runJob('backup', null, async () => { await backupNow(); });
}

async function main() {
  log('worker started');
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  while (!stopping) {
    try { await tick(); } catch (e) { log('tick failed', e instanceof Error ? e.message : e); }
    for (let i = 0; i < 20 && !stopping; i++) await sleep(500);
  }
  log('worker stopped'); process.exit(0);
}
void main();
