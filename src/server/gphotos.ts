// Choosing photos from Google Photos for the screensaver, through Google's photo picker.
// Since March 2025 Google no longer lets apps read a person's albums. The picker is the allowed way: the person picks photos in a
// Google window, the app downloads those picks once and keeps its own copies, and nothing stays linked afterwards.
import { mkdir, writeFile } from 'node:fs/promises';
import { ApiError } from '@/lib/types';
import { withTenant } from './db';
import { env } from './env';
import { decrypt, encrypt, randomToken, sha256, sign, verify } from './crypto';
import { def, tenant, zId, type Ctx } from './rpc';
import { googleConfig } from './instance';
import { tokenRequest } from './google';
import { MAX_ALBUM_PHOTOS, MAX_PHOTO_BYTES, imageSize, photoPath, sniffImage } from './handlers/media';

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const COOKIE = 'fc_oauth_photos';
const MAX_PICKS = 200;
const REDIRECT = () => `${env.baseUrl}/api/v1/sync/oauth/google/callback`;

/* ------------------------------------------------------------------ sign-in (reuses the calendar return address, told apart by its own cookie) */
export async function startPhotosImport(c: Ctx & { hid: string }, albumId: string) {
  const cfg = await googleConfig();
  if (cfg.source === 'none') throw new ApiError('not_configured', 'Google is not set up on this server yet. Add the client ID and secret under Google connection first.');
  const ok = await tenant(c, (t) => t.one('select 1 from photo_albums where id = $1', [albumId]));
  if (!ok) throw new ApiError('not_found', 'That album was not found.');
  const state = randomToken(24); const verifier = randomToken(48);
  const { createHash } = await import('node:crypto');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  c.jar.delete('fc_oauth'); // a half-finished calendar sign-in must not be mistaken for this one
  c.jar.set(COOKIE, sign({ s: state, v: verifier, h: c.hid, a: albumId }, 600), { maxAge: 600 });
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: REDIRECT(), response_type: 'code', scope: SCOPE, access_type: 'online',
    include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return { url: `${env.googleAuthUrl}?${q}` };
}

export const hasPhotosCookie = (jar: { get(n: string): string | undefined }) => !!jar.get(COOKIE);

export async function finishPhotosImport(c: Ctx, params: URLSearchParams): Promise<string> {
  const back = (k: string) => `/settings/photos?google=${k}`;
  const st = verify<{ s: string; v: string; h: string; a: string }>(c.jar.get(COOKIE));
  c.jar.delete(COOKIE);
  if (!st || params.get('state') !== st.s || !c.householdId || c.householdId !== st.h) return back('expired');
  if (params.get('error')) return back(params.get('error') === 'access_denied' ? 'denied' : 'failed');
  const code = params.get('code'); if (!code) return back('failed');
  let token = '';
  try {
    const j = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: st.v, redirect_uri: REDIRECT() });
    if (!(j.scope ?? '').split(' ').includes(SCOPE) || !j.access_token) return back('scope');
    token = j.access_token;
    const r = await picker(token, '/v1/sessions', { method: 'POST', body: JSON.stringify({ pickingConfig: { maxItemCount: String(MAX_PICKS) } }) });
    const s = r.json as { id?: string; pickerUri?: string; pollingConfig?: { pollInterval?: string; timeoutIn?: string } };
    if (!s.id || !s.pickerUri) return back('failed');
    const secs = (v: string | undefined, d: number) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) && n > 0 ? n : d; };
    const enc = encrypt(token);
    const id = await withTenant(st.h, async (t) => (await t.one<{ id: string }>(
      `insert into photo_imports (household_id, album_id, created_by, session_id, picker_uri, token_encrypted, token_key_id, poll_after, timeout_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' seconds')::interval, now() + ($9 || ' seconds')::interval) returning id`,
      [st.h, st.a, c.userId ?? null, s.id, s.pickerUri, enc.data, enc.keyId, String(Math.max(2, secs(s.pollingConfig?.pollInterval, 3))), String(Math.min(secs(s.pollingConfig?.timeoutIn, 1800), 3600))]))!.id);
    return `/settings/photos?import=${id}`;
  } catch (e) {
    console.error('photos sign-in failed', e instanceof Error ? e.message : e);
    if (token) void revoke(token);
    return back('failed');
  }
}

