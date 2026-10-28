'use client';
// The real data layer: every call goes to /api/rpc on this server. Same names and shapes as the practice layer in fake.ts,
// so screens do not know the difference. Session cookies are http-only; nothing secret is kept in page storage.
import { ApiError } from '../types';
import { bump } from './store';
import type { Data } from './fake';

const READ = /^(get|list|has|verify|features|aiStatus|screensaver|preview|exportAll|pairingStatus|adImpression)/;

let lastUnauthBump = 0;

async function rpc(method: string, args: unknown[]): Promise<unknown> {
  const a = [...args]; while (a.length && a[a.length - 1] === undefined) a.pop(); // JSON turns undefined into null, which the server would reject
  let res: Response;
  try {
    res = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ m: method, a }), credentials: 'same-origin', cache: 'no-store' });
  } catch { throw new ApiError('offline', 'Could not reach the server. Check the connection and try again.'); }
  const j = (await res.json().catch(() => null)) as { ok: boolean; r?: unknown; error?: { code: string; message: string } } | null;
  if (!j) throw new ApiError('server_error', 'The server sent an answer that could not be read. Try again in a moment.');
  if (!j.ok) {
    // Re-read the session once so the screen can send the person to the welcome page. Bumping on every refused call made
    // every screen re-ask, get refused, and bump again: thousands of requests a second (BUG-001).
    if (j.error!.code === 'unauthenticated' && Date.now() - lastUnauthBump > 10_000) { lastUnauthBump = Date.now(); bump(); }
    throw new ApiError(j.error!.code, j.error!.message);
  }
  if (!READ.test(method) || (method === 'pairingStatus' && j.r === 'paired')) bump();
  return j.r;
}

const overrides: Record<string, (...a: never[]) => Promise<unknown>> = {
  // Google's sign-in happens on Google's own page. Leave this one open; the browser is on its way out.
  connectGoogle: async (mode: 'one_way' | 'two_way', reconnectId?: string) => {
    const r = (await rpc('startGoogleConnect', [mode, reconnectId])) as { url: string };
    window.location.assign(r.url);
    return new Promise(() => {});
  },
} as never;

export const data = new Proxy({}, {
  get: (_t, name: string) => (name === 'then' ? undefined : (overrides[name] ?? ((...args: unknown[]) => rpc(name, args)))),
}) as unknown as Data;

/** Keeps screens fresh: a server push when anyone in the household changes something, and a slow refresh as a safety net. */
export function startLive(): () => void {
  let es: EventSource | null = null; let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(t); t = setTimeout(bump, 200); };
  try { es = new EventSource('/api/v1/stream'); es.addEventListener('change', soon); } catch { /* the slow refresh below still works */ }
  const poll = setInterval(() => { if (document.visibilityState === 'visible') bump(); }, 120_000);
  const vis = () => { if (document.visibilityState === 'visible') soon(); };
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('online', soon);
  return () => { es?.close(); clearInterval(poll); clearTimeout(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', soon); };
}
