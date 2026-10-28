import { z } from 'zod';
import { ApiError } from '@/lib/types';
import { plain } from '../db';
import { env } from '../env';
import { hashPassword, sha256, sign, verify, verifyPassword } from '../crypto';
import { def, limit, startSession, zStr } from '../rpc';
import { sendMail } from '../mailer';
import { clean, sendVerification } from './core';

const strong = (pw: string) => { if (pw.length < 8) throw new ApiError('weak_password', 'Use at least 8 characters for the password.'); };
const stamp = (hash: string | null) => sha256(hash ?? '').slice(0, 16); // ties a reset link to the current password, so it works once

export const account = {
  getAccount: def('user', [], async (c) => {
    const u = await plain((t) => t.one<{ email: string; email_verified_at: string | null }>('select email, email_verified_at from users where id = $1', [c.userId]));
    return { email: u!.email, verified: !!u!.email_verified_at, canEmail: !!env.smtp() };
  }),
  changePassword: def('user', [zStr(200), zStr(200)], async (c, current, next) => {
    limit(`chpw:${c.userId}`, 10, 600_000);
    strong(next);
    const u = await plain((t) => t.one<{ password_hash: string | null }>('select password_hash from users where id = $1', [c.userId]));
    if (!(await verifyPassword(current, u?.password_hash ?? null))) throw new ApiError('invalid_credentials', 'The current password is not right.');
    const hash = await hashPassword(next);
    const v = await plain((t) => t.one<{ session_version: number }>('update users set password_hash = $2, session_version = session_version + 1 where id = $1 returning session_version', [c.userId, hash]));
    startSession(c.jar, c.userId!, c.householdId ?? null, v!.session_version); // other devices are signed out; this one stays in
  }),
  requestPasswordReset: def('public', [zStr(200)], async (c, emailRaw) => {
    const email = clean(emailRaw).toLowerCase();
    limit(`reset:${c.ip}`, 10, 3600_000); limit(`reset:${email}`, 3, 3600_000);
    if (!env.smtp()) throw new ApiError('no_email', 'This server cannot send email. Ask whoever runs it to reset your password from the command line.');
    const u = await plain((t) => t.one<{ id: string; password_hash: string | null }>('select id, password_hash from users where lower(email) = $1 and deletion_requested_at is null', [email]));
    if (u) { // the same answer either way, so nobody can use this to find out who has an account
      const token = sign({ k: 'reset', u: u.id, p: stamp(u.password_hash) }, 3600);
      await sendMail(email, 'Reset your Family Calendar password', `Open this link to choose a new password:\n\n${env.baseUrl}/reset/${token}\n\nThe link works once, for one hour. If you did not ask for this, ignore this message; your password has not changed.`);
    }
  }),
  resetPassword: def('public', [zStr(2000), zStr(200)], async (c, token, next) => {
    limit(`resetuse:${c.ip}`, 20, 3600_000);
    strong(next);
    const t = verify<{ k: string; u: string; p: string }>(token);
    const bad = new ApiError('expired', 'This reset link has expired or was already used. Ask for a new one.');
    if (!t || t.k !== 'reset') throw bad;
    const u = await plain((x) => x.one<{ password_hash: string | null }>('select password_hash from users where id = $1', [t.u]));
    if (!u || stamp(u.password_hash) !== t.p) throw bad;
    const hash = await hashPassword(next);
    await plain((x) => x.exec('update users set password_hash = $2, session_version = session_version + 1 where id = $1', [t.u, hash]));
  }),
  sendEmailVerification: def('user', [], async (c) => {
    limit(`verifysend:${c.userId}`, 3, 3600_000);
    if (!env.smtp()) throw new ApiError('no_email', 'This server cannot send email.');
    await sendVerification(c.userId!, c.email!);
  }),
  verifyEmail: def('public', [zStr(2000)], async (c, token) => {
    limit(`verify:${c.ip}`, 20, 3600_000);
    const t = verify<{ k: string; u: string; e: string }>(token);
    if (!t || t.k !== 'verify') throw new ApiError('expired', 'This confirmation link has expired. Ask for a new one in Settings.');
    const n = await plain((x) => x.exec('update users set email_verified_at = now() where id = $1 and lower(email) = lower($2)', [t.u, t.e]));
    if (!n) throw new ApiError('expired', 'This confirmation link is no longer valid.');
  }),
};
void z;
