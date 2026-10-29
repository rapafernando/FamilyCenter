'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { MonitorSmartphone } from 'lucide-react';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import type { Device } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Button, Field, Select } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

const seen = (iso: string | null) => (iso ? DateTime.fromISO(iso).toRelative({ style: 'long' }) : 'never');

function DeviceRow({ d, onChange, onRemove }: { d: Device; onChange: () => void; onRemove: () => void }) {
  const notify = useNotice();
  const [name, setName] = useState(d.nickname); const [err, setErr] = useState('');
  const save = async (patch: Parameters<typeof data.updateDevice>[1], ok?: string) => { setErr(''); try { await data.updateDevice(d.id, patch); if (ok) notify({ tone: 'success', title: ok }); onChange(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <li className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
      <div className="flex items-center gap-3"><MonitorSmartphone aria-hidden className="h-6 w-6 shrink-0 text-accent" /><div className="min-w-0 flex-1"><h2 className="truncate font-display text-lg text-ink">{d.nickname}</h2><p className="text-sm text-muted">Last seen {seen(d.lastSeenAt)}</p></div></div>
      {err && <Banner tone="danger" title="Could not save">{err}</Banner>}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); save({ nickname: name }, 'Renamed'); }}>
        <div className="flex-1"><Field label="Name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" variant="secondary" disabled={name === d.nickname}>Rename</Button>
      </form>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
        <Select label="Look" value={d.config.theme ?? 'auto'} onChange={(e) => save({ config: { ...d.config, theme: e.target.value as 'auto' | 'light' | 'dark' } })}><option value="auto">Follow the device</option><option value="light">Light</option><option value="dark">Dark</option></Select>
        <Select label="Photos start after" value={String(d.config.idleMinutes ?? 5)} onChange={(e) => save({ config: { ...d.config, idleMinutes: Number(e.target.value) } })}>{[1, 2, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m} {m === 1 ? 'minute' : 'minutes'}</option>)}</Select>
      </div>
      <div><Button variant="ghost" className="text-danger" onClick={onRemove}>Unlink {d.nickname}</Button></div>
    </li>
  );
}

export default function Devices() {
  const q = useQuery(() => data.listDevices(), []);
  const [gone, setGone] = useState<Device | null>(null);
  return (
    <SettingsGate>
      <PageHeader title="Screens" back={{ href: '/settings', label: 'Settings' }} actions={<Link href="/settings/devices/link" className="inline-flex min-h-target items-center rounded-md bg-accent px-5 font-bold text-accent-on">Link a screen</Link>} />
      {q.loading && !q.data && <SkeletonList rows={2} />}
      {q.error && <Banner tone="danger" title="Could not load your screens" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Try again in a moment.</Banner>}
      {q.data && q.data.length === 0 && (
        <div className="max-w-[40rem] rounded-lg border-2 border-dashed border-line-input p-6 text-center"><p className="text-lg font-bold text-ink">No screens linked</p>
          <p className="text-base text-muted">On the tablet, open this site and choose “Link this screen”. It shows a code to type here.</p></div>
      )}
      <ul className="m-0 flex max-w-[40rem] list-none flex-col gap-3 p-0">{(q.data ?? []).map((d) => <DeviceRow key={d.id} d={d} onChange={q.reload} onRemove={() => setGone(d)} />)}</ul>
      <ChoiceDialog open={!!gone} danger title={`Unlink ${gone?.nickname}?`} detail="That screen goes back to the welcome page. Your calendar is not changed." choices={[{ value: 'go', label: 'Unlink screen' }]}
        onChoose={async () => { const d = gone!; setGone(null); await data.removeDevice(d.id); q.reload(); }} onCancel={() => setGone(null)} />
    </SettingsGate>
  );
}
