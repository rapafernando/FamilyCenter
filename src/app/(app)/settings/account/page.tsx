'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { useQuery } from '@/lib/data/hooks';
import { Button, Field } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';

export default function Account() {
  const router = useRouter(); const notify = useNotice();
  const { session } = useApp(); const isOwner = session.role === 'owner' || !session.user;
  const acct = useQuery(() => data.getAccount(), []);
  const [pw, setPw] = useState({ current: '', next: '' }); const [pwBusy, setPwBusy] = useState(false);
  const [err, setErr] = useState(''); const [ask, setAsk] = useState(false); const [typed, setTyped] = useState(''); const [busy, setBusy] = useState(false);
  async function exportAll() {
    setErr('');
    try {
      const url = URL.createObjectURL(new Blob([await data.exportAll()], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'family-calendar-export.json'; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      notify({ tone: 'success', title: 'Export downloaded' });
    } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <AdultGate anySignedIn>
      <PageHeader title="Account" back={{ href: '/settings', label: 'Settings' }} />
      <div className="flex max-w-[40rem] flex-col gap-5">
        {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
        {acct.data && !acct.data.verified && acct.data.canEmail && (
          <Banner tone="warning" title="Confirm your email address" action={<Button size="sm" onClick={async () => { try { await data.sendEmailVerification(); notify({ tone: 'success', title: 'Email sent', body: `Check ${acct.data!.email} for the link.` }); } catch (e) { setErr(errMsg(e)); } }}>Send the email</Button>}>Confirming lets us reach you if you ever lose your password.</Banner>
        )}
        <section aria-label="Password and sign-in" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Password and sign-in</h2>
          <form className="flex max-w-[24rem] flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setPwBusy(true); setErr(''); try { await data.changePassword(pw.current, pw.next); setPw({ current: '', next: '' }); notify({ tone: 'success', title: 'Password changed', body: 'Your other devices were signed out.' }); } catch (x) { setErr(errMsg(x)); } setPwBusy(false); }}>
            <Field label="Current password" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <Field label="New password" type="password" autoComplete="new-password" required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="At least 8 characters." />
            <div><Button type="submit" loading={pwBusy}>Change password</Button></div>
          </form>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-base text-muted">Signed in on a phone or computer you no longer use? This signs out everything except this device. Linked wall screens stay linked.</p>
            <div><Button variant="secondary" onClick={async () => { try { await data.signOutEverywhere(); notify({ tone: 'success', title: 'Signed out everywhere else' }); } catch (x) { setErr(errMsg(x)); } }}>Sign out everywhere else</Button></div>
          </div>
        </section>
        {isOwner && (
        <section aria-label="Export" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Take your data with you</h2>
          <p className="text-base text-muted">One file with your events, chores, lists, recipes and settings. Photos and AI keys are not included.</p>
          <div><Button variant="secondary" size="lg" onClick={exportAll}><Download aria-hidden className="h-5 w-5" />Download export</Button></div>
        </section>
        )}
        <section aria-label="Delete" className="flex flex-col gap-3 rounded-lg border-2 border-danger bg-surface p-4">
          <h2 className="font-display text-lg text-ink">{isOwner ? 'Delete everything' : 'Leave this household'}</h2>
          <p className="text-base text-muted">{isOwner ? 'This removes the household, every person, event, chore, photo and connection. It cannot be undone. Download an export first if you might want it back.' : 'This deletes your sign-in. The household and everyone else’s things stay as they are. It cannot be undone.'}</p>
          {!ask ? <div><Button variant="danger" onClick={() => setAsk(true)}>{isOwner ? 'Delete my household' : 'Delete my sign-in'}</Button></div> : (
            <form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await data.deleteAccount(); router.push('/welcome'); } catch (x) { setErr(errMsg(x)); setBusy(false); } }}>
              <Field label="Type DELETE to confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              <div className="flex gap-2"><Button type="submit" variant="danger" loading={busy} disabled={typed !== 'DELETE'}>Delete for good</Button><Button type="button" variant="secondary" onClick={() => { setAsk(false); setTyped(''); }}>Keep it</Button></div>
            </form>
          )}
        </section>
      </div>
    </AdultGate>
  );
}
