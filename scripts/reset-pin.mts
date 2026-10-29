// For a forgotten parent PIN: sets a new one for every household that this account owns.
// Usage: docker compose exec web npm run reset-pin -- you@example.com      (prints the new PIN once)
import { randomInt } from 'node:crypto';
import '../src/server/loadenv.ts';
const { plain } = await import('../src/server/db.ts');
const { hashPassword } = await import('../src/server/crypto.ts');

const email = process.argv[2];
if (!email) { console.error('Usage: npm run reset-pin -- you@example.com   (the email of a household owner)'); process.exit(1); }
const pin = process.env.NEW_PIN || String(randomInt(0, 10000)).padStart(4, '0');
if (!/^\d{4}$/.test(pin)) { console.error('The PIN must be exactly 4 digits.'); process.exit(1); }
const hash = await hashPassword(pin);
const n = await plain((t) => t.exec(
  `update households set parent_pin_hash = $2
    where id in (select m.household_id from household_members m join users u on u.id = m.user_id where lower(u.email) = lower($1) and m.role = 'owner')`, [email, hash]), 'worker');
if (!n) { console.error('That email is not the owner of a household.'); process.exit(1); }
console.log(`New parent PIN: ${pin}\nIt works right away on every phone and screen. Change it in Settings, Display and ads, once you are in.`);
process.exit(0);
