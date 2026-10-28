import nodemailer from 'nodemailer';
import { env } from './env';

/** Sends one plain-text email when SMTP is configured. Without SMTP it does nothing; the app shows links instead. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const s = env.smtp(); if (!s) return false;
  try {
    const tr = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: s.user ? { user: s.user, pass: s.pass } : undefined });
    await tr.sendMail({ from: s.from, to, subject, text });
    return true;
  } catch (e) { console.error('email failed', (e as Error).message); return false; }
}
