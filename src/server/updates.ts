// Software updates from GitHub, started from Settings by the person who runs the server.
// The web app cannot control Docker (and should not be able to), so it only does two things: it asks GitHub what the newest
// version is, and it drops a small "please update" request file in a folder shared with a script on the host (scripts/updater.sh).
// That script makes the backup, downloads, rebuilds, checks the app came up, and goes back to the old version if it did not.
// It writes its progress to the same folder, which the Updates screen reads.
import { randomUUID } from 'node:crypto';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ApiError } from '@/lib/types';
import { env } from './env';
import { def, limit } from './rpc';

const HEARTBEAT_FRESH_MS = 90_000;
const short = (sha: string) => sha.slice(0, 7);
const file = (n: string) => `${env.updateDir}/${n}`;

export type UpdateCheck = {
  at: string; ok: boolean; error: string;
  latest: { sha: string; short: string; message: string; date: string } | null;
  /** What the newest version has that this one does not, newest first. Empty when GitHub cannot say. */
  changes: string[]; behind: number | null;
  upToDate: boolean; newerThanGithub: boolean; unrelated: boolean;
};
let lastCheck: UpdateCheck | null = null;

async function gh(path: string) {
  let r: Response;
  try { r = await fetch(`${env.updateApiBase}${path}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'FamilyCenter-updater', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new ApiError('offline', 'Could not reach GitHub. Check that the server has internet access.'); }
  if (r.status === 403 || r.status === 429) throw new ApiError('rate_limited', 'GitHub is limiting checks from this address. Try again in a few minutes.');
  return r;
}

async function readJson<T>(name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file(name), 'utf8')) as T; } catch { return null; }
}
const exists = async (name: string) => { try { await stat(file(name)); return true; } catch { return false; } };

export async function checkGithub(): Promise<UpdateCheck> {
  const base: UpdateCheck = { at: new Date().toISOString(), ok: false, error: '', latest: null, changes: [], behind: null, upToDate: false, newerThanGithub: false, unrelated: false };
  const cur = env.appCommit;
  try {
    const r = await gh(`/repos/${env.updateRepo}/commits/${encodeURIComponent(env.updateBranch)}`);
    if (r.status === 404) throw new ApiError('not_found', `GitHub has no branch “${env.updateBranch}” in ${env.updateRepo}, or the repository is private. Check UPDATE_REPO and UPDATE_BRANCH in the settings file.`);
    if (!r.ok) throw new ApiError('github', `GitHub answered ${r.status}. Try again later.`);
    const j = (await r.json()) as { sha?: string; commit?: { message?: string; committer?: { date?: string } } };
    if (!j.sha) throw new ApiError('github', 'GitHub sent an answer that could not be read.');
    base.latest = { sha: j.sha, short: short(j.sha), message: (j.commit?.message ?? '').split('\n')[0].slice(0, 200), date: j.commit?.committer?.date ?? '' };
    base.ok = true;
    if (cur === 'unknown' || !/^[0-9a-f]{7,40}$/.test(cur)) return (lastCheck = base);
    if (j.sha.startsWith(cur) || cur.startsWith(j.sha)) { base.upToDate = true; base.behind = 0; return (lastCheck = base); }
    const c = await gh(`/repos/${env.updateRepo}/compare/${cur}...${j.sha}`);
    if (c.ok) {
      const cj = (await c.json()) as { status?: string; ahead_by?: number; behind_by?: number; commits?: { commit?: { message?: string } }[] };
      if (cj.status === 'ahead') { base.behind = cj.ahead_by ?? null; base.changes = (cj.commits ?? []).map((x) => (x.commit?.message ?? '').split('\n')[0].slice(0, 160)).filter(Boolean).reverse().slice(0, 15); }
      else if (cj.status === 'identical') { base.upToDate = true; base.behind = 0; }
      else if (cj.status === 'behind') { base.upToDate = true; base.newerThanGithub = true; base.behind = 0; }
      else base.unrelated = true;
    } else base.unrelated = true; // GitHub does not know this version (for example the history was replaced): still different, so an update is offered
  } catch (e) {
    base.ok = false; base.error = e instanceof ApiError ? e.message : 'The check did not work.';
    if (!(e instanceof ApiError)) console.error('update check failed', e instanceof Error ? e.message : e);
  }
  return (lastCheck = base);
}

type Run = { id: string; state: string; step: string; message: string; from: string; to: string; startedAt: string; updatedAt: string; log: string[] };

async function status() {
  const dirOk = !!env.updateDir && (await stat(env.updateDir).then((s) => s.isDirectory(), () => false));
  const hb = dirOk ? await readJson<{ at?: string; head?: string; branch?: string }>('heartbeat.json') : null;
  const installed = !!hb?.at && Date.now() - Date.parse(hb.at) < HEARTBEAT_FRESH_MS;
  const run = dirOk ? await readJson<Run>('status.json') : null;
  const pending = dirOk && (await exists('request'));
  const cur = env.appCommit;
  return {
    current: { commit: cur, short: cur === 'unknown' ? '' : short(cur), known: cur !== 'unknown' },
    repo: env.updateRepo, branch: env.updateBranch,
    folderReady: dirOk, installed, hostHead: hb?.head ? short(hb.head) : '',
    pending,
    run: run ? { id: run.id ?? '', state: run.state ?? '', step: run.step ?? '', message: run.message ?? '', from: short(run.from ?? ''), to: short(run.to ?? ''), startedAt: run.startedAt ?? '', updatedAt: run.updatedAt ?? '', log: Array.isArray(run.log) ? run.log.slice(-30).map(String) : [] } : null,
    check: lastCheck,
  };
}
export type UpdateStatus = Awaited<ReturnType<typeof status>>;

const mustBeAdmin = (c: { kind: string; platformAdmin: boolean }) => {
  if (!(c.kind === 'user' && c.platformAdmin)) throw new ApiError('forbidden', 'Only the person who runs this server can do this.');
};

export const updates = {
  /** Asked every few seconds while an update runs, so it needs no PIN; it only shows progress. */
  getUpdateStatus: def('user', [], async (c) => { mustBeAdmin(c); return status(); }),
  checkForUpdate: def('admin', [], async (c) => { limit(`upcheck:${c.userId}`, 20, 600_000); await checkGithub(); return status(); }, { write: false }),
  requestUpdate: def('admin', [z.object({ rebuild: z.boolean().optional() }).optional()], async (c, o) => {
    limit(`upreq:${c.userId}`, 6, 600_000);
    const s = await status();
    if (!s.folderReady) throw new ApiError('not_installed', 'The updates folder is missing. Create it next to the settings file (mkdir updates), then run docker compose up -d.');
    if (!s.installed) throw new ApiError('not_installed', 'The updater is not running on this server. Install it once with: sudo ./scripts/install-updater.sh');
    if (s.pending || ['running', 'requested'].includes(s.run?.state ?? '')) throw new ApiError('busy', 'An update is already in progress.');
    const id = randomUUID();
    const tmp = file(`request.${id}.tmp`);
    try {
      await writeFile(tmp, `id=${id}\nforce=${o?.rebuild ? 1 : 0}\n`, { mode: 0o666 });
      await rename(tmp, file('request'));
      await writeFile(file('status.json'), JSON.stringify({ id, state: 'requested', step: 'waiting', message: 'Waiting for the updater to start', from: '', to: '', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: [] }), { mode: 0o666 });
    } catch (e) {
      console.error('update request failed', e instanceof Error ? e.message : e);
      throw new ApiError('not_writable', 'The server could not write to its updates folder. On the server run: sudo chown -R 1000:1000 updates');
    }
    return { id };
  }, { write: false }),
};
