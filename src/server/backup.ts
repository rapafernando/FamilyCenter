import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { env } from './env';

const run = promisify(execFile);

/** Dumps the database (and the photo folder) into BACKUP_DIR, then deletes dumps older than BACKUP_KEEP_DAYS. */
export async function backupNow(): Promise<{ files: string[] }> {
  const dir = resolve(process.env.BACKUP_DIR || './backups');
  const keep = Number(process.env.BACKUP_KEEP_DAYS || '14');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const dump = join(dir, `family-${stamp}.dump`);
  const url = process.env.DATABASE_ADMIN_URL || env.workerDatabaseUrl; // the worker role can read every row
  await run('pg_dump', ['--format=custom', '--no-owner', '--dbname', url, '--file', dump], { timeout: 10 * 60_000 });
  const files = [dump];
  try {
    await stat(resolve(env.photoDir));
    const tar = join(dir, `photos-${stamp}.tar.gz`);
    await run('tar', ['-czf', tar, '-C', resolve(env.photoDir), '.'], { timeout: 10 * 60_000 });
    files.push(tar);
  } catch { /* no photos yet */ }
  const cutoff = Date.now() - keep * 86400_000;
  for (const f of await readdir(dir)) {
    if (!/^(family|photos)-\d{12}\.(dump|tar\.gz)$/.test(f)) continue;
    const p = join(dir, f);
    if ((await stat(p)).mtimeMs < cutoff) await rm(p, { force: true });
  }
  return { files };
}
