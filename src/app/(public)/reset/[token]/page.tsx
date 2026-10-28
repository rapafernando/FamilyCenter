'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import { errMsg } from '@/lib/ctx';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';

export default function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [pw, setPw] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await data.resetPassword(token, pw); setDone(true); } catch (x) { setErr(errMsg(x)); } setBusy(false); }}>
      <h1 className="font-display text-xl text-ink">Choose a new password</h1>
      {err && <Banner tone="danger" title="Could not change the password">{err}</Banner>}
      {done ? (
        <>
          <Banner tone="success" title="Password changed">You were signed out everywhere. Sign in with the new password.</Banner>
          <Link href="/signin" className="min-h-target text-base font-bold text-accent underline">Go to sign in</Link>
        </>
      ) : (
        <>
          <Field label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 8 characters." />
          <Button type="submit" size="lg" loading={busy}>Save new password</Button>
        </>
      )}
    </form>
  );
}
