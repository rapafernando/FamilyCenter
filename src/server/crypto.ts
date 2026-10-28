import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/* ---- encryption at rest: AES-256-GCM with a key ring so keys can rotate (APP_ENCRYPTION_KEYS="2:base64,1:base64", newest first) ---- */
function ring(): Map<number, Buffer> {
  const m = new Map<number, Buffer>();
  for (const part of env.encryptionKeys.split(',')) {
    const [id, b64] = part.trim().split(':');
    const key = Buffer.from(b64 ?? '', 'base64');
    if (!/^\d+$/.test(id ?? '') || key.length !== 32) throw new Error('APP_ENCRYPTION_KEYS must look like "1:<base64 of 32 bytes>". Make one with: openssl rand -base64 32');
    m.set(Number(id), key);
  }
  return m;
}
export function encrypt(plain: string): { data: Buffer; keyId: number } {
  const keys = ring(); const [keyId, key] = [...keys.entries()][0];
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { data: Buffer.concat([iv, c.getAuthTag(), body]), keyId };
}
export function decrypt(data: Buffer, keyId: number): string {
  const key = ring().get(keyId); if (!key) throw new Error(`No encryption key with id ${keyId} is configured.`);
  const d = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12)); d.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([d.update(data.subarray(28)), d.final()]).toString('utf8');
}

/* ---- passwords: scrypt, per-user salt ---- */
const scrypt = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => scryptCb(pw.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPassword(pw: string) { const salt = randomBytes(16); return `scrypt$${salt.toString('base64')}$${(await scrypt(pw, salt)).toString('base64')}`; }
export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) { await scrypt(pw, Buffer.alloc(16)); return false; } // same cost whether or not the account exists
  const [kind, salt, hash] = stored.split('$'); if (kind !== 'scrypt') return false;
  const a = await scrypt(pw, Buffer.from(salt, 'base64')); const b = Buffer.from(hash, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---- signed values (session cookie, unlock cookie, ad hand-off token) ---- */
const mac = (s: string) => createHmac('sha256', env.authSecret).update(s).digest('base64url');
export function sign(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${mac(body)}`;
}
export function verify<T = Record<string, unknown>>(token: string | undefined | null): (T & { exp: number }) | null {
  if (!token) return null; const [body, sig] = token.split('.'); if (!body || !sig) return null;
  const want = mac(body); if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
}
