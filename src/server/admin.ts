// Things only the person who runs this server may do, from Settings: the Google sign-in client, and (below) software updates.
import { z } from 'zod';
import { ApiError } from '@/lib/types';
import { env } from './env';
import { def, limit, tenant, zStr } from './rpc';
import { deleteSetting, googleConfig, putSetting, getSetting } from './instance';

const REDIRECT_PATH = '/api/v1/sync/oauth/google/callback';
export const googleRedirectUri = () => `${env.baseUrl}${REDIRECT_PATH}`;

/** Asks Google whether it knows this client id and secret, without needing anyone to sign in: a made-up code gets "invalid_grant" from a good client and "invalid_client" from a wrong one. */
async function checkGoogleClient(clientId: string, clientSecret: string): Promise<{ ok: boolean; message: string }> {
  let r: Response;
  try {
    r = await fetch(env.googleTokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15_000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'check', redirect_uri: googleRedirectUri(), client_id: clientId, client_secret: clientSecret }) });
  } catch { return { ok: false, message: 'Could not reach Google to check these. They were saved; try the check again in a moment.' }; }
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (j.error === 'invalid_client') return { ok: false, message: 'Google does not recognise this client ID and secret. Check that you copied both from the same OAuth client.' };
  if (j.error === 'invalid_grant' || j.error === 'invalid_request' || j.error === 'redirect_uri_mismatch') return { ok: true, message: 'Google accepts this client ID and secret.' };
  if (r.status >= 500) return { ok: false, message: 'Google had a problem just now. They were saved; try the check again later.' };
  return { ok: true, message: 'Saved.' };
}

async function setup() {
  const cfg = await googleConfig();
  return {
    source: cfg.source, clientId: cfg.clientId, secretSaved: !!cfg.clientSecret, secretLast4: cfg.clientSecret ? cfg.clientSecret.slice(-4) : '',
    status: cfg.status, redirectUri: googleRedirectUri(), baseUrl: env.baseUrl, https: env.baseUrl.startsWith('https://'),
  };
}

export const admin = {
  getGoogleSetup: def('admin', [], async () => setup()),
  saveGoogleSetup: def('admin', [z.object({ clientId: zStr(200), clientSecret: zStr(200).optional(), status: z.enum(['testing', 'production']).optional() })], async (c, i) => {
    limit(`gsetup:${c.userId}`, 20, 600_000);
    const clientId = i.clientId.trim(); const given = (i.clientSecret ?? '').trim();
    if (!clientId || /\s/.test(clientId)) throw new ApiError('missing', 'Paste the client ID exactly as Google shows it.');
    const before = await googleConfig();
    const secret = given || (before.source === 'settings' ? before.clientSecret : '');
    if (!secret) throw new ApiError('missing', 'Paste the client secret too.');
    if (/\s/.test(secret)) throw new ApiError('invalid', 'The client secret has a space in it. Copy it again without spaces.');
    const warnings: string[] = [];
    if (!/\.apps\.googleusercontent\.com$/.test(clientId)) warnings.push('A Google client ID normally ends with .apps.googleusercontent.com. Check that you copied the client ID and not the project name.');
    const hasConnections = !!(await tenant(c, (t) => t.one('select 1 as x from calendar_connections limit 1')));
    if (before.clientId && before.clientId !== clientId && hasConnections) warnings.push('The client ID changed, so calendars connected with the old one will ask to sign in to Google again.');
    await putSetting('google_client', { value: clientId, secret }, c.userId ?? null);
    if (i.status) await putSetting('google_status', { value: i.status }, c.userId ?? null);
    const check = await checkGoogleClient(clientId, secret);
    return { setup: await setup(), check, warnings };
  }, { write: false }),
  clearGoogleSetup: def('admin', [], async () => {
    await deleteSetting('google_client'); await deleteSetting('google_status');
    return setup();
  }),
  testGoogleSetup: def('admin', [], async () => {
    limit('gcheck', 30, 600_000);
    const cfg = await googleConfig();
    if (cfg.source === 'none') throw new ApiError('not_configured', 'Save a client ID and secret first.');
    return checkGoogleClient(cfg.clientId, cfg.clientSecret);
  }),
};
void getSetting;
