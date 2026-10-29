'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';

export default function LinkScreen() {
  const router = useRouter(); const notify = useNotice();
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <SettingsGate>
      <PageHeader title="Link a screen" back={{ href: '/settings/devices', label: 'Screens' }} />
      <form className="flex max-w-[28rem] flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const d = await data.claimPairing(code, name); notify({ tone: 'success', title: `${d.nickname} is linked` }); router.push('/settings/devices'); } catch (x) { setErr(errMsg(x)); setBusy(false); } }}>
        <p className="text-base text-muted">On the screen you want to link, open this site and choose “Link this screen”. Type the 6 characters it shows.</p>
        {err && <Banner tone="danger" title="Could not link it">{err}</Banner>}
        <Field label="Code on the screen" required value={code} maxLength={7} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="Letters and numbers only. There is no 0, O, 1 or I." className="font-display tracking-widest" />
        <Field label="Name for this screen" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kitchen" />
        <div><Button type="submit" size="lg" loading={busy}>Link screen</Button></div>
      </form>
    </SettingsGate>
  );
}
