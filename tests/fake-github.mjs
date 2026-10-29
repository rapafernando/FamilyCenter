// A stand-in for the part of GitHub's API the update check uses, so it can be tested without the internet.
// Run: node tests/fake-github.mjs   (listens on :4012; set UPDATE_API_BASE=http://localhost:4012 in .env.local)
import http from 'node:http';

const S = {
  latest: '2222222222222222222222222222222222222222', message: 'Add the family photo wall', date: '2026-10-27T18:30:00Z',
  commitsStatus: 200,        // set to 403, 404 or 500 to simulate GitHub trouble
  compare: 'ahead',          // ahead | identical | behind | diverged | unknown (404)
  changes: ['Add the family photo wall', 'Fix the chore reminder time', 'Faster calendar loading'],
  log: [],
};
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/_ctl') { Object.assign(S, JSON.parse(b || '{}')); return json(res, 200, { ok: true, log: S.log.slice(-10) }); }
    S.log.push(`${req.method} ${p}`);
    if (/\/commits\/[^/]+$/.test(p)) {
      if (S.commitsStatus !== 200) return json(res, S.commitsStatus, { message: 'nope' });
      return json(res, 200, { sha: S.latest, commit: { message: S.message + '\n\nlonger text', committer: { date: S.date } } });
    }
    if (/\/compare\//.test(p)) {
      if (S.compare === 'unknown') return json(res, 404, { message: 'No common ancestor' });
      // GitHub lists commits oldest first
      return json(res, 200, { status: S.compare, ahead_by: S.changes.length, commits: [...S.changes].reverse().map((m) => ({ commit: { message: m + '\n\nbody' } })) });
    }
    json(res, 404, { message: 'Not Found' });
  });
}).listen(4012, () => console.log('fake github on :4012'));
