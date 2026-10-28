'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import { errMsg } from '@/lib/ctx';
import { useQuery } from '@/lib/data/hooks';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';

const ROLE = { adult: 'an adult', viewer: 'someone who can look but not change things' } as const;

export default function Join({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const inv = useQuery(() => data.previewInvitation(token), [token]);
  const sess = useQuery(() => data.getSession(), []);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (inv.data && !f.email) setF((v) => ({ ...v, email: inv.data!.email })); }, [inv.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); router.push('/calendar'); } catch (x) { setErr(errMsg(x)); setBusy(false); } };

  if (inv.loading) return <p role="status" className="text-muted">Checking your invitation…</p>;
  if (inv.error || !inv.data) return (
    <>
      <h1 className="font-display text-xl text-ink">This invitation does not work</h1>
      <Banner tone="warning" title="The link has expired or was already used">Ask the person who invited you to send a new one.</Banner>
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">Go to the start page</Link>
    </>
  );
  const signedIn = !!sess.data?.user;
  return (
    <>
      <header>
        <h1 className="font-display text-xl text-ink">Join {inv.data.householdName}</h1>
        <p className="mt-1 text-base text-muted">You have been invited as {ROLE[inv.data.role]}.</p>
      </header>
      {err && <Banner tone="danger" title="Could not join">{err}</Banner>}
      {signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink">You are signed in as {sess.data!.user!.name}.</p>
          <Button size="lg" loading={busy} onClick={() => run(() => data.acceptInvitation(token))}>Join {inv.data.householdName}</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { if (mode === 'new') await data.signUp({ name: f.name, email: f.email, password: f.password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, inviteToken: token }); else { await data.signIn(f.email, f.password); await data.acceptInvitation(token); } }); }}>
          {mode === 'new' && <Field label="Your name" autoComplete="name" required value={f.name} onChange={set('name')} />}
          <Field label="Email" type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
          <Field label="Password" type="password" autoComplete={mode === 'new' ? 'new-password' : 'current-password'} required value={f.password} onChange={set('password')} hint={mode === 'new' ? 'At least 8 characters.' : undefined} />
          <Button type="submit" size="lg" loading={busy}>{mode === 'new' ? 'Create account and join' : 'Sign in and join'}</Button>
          <button type="button" className="min-h-target text-base font-bold text-accent underline" onClick={() => { setMode(mode === 'new' ? 'existing' : 'new'); setErr(''); }}>{mode === 'new' ? 'I already have an account' : 'I need to create an account'}</button>
        </form>
      )}
    </>
  );
}