/* ------------------------------------------------------------------ talking to Google's picker */
async function picker(token: string, path: string, init: { method?: string; body?: string } = {}) {
  let r: Response;
  try {
    r = await fetch(`${env.googlePickerBase}${path}`, { method: init.method ?? 'GET', body: init.body, signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  } catch { throw new PickerError('offline', 'Could not reach Google Photos.'); }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new PickerError(r.status === 404 || r.status === 410 ? 'gone' : r.status === 401 || r.status === 403 ? 'auth' : 'google', `Google Photos answered ${r.status}.`);
  return { json };
}
class PickerError extends Error { constructor(public kind: 'offline' | 'gone' | 'auth' | 'google', m: string) { super(m); } }
async function revoke(token: string) { try { await fetch(env.googleRevokeUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10_000) }); } catch { /* best effort */ } }

type ImportRow = { id: string; album_id: string; created_by: string | null; session_id: string; picker_uri: string; token_encrypted: Buffer | null; token_key_id: number | null; status: string; picked: number; added: number; skipped: number; error: string | null; poll_after: string; timeout_at: string; updated_at: string };
const COLS = 'id, album_id, created_by, session_id, picker_uri, token_encrypted, token_key_id, status, picked, added, skipped, error, poll_after, timeout_at, updated_at';
const shape = (r: ImportRow) => ({ id: r.id, albumId: r.album_id, status: r.status as 'waiting' | 'importing' | 'done' | 'failed' | 'expired' | 'cancelled', pickerUri: r.status === 'waiting' ? `${r.picker_uri.replace(/\/$/, '')}/autoclose` : '', picked: r.picked, added: r.added, skipped: r.skipped, error: r.error ?? '' });

async function finish(hid: string, id: string, status: 'done' | 'failed' | 'expired' | 'cancelled', error: string | null, token?: string | null, session?: string) {
  await withTenant(hid, (t) => t.exec("update photo_imports set status = $2, error = $3, token_encrypted = null, token_key_id = null, updated_at = now() where id = $1 and status in ('waiting','importing')", [id, status, error]));
  if (token) { if (session) await picker(token, `/v1/sessions/${session}`, { method: 'DELETE' }).catch(() => {}); await revoke(token); }
}
const tokenOf = (r: ImportRow) => (r.token_encrypted && r.token_key_id !== null ? decrypt(r.token_encrypted, r.token_key_id) : null);

