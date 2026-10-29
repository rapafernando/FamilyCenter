// A stand-in for Google's sign-in and Calendar API, so sync can be tested without a Google account.
// Run: node tests/fake-google.mjs   (listens on :4010; point the GOOGLE_* URLs in .env.local at it)
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const S = { codes: new Map(), revoked: new Set(), down: false, ver: 1, events: new Map(), log: [], expireSync: false, lastToken: null, denyNext: false, picker: { sessions: new Map(), done: false, gone: false, pick: ['p1', 'p2', 'p3', 'vid', 'bad'] } };
const now = () => new Date().toISOString();
const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
const put = (e) => { S.ver++; S.events.set(e.id, { ...e, _v: S.ver, etag: `"e${S.ver}"`, updated: now() }); return S.events.get(e.id); };
put({ id: 'ev-dentist', summary: 'Dentist (from Google)', start: { dateTime: new Date(Date.now() + 2 * 86400e3).toISOString() }, end: { dateTime: new Date(Date.now() + 2 * 86400e3 + 3600e3).toISOString() }, location: 'Main St', status: 'confirmed' });
put({ id: 'ev-allday', summary: 'School holiday', start: { date: day(5) }, end: { date: day(6) }, status: 'confirmed' });
put({ id: 'ev-weekly', summary: 'Weekly piano', start: { dateTime: '2026-10-05T16:00:00-04:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-10-05T16:45:00-04:00', timeZone: 'America/New_York' }, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=America/New_York:20261026T160000'], status: 'confirmed' });
put({ id: 'ev-weekly_20261102T210000Z', recurringEventId: 'ev-weekly', originalStartTime: { dateTime: '2026-11-02T16:00:00-05:00' }, summary: 'Piano (moved)', start: { dateTime: '2026-11-02T17:00:00-05:00' }, end: { dateTime: '2026-11-02T17:45:00-05:00' }, status: 'confirmed' });


// Tiny valid PNGs, one colour each, so every "photo" has different bytes (the app skips copies of a picture it already has).
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w, h, [r, g, b]) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
};
const PICKS = { p1: [200, 60, 60], p2: [60, 160, 90], p3: [60, 90, 200] };

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const body = await readBody(req);
  const p = u.pathname;
  if (p === '/_ctl') { const c = JSON.parse(body || '{}'); Object.assign(S, c.set ?? {}); if (c.picker) Object.assign(S.picker, c.picker); if (c.pickerReset) { S.picker.sessions.clear(); S.picker.done = false; S.picker.gone = false; S.picker.pick = ['p1', 'p2', 'p3', 'vid', 'bad']; } if (c.revokeAll) S.revoked.add('*'); if (c.unrevoke) S.revoked.clear();
    if (c.put) put(c.put); if (c.cancel) { const e = S.events.get(c.cancel); if (e) put({ ...e, status: 'cancelled' }); } return json(res, 200, { ok: true, ver: S.ver, log: S.log.slice(-40), lastToken: S.lastToken, sessions: [...S.picker.sessions.keys()] }); }
  S.log.push(`${req.method} ${p}${u.search.slice(0, 80)}`);
  if (p === '/auth') {
    const redirect = u.searchParams.get('redirect_uri'); const code = randomUUID();
    S.codes.set(code, { challenge: u.searchParams.get('code_challenge'), scope: u.searchParams.get('scope') });
    const to = new URL(redirect); to.searchParams.set('code', code); to.searchParams.set('state', u.searchParams.get('state'));
    if (S.denyNext || u.searchParams.get('scope')?.includes('DENY')) { S.denyNext = false; const d = new URL(redirect); d.searchParams.set('error', 'access_denied'); d.searchParams.set('state', u.searchParams.get('state')); res.writeHead(302, { location: d.toString() }); return res.end(); }
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
  // Google's photo picker: make a session, the person picks in Google's own window (the test flips `picker.done`), then the app lists and downloads the picks.
  if (p.startsWith('/picker/')) {
    const q = p.slice('/picker'.length); const PS = S.picker;
    if (q.startsWith('/media/')) {
      const key = decodeURIComponent(q.slice('/media/'.length)).split('=')[0];
      if (PICKS[key]) { const b = png(40, 30, PICKS[key]); res.writeHead(200, { 'content-type': 'image/png' }); return res.end(b); }
      res.writeHead(200, { 'content-type': 'image/png' }); return res.end('this is not a picture');
    }
    if (q === '/v1/sessions' && req.method === 'POST') {
      const id = 'ps-' + randomUUID().slice(0, 8); PS.sessions.set(id, { id, items: [...PS.pick] });
      return json(res, 200, { id, pickerUri: `http://localhost:4010/picker-ui/${id}`, pollingConfig: { pollInterval: '3s', timeoutIn: '1800s' }, mediaItemsSet: false });
    }
    const sm = q.match(/^\/v1\/sessions\/([^/]+)$/);
    if (sm) {
      const sess = PS.sessions.get(sm[1]);
      if (req.method === 'DELETE') { PS.sessions.delete(sm[1]); return json(res, 200, {}); }
      if (!sess || PS.gone) return json(res, 404, { error: { code: 404 } });
      return json(res, 200, { id: sess.id, mediaItemsSet: PS.done, pollingConfig: { pollInterval: '3s', timeoutIn: '1800s' } });
    }
    if (q === '/v1/mediaItems' && req.method === 'GET') {
      const sess = PS.sessions.get(u.searchParams.get('sessionId')); if (!sess || !PS.done) return json(res, 400, { error: { code: 400 } });
      return json(res, 200, { mediaItems: sess.items.map((k) => k === 'vid'
        ? { id: k, type: 'VIDEO', mediaFile: { baseUrl: `http://localhost:4010/picker/media/${k}`, mimeType: 'video/mp4', filename: 'clip.mp4' } }
        : { id: k, type: 'PHOTO', mediaFile: { baseUrl: `http://localhost:4010/picker/media/${k}`, mimeType: 'image/png', filename: k + '.png' } }) });
    }
    return json(res, 404, { error: { code: 404 } });
  }
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
