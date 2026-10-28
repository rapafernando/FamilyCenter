'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data/fake';
import { errMsg } from '@/lib/ctx';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await data.signIn(email, pw); router.push('/calendar'); } catch (x) { setErr(errMsg(x)); setBusy(false); } }}>
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">‹ Back</Link>
      <h1 className="font-display text-xl text-ink">Sign in</h1>
      {err && <Banner tone="danger" title="Could not sign in">{err}</Banner>}
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label="Password" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
      <Button type="submit" size="lg" loading={busy}>Sign in</Button>
      <p className="text-base text-muted">New here? <Link href="/signup" className="font-bold text-accent underline">Create a household</Link></p>
    </form>
  );
}
