// For when email is not set up: sets a new password for an account and signs it out everywhere.
// Usage: npm run reset-password -- you@example.com      (prints the new password once)
import '../src/server/loadenv.ts';
const { plain } = await import('../src/server/db.ts');
const { hashPassword, randomToken } = await import('../src/server/crypto.ts');

const email = process.argv[2];
if (!email) { console.error('Usage: npm run reset-password -- you@example.com'); process.exit(1); }
const pw = process.env.NEW_PASSWORD || randomToken(12);
const hash = await hashPassword(pw);
const n = await plain((t) => t.exec('update users set password_hash = $2, session_version = session_version + 1 where lower(email) = lower($1)', [email, hash]));
if (!n) { console.error('No account has that email.'); process.exit(1); }
console.log(`New password for ${email}: ${pw}\nEveryone signed in with that account has been signed out.`);
process.exit(0);
