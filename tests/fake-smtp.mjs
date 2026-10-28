// Catches outgoing email so tests can read it. Run: node tests/fake-smtp.mjs  (port 1025; mail is appended to /tmp/mails.jsonl)
import net from 'node:net';
import { appendFileSync } from 'node:fs';
net.createServer((s) => {
  let data = false, buf = '', mail = { to: [], body: '' };
  const say = (l) => s.write(l + '\r\n'); say('220 fake ready');
  s.on('data', (d) => {
    buf += d.toString();
    for (;;) {
      if (data) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; mail.body = buf.slice(0, i); buf = buf.slice(i + 5); data = false; appendFileSync('/tmp/mails.jsonl', JSON.stringify(mail) + '\n'); mail = { to: [], body: '' }; say('250 queued'); continue; }
      const i = buf.indexOf('\r\n'); if (i < 0) return; const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^(EHLO|HELO)/i.test(line)) say('250 fake'); else if (/^RCPT TO/i.test(line)) { mail.to.push(line.replace(/^RCPT TO:\s*<?|>?$/gi, '')); say('250 ok'); }
      else if (/^DATA/i.test(line)) { data = true; say('354 go'); } else if (/^QUIT/i.test(line)) { say('221 bye'); s.end(); } else say('250 ok');
    }
  });
}).listen(1025, () => console.log('fake smtp on :1025'));
