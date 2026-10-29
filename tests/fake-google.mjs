// A stand-in for Google's sign-in and Calendar API, so sync can be tested without a Google account.
// Run: node tests/fake-google.mjs   (listens on :4010; point the GOOGLE_* URLs in .env.local at it)
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';

const S = { codes: new Map(), revoked: new Set(), down: false, ver: 1, events: new Map(), log: [], expireSync: false, lastToken: null };
const now = () => new Date().toISOString();
const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const put = (e) => { S.ver++; S.events.set(e.id, { ...e, _v: S.ver, etag: `"e${S.ver}"`, updated: now() }); return S.events.get(e.id); };
put({ id: 'ev-dentist', summary: 'Dentist (from Google)', start: { dateTime: new Date(Date.now() + 2 * 86400e3).toISOString() }, end: { dateTime: new Date(Date.now() + 2 * 86400e3 + 3600e3).toISOString() }, location: 'Main St', status: 'confirmed' });
put({ id: 'ev-allday', summary: 'School holiday', start: { date: day(5) }, end: { date: day(6) }, status: 'confirmed' });
put({ id: 'ev-weekly', summary: 'Weekly piano', start: { dateTime: '2026-10-05T16:00:00-04:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-10-05T16:45:00-04:00', timeZone: 'America/New_York' }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=America/New_York:20261026T160000'], status: 'confirmed' });
put({ id: 'ev-weekly_20261102T210000Z', recurringEventId: 'ev-weekly', originalStartTime: { dateTime: '2026-11-02T16:00:00-05:00' }, summary: 'Piano (moved)', start: { dateTime: '2026-11-02T17:00:00-05:00' }, end: { dateTime: '2026-11-02T17:45:00-05:00' }, status: 'confirmed' });

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const body = await readBody(req);
  const p = u.pathname;
  if (p === '/_ctl') { const c = JSON.parse(body || '{}'); Object.assign(S, c.set ?? {}); if (c.revokeAll) S.revoked.add('*'); if (c.unrevoke) S.revoked.clear();
    if (c.put) put(c.put); if (c.cancel) { const e = S.events.get(c.cancel); if (e) put({ ...e, status: 'cancelled' }); } return json(res, 200, { ok: true, ver: S.ver, log: S.log.slice(-20), lastToken: S.lastToken }); }
  S.log.push(`${req.method} ${p}${u.search.slice(0, 80)}`);
  if (p === '/auth') {
    const redirect = u.searchParams.get('redirect_uri'); const code = randomUUID();
    S.codes.set(code, { challenge: u.searchParams.get('code_challenge'), scope: u.searchParams.get('scope') });
    const to = new URL(redirect); to.searchParams.set('code', code); to.searchParams.set('state', u.searchParams.get('state'));
    if (u.searchParams.get('scope')?.includes('DENY')) { const d = new URL(redirect); d.searchParams.set('error', 'access_denied'); d.searchParams.set('state', u.searchParams.get('state')); res.writeHead(302, { location: d.toString() }); return res.end(); }
    res.writeHead(302, { location: to.toString() }); return res.end();
  }
  if (p === '/token') {
    if (S.down) return json(res, 503, { error: 'backend_error' });
    const f = new URLSearchParams(body);
    // When a test sets the expected client (_ctl set.client), a wrong client id or secret is refused as Google does.
    if (S.client && (f.get('client_id') !== S.client.id || f.get('client_secret') !== S.client.secret)) return json(res, 401, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') {
      const c = S.codes.get(f.get('code')); if (!c) return json(res, 400, { error: 'invalid_grant' });
      const ok = createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') === c.challenge; if (!ok) return json(res, 400, { error: 'invalid_grant' });
      S.codes.delete(f.get('code')); S.revoked.delete('*');
      return json(res, 200, { access_token: 'at-' + randomUUID(), refresh_token: 'rt-1', expires_in: 3600, scope: c.scope, token_type: 'Bearer' });
    }
    if (f.get('grant_type') === 'refresh_token') {
      if (S.revoked.has('*') || S.revoked.has(f.get('refresh_token'))) return json(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      S.lastToken = f.get('refresh_token');
      return json(res, 200, { access_token: 'at-' + randomUUID(), expires_in: 3600, scope: 'x', token_type: 'Bearer', ...(S.rotate ? { refresh_token: 'rt-rotated' } : {}) });
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  if (p === '/revoke') { S.revoked.add(new URLSearchParams(body).get('token')); return json(res, 200, {}); }
  if (!req.headers.authorization?.startsWith('Bearer at-')) return json(res, 401, { error: { code: 401 } });
  if (S.down) return json(res, 503, { error: { code: 503 } });
  const base = '/calendar/v3';
  if (p === base + '/users/me/calendarList') return json(res, 200, { items: [{ id: 'family@gmail.com', summary: 'Family', primary: true, backgroundColor: '#9fc6e7', accessRole: 'owner' }, { id: 'holidays@group.v.calendar.google.com', summary: 'US holidays', backgroundColor: '#16a765', accessRole: 'reader' }] });
  const m = p.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
  if (m) {
    const cal = decodeURIComponent(m[1]); const id = m[2] && decodeURIComponent(m[2]);
    if (req.method === 'GET' && !id) {
      const st = u.searchParams.get('syncToken');
      if (st && (S.expireSync || st === 'old')) { S.expireSync = false; return json(res, 410, { error: { code: 410 } }); }
      const since = st ? Number(st.slice(1)) : 0;
      if (cal !== 'family@gmail.com') return json(res, 200, { items: [], nextSyncToken: 'v' + S.ver });
      const items = [...S.events.values()].filter((e) => e._v > since && (st || e.status !== 'cancelled')).map(({ _v, updated, ...e }) => ({ ...e, updated }));
      return json(res, 200, { items, nextSyncToken: 'v' + S.ver });
    }
    if (req.method === 'POST') { const b = JSON.parse(body); const e = put({ id: 'new-' + randomUUID().slice(0, 8), status: 'confirmed', ...b }); return json(res, 200, { id: e.id, etag: e.etag }); }
    if (req.method === 'PATCH') { const cur = S.events.get(id); if (!cur) return json(res, 404, {}); if (req.headers['if-match'] && req.headers['if-match'] !== cur.etag) return json(res, 412, {}); const e = put({ ...cur, ...JSON.parse(body) }); return json(res, 200, { id: e.id, etag: e.etag }); }
    if (req.method === 'DELETE') { const cur = S.events.get(id); if (!cur) return json(res, 410, {}); put({ ...cur, status: 'cancelled' }); res.writeHead(204); return res.end(); }
  }
  json(res, 404, { error: { code: 404 } });
}).listen(4010, () => console.log('fake google on :4010'));
