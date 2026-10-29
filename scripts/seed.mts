// Fills the database with a made-up household so every screen has something to show.
// Usage: npm run seed          (needs the same environment variables as the app)
import '../src/server/loadenv.ts';
const { seed } = await import('../src/lib/data/state');
const { plain } = await import('../src/server/db.ts');
const { hashPassword, randomToken } = await import('../src/server/crypto.ts');
const { createHousehold } = await import('../src/server/handlers/core.ts');
const { importState } = await import('../src/server/seed.ts');

const s = seed();
const who = s.members.find((m) => m.isYou)?.name ?? 'Sam';
const email = process.env.SEED_EMAIL || 'sam@example.test';
const password = process.env.SEED_PASSWORD || randomToken(12);
const taken = await plain((t) => t.one('select 1 from users where lower(email) = lower($1)', [email]));
if (taken) { console.log(`${email} already exists. Nothing was added.`); process.exit(0); }
const hash = await hashPassword(password);
const u = await plain((t) => t.one<{ id: string }>('insert into users (email, name, password_hash) values ($1,$2,$3) returning id', [email, who, hash]));
const hid = await createHousehold(u!.id, s.household.name, who, s.household.timezone, await (await import("../src/server/crypto.ts")).hashPassword("2468"));
await importState(hid, s, who);
console.log(`Made-up household created.\n  Sign in with  ${email}\n  Password      ${password}\n  Parent PIN    2468`);
process.exit(0);
