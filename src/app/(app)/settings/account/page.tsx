'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, Field } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';

export default function Account() {
  const router = useRouter(); const notify = useNotice();
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
    <AdultGate>
      <PageHeader title="Account" back={{ href: '/settings', label: 'Settings' }} />
      <div className="flex max-w-[40rem] flex-col gap-5">
        {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
        <section aria-label="Export" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Take your data with you</h2>
          <p className="text-base text-muted">One file with your events, chores, lists, recipes and settings. Photos and AI keys are not included.</p>
          <div><Button variant="secondary" size="lg" onClick={exportAll}><Download aria-hidden className="h-5 w-5" />Download export</Button></div>
        </section>
        <section aria-label="Delete" className="flex flex-col gap-3 rounded-lg border-2 border-danger bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Delete everything</h2>
          <p className="text-base text-muted">This removes the household, every person, event, chore, photo and connection. It cannot be undone. Download an export first if you might want it back.</p>
          {!ask ? <div><Button variant="danger" onClick={() => setAsk(true)}>Delete my household</Button></div> : (
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
