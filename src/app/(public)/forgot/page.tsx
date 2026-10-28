'use client';
import { useState } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import { errMsg } from '@/lib/ctx';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';

export default function Forgot() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await data.requestPasswordReset(email); setSent(true); } catch (x) { setErr(errMsg(x)); } setBusy(false); }}>
      <Link href="/signin" className="min-h-target text-base font-bold text-accent underline">‹ Back to sign in</Link>
      <h1 className="font-display text-xl text-ink">Reset your password</h1>
      {err && <Banner tone="danger" title="Could not send the email">{err}</Banner>}
      {sent ? <Banner tone="success" title="Check your email">If an account uses {email}, a link to choose a new password is on its way. It works once, for an hour.</Banner> : (
        <>
          <p className="text-base text-muted">Enter the email you signed up with. We will send a link to choose a new password.</p>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" loading={busy}>Send the link</Button>
        </>
      )}
    </form>
  );
}
