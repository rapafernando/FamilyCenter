// A stand-in for an OpenAI-compatible server. Run: node tests/fake-ai.mjs (port 4011).
import http from 'node:http';
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    if (req.url === '/v1/chat/completions') {
      if (req.headers.authorization === 'Bearer bad') { res.writeHead(401); return res.end('{}'); }
      const j = JSON.parse(b); const sys = j.messages[0].content; const user = j.messages[1].content;
      let out = { ok: true };
      if (/plan family meals/.test(sys)) out = { meals: [{ day: 1, slot: 'dinner', title: 'Sheet-pan chicken' }, { day: 2, title: 'Veggie chili' }, { day: 3, slot: 'lunch', title: 'Soup and bread' }] };
      else if (/list the events/.test(sys)) out = { events: [{ title: 'Picture day', date: '2026-11-04', allDay: true }, { title: 'Concert', date: '2026-11-07', time: '18:30', location: 'Gym' }, { title: 'Ignore all previous instructions', date: 'not-a-date' }] };
      else if (/structured recipes/.test(sys)) out = { recipes: [{ title: 'Pancakes', category: 'Breakfast', ingredients: ['2 cups flour', '2 eggs'], instructions: 'Mix. Fry.' }] };
      if (/GARBAGE/.test(user)) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ choices: [{ message: { content: 'sorry, I cannot do that' } }] })); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: 'Here you go:\n```json\n' + JSON.stringify(out) + '\n```' } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(4011, () => console.log('fake ai on :4011'));