/* ------------------------------------------------------------------ the import itself (runs after the person presses Done in Google) */
async function runImport(hid: string, id: string) {
  const row = await withTenant(hid, (t) => t.one<ImportRow>(`select ${COLS} from photo_imports where id = $1`, [id]));
  const token = row && tokenOf(row);
  if (!row || !token) return;
  let added = 0; let skipped = 0; let picked = 0;
  const save = () => withTenant(hid, (t) => t.exec('update photo_imports set picked = $2, added = $3, skipped = $4, updated_at = now() where id = $1', [id, picked, added, skipped]));
  try {
    type Item = { id: string; type?: string; mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string }; baseUrl?: string; mimeType?: string };
    const items: Item[] = []; let page = '';
    do {
      const r = (await picker(token, `/v1/mediaItems?sessionId=${encodeURIComponent(row.session_id)}&pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`)).json as { mediaItems?: Item[]; nextPageToken?: string };
      items.push(...(r.mediaItems ?? [])); page = r.nextPageToken ?? '';
    } while (page && items.length < MAX_PICKS);
    picked = Math.min(items.length, MAX_PICKS); await save();
    await mkdir(`${env.photoDir}/${hid}`, { recursive: true });
    for (const it of items.slice(0, MAX_PICKS)) {
      const mime = it.mediaFile?.mimeType ?? it.mimeType ?? ''; const base = it.mediaFile?.baseUrl ?? it.baseUrl;
      if (!base || (it.type && it.type !== 'PHOTO') || !mime.startsWith('image/')) { skipped++; await save(); continue; }
      try {
        const res = await fetch(`${base}=w2048-h2048`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45_000) });
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_PHOTO_BYTES) throw new Error('too big');
        const kind = sniffImage(buf); if (!kind) throw new Error('not a picture');
        const size = imageSize(buf) ?? { width: 2048, height: 1536 };
        const key = `${crypto.randomUUID()}.${kind.ext}`;
        const stored = await withTenant(hid, async (t) => {
          const n = (await t.one<{ n: number }>('select count(*)::int as n from photos where household_id = $1 and deleted_at is null', [hid]))!.n;
          if (n >= MAX_ALBUM_PHOTOS) throw new Error('limit');
          return t.one('insert into photos (household_id, album_id, storage_key, mime, bytes, width, height, caption, sha256, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id',
            [hid, row.album_id, key, kind.mime, buf.length, size.width, size.height, null, sha256(buf.toString('base64')), row.created_by]);
        });
        if (stored) { await writeFile(photoPath(hid, key), buf, { mode: 0o600 }); added++; } else skipped++;
      } catch (e) { skipped++; if (e instanceof Error && e.message === 'limit') break; }
      await save();
    }
    await save();
    await finish(hid, id, 'done', null, token, row.session_id);
  } catch (e) {
    const msg = e instanceof PickerError && e.kind === 'auth' ? 'Google ended this sign-in before the photos were copied. Start again.' : 'The photos could not be copied from Google Photos. Try again.';
    console.error('photos import failed', e instanceof Error ? e.message : e);
    await save().catch(() => {});
    await finish(hid, id, 'failed', msg, token, row.session_id);
  }
}

/* ------------------------------------------------------------------ RPCs */
export const photoImports = {
  startPhotosImport: def('settings', [zId], async (c, albumId) => startPhotosImport(c, albumId)),
  /** Asked every few seconds by the Photos screen. No PIN is needed here: the import was already approved with it, and the id is private to the household. */
  getPhotosImport: def('adult', [zId], async (c, id) => {
    let r = await tenant(c, (t) => t.one<ImportRow>(`select ${COLS} from photo_imports where id = $1`, [id]));
    if (!r) throw new ApiError('not_found', 'That import was not found.');
    const token = tokenOf(r);
    if (r.status === 'importing' && Date.now() - Date.parse(r.updated_at) > 10 * 60_000) { await finish(c.hid, id, 'failed', 'The import stopped part way. Start again; photos already copied are kept.', token, r.session_id); }
    else if (r.status === 'waiting' && token) {
      if (Date.now() > Date.parse(r.timeout_at)) await finish(c.hid, id, 'expired', 'Google Photos closed the window before any photos were chosen. Start again.', token, r.session_id);
      else if (Date.now() >= Date.parse(r.poll_after)) {
        await tenant(c, (t) => t.exec("update photo_imports set poll_after = now() + interval '3 seconds' where id = $1", [id]));
        try {
          const s = (await picker(token, `/v1/sessions/${r.session_id}`)).json as { mediaItemsSet?: boolean };
          if (s.mediaItemsSet) {
            const won = await tenant(c, (t) => t.exec("update photo_imports set status = 'importing', updated_at = now() where id = $1 and status = 'waiting'", [id]));
            if (won) void runImport(c.hid, id);
          }
        } catch (e) {
          if (e instanceof PickerError && (e.kind === 'gone' || e.kind === 'auth')) await finish(c.hid, id, 'expired', 'Google Photos closed this session. Start again.', token, r.session_id);
        }
      }
    }
    r = (await tenant(c, (t) => t.one<ImportRow>(`select ${COLS} from photo_imports where id = $1`, [id])))!;
    return shape(r);
  }),
  cancelPhotosImport: def('adult', [zId], async (c, id) => {
    const r = await tenant(c, (t) => t.one<ImportRow>(`select ${COLS} from photo_imports where id = $1`, [id]));
    if (!r) throw new ApiError('not_found', 'That import was not found.');
    if (r.status === 'waiting') await finish(c.hid, id, 'cancelled', null, tokenOf(r), r.session_id);
  }, { write: true }),
};
