'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { MARKER_PRESETS } from '@/lib/markers.generated';
import type { Profile } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Banner } from '@/components/ui/misc';
import { Button, ColorPicker, Field, ProfileChip, Select } from '@/components/ui/controls';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

function Editor({ p, others, onDone }: { p: Partial<Profile> & { id?: string }; others: Profile[]; onDone: () => void }) {
  const notify = useNotice();
  const [name, setName] = useState(p.name ?? ''); const [color, setColor] = useState(p.color ?? MARKER_PRESETS.sky); const [bday, setBday] = useState(p.birthday ?? '');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [merge, setMerge] = useState(''); const [ask, setAsk] = useState<null | 'delete' | 'merge'>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setErr(''); try { await fn(); notify({ tone: 'success', title: ok }); onDone(); } catch (e) { setErr(errMsg(e)); setBusy(false); setAsk(null); } };
  return (
    <form className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4" onSubmit={(e) => { e.preventDefault(); run(() => (p.id ? data.updateProfile(p.id, { name, color, birthday: bday || null }) : data.createProfile({ name, color, birthday: bday || null })), p.id ? 'Saved' : `${name} added`); }}>
      {err && <Banner tone="danger" title="Could not save">{err}</Banner>}
      <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} disabled={p.kind === 'household'} />
      <ColorPicker label="Colour" value={color} onChange={setColor} />
      {p.kind !== 'household' && <Field label="Birthday (optional)" type="date" value={bday} onChange={(e) => setBday(e.target.value)} />}
      <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}>{p.id ? 'Save' : 'Add person'}</Button><Button type="button" variant="secondary" onClick={onDone}>Cancel</Button></div>
      {p.id && p.kind !== 'household' && others.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-line pt-3">
          <Select label={`Merge ${p.name} into`} value={merge} onChange={(e) => setMerge(e.target.value)}><option value="">Choose someone…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!merge} onClick={() => setAsk('merge')}>Merge</Button><Button type="button" variant="ghost" className="text-danger" onClick={() => setAsk('delete')}>Delete {p.name}</Button></div>
        </div>
      )}
      <ChoiceDialog open={ask === 'merge'} title={`Merge ${p.name}?`} detail={`Events, chores, rewards and stars move to ${others.find((o) => o.id === merge)?.name}. ${p.name} is removed.`} choices={[{ value: 'go', label: 'Merge' }]} onChoose={() => run(() => data.mergeProfiles(p.id!, merge), 'Merged')} onCancel={() => setAsk(null)} />
      <ChoiceDialog open={ask === 'delete'} danger title={`Delete ${p.name}?`} detail="Their chores and rewards are deleted too. People with events cannot be deleted; merge them instead." choices={[{ value: 'go', label: 'Delete' }]} onChoose={() => run(() => data.deleteProfile(p.id!), 'Deleted')} onCancel={() => setAsk(null)} />
    </form>
  );
}

function Inner() {
  const { profiles } = useApp(); const sp = useSearchParams();
  const cals = useQuery(() => data.listSyncedCalendars(), []);
  const [edit, setEdit] = useState<string | 'new' | null>(sp.get('welcome') ? 'new' : null);
  const list = profiles.filter((p) => p.kind !== 'other');
  return (
    <AdultGate>
      <PageHeader title="People" back={{ href: '/settings', label: 'More' }} actions={<Button onClick={() => setEdit('new')}>Add person</Button>} />
      {sp.get('welcome') && <div className="mb-3"><Banner tone="success" title="Your household is ready">Add the people who live here. Each one gets a colour that shows up on every screen.</Banner></div>}
      {!cals.data && cals.loading ? <SkeletonList rows={3} /> : (
        <ul className="flex max-w-[44rem] list-none flex-col gap-3 p-0">
          {edit === 'new' && <li><Editor p={{}} others={[]} onDone={() => setEdit(null)} /></li>}
          {list.map((p) => (
            <li key={p.id}>
              {edit === p.id ? <Editor p={p} others={list.filter((o) => o.id !== p.id)} onDone={() => setEdit(null)} /> : (
                <div className="flex min-h-primary flex-wrap items-center gap-3 rounded-lg border-2 border-line bg-surface p-3">
                  <ProfileChip name={p.name} color={p.color} />
                  <span className="flex-1 text-base text-muted">{p.kind === 'household' ? 'Shared by everyone' : p.birthday ? `Birthday ${new Date(p.birthday + 'T12:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : ''}
                    {(cals.data ?? []).filter((c) => c.profileId === p.id).map((c) => <span key={c.id} className="ml-2">· Calendar: {c.name}</span>)}</span>
                  <Button variant="secondary" size="sm" onClick={() => setEdit(p.id)}>Edit {p.name}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 max-w-[44rem] text-base text-muted">Link a Google calendar to a person in <Link href="/settings/calendars" className="font-bold text-accent underline">Calendars</Link> and its events show in their colour.</p>
    </AdultGate>
  );
}
export default function ProfilesPage() { return <Suspense fallback={null}><Inner /></Suspense>; }
