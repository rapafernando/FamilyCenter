'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { Plus } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data, IS_FAKE } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import type { Connection } from '@/lib/types';
import { markerAttrs } from '@/lib/marker';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, Segmented, Select, Switch } from '@/components/ui/controls';
import { Banner, ConnectionCard } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

const ago = (iso: string | null) => (iso ? DateTime.fromISO(iso).toRelative({ style: 'long' }) ?? 'just now' : 'not yet');

export default function Calendars() {
  const { profiles } = useApp(); const notify = useNotice();
  const conns = useQuery(() => data.listConnections(), []);
  const cals = useQuery(() => data.listSyncedCalendars(), []);
  const [err, setErr] = useState(''); const [mode, setMode] = useState<'one_way' | 'two_way'>('one_way'); const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const reloadAll = () => { conns.reload(); cals.reload(); };
  const guard = async (fn: () => Promise<unknown>, done?: string) => { setErr(''); try { await fn(); if (done) notify({ tone: 'success', title: done }); reloadAll(); } catch (e) { setErr(errMsg(e)); reloadAll(); } };
  const people = profiles.filter((p) => p.kind !== 'other');

  return (
    <AdultGate>
      <PageHeader title="Calendars" back={{ href: '/settings', label: 'Settings' }} />
      {IS_FAKE && <div className="mb-3"><Banner tone="info" title="Practice mode">The Google sign-in is pretended here. Real sign-in is added with the server.</Banner></div>}
      {err && <div className="mb-3"><Banner tone="danger" title="That did not work">{err}</Banner></div>}
      {(conns.loading && !conns.data) && <SkeletonList rows={3} />}
      {conns.error && <Banner tone="danger" title="Could not load your connections" action={<Button size="sm" onClick={reloadAll}>Try again</Button>}>Try again in a moment.</Banner>}
      {conns.data && conns.data.length === 0 && (
        <div className="mb-4 rounded-lg border-2 border-dashed border-line-input p-6 text-center">
          <p className="text-lg font-bold text-ink">No Google Calendar yet</p>
          <p className="text-base text-muted">Connect one to show its events here next to your family’s.</p>
        </div>
      )}
      <div className="flex max-w-[44rem] flex-col gap-5">
        {(conns.data ?? []).map((c) => {
          const mine = (cals.data ?? []).filter((k) => k.connectionId === c.id);
          const status = c.status === 'paused' ? 'stale' : c.status;
          return (
            <div key={c.id} className="flex flex-col gap-3">
              <ConnectionCard email={c.accountEmail} status={status} mode={c.mode} lastSynced={ago(c.lastSyncedAt)} tokenChecked={ago(c.tokenCheckedAt)}
                onReload={() => guard(() => data.reloadConnection(c.id), 'Synced')} onReconnect={() => guard(() => data.connectGoogle(c.mode, c.id), 'Reconnected')} onRemove={() => setRemoving(c)} />
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>Google’s sign-in is checked every day, and renewed before it runs out.</span>
                <Button size="sm" variant="ghost" onClick={() => guard(() => data.checkToken(c.id), 'Sign-in checked')}>Check now</Button>
              </div>
              <Switch label="Let changes here go back to Google" checked={c.mode === 'two_way'} onChange={(v) => guard(() => data.updateConnection(c.id, { mode: v ? 'two_way' : 'one_way' }))} />
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0"><legend className="mb-1 font-display text-lg text-ink">Calendars in this account</legend>
                {mine.length === 0 && <p className="text-base text-muted">No calendars found in this account.</p>}
                {mine.map((k) => (
                  <div key={k.id} {...markerAttrs(k.color)} className="flex flex-col gap-2 rounded-lg border-2 border-line bg-surface p-3">
                    <Switch label={k.name} checked={k.enabled} onChange={(v) => guard(() => data.updateSyncedCalendar(k.id, { enabled: v }))} />
                    {k.enabled && (
                      <div className="flex flex-wrap items-end gap-3">
                        <Select label="Show as" value={k.profileId ?? ''} onChange={(e) => guard(() => data.updateSyncedCalendar(k.id, { profileId: e.target.value || null }))}>
                          <option value="">Family</option>{people.filter((p) => p.kind === 'person').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                        {c.mode === 'two_way' && (
                          <label className="flex min-h-target items-center gap-2 font-bold text-ink"><input type="radio" name="target" checked={k.isDefaultTarget} onChange={() => guard(() => data.updateSyncedCalendar(k.id, { isDefaultTarget: true }))} className="h-5 w-5 accent-accent" />Save new events here</label>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>
              {IS_FAKE && (
                <details className="rounded-md border-2 border-dashed border-line-input p-3">
                  <summary className="min-h-target cursor-pointer py-2 text-sm font-bold text-muted">Practice tools</summary>
                  <p className="mb-2 text-sm text-muted">See what a family sees when Google ends the sign-in.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => guard(() => data.updateConnection(c.id, { status: 'needs_reauth' }))}>Pretend sign-in ended</Button>
                    <Button size="sm" variant="secondary" onClick={() => guard(() => data.updateConnection(c.id, { status: 'stale' }))}>Pretend sync is behind</Button>
                  </div>
                </details>
              )}
            </div>
          );
        })}
        <section aria-label="Add Google Calendar" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">{conns.data?.length ? 'Add another Google account' : 'Connect Google Calendar'}</h2>
          <Segmented label="What should it do?" value={mode} onChange={setMode} options={[{ value: 'one_way', label: 'Show events only' }, { value: 'two_way', label: 'Both ways' }]} />
          <p className="text-sm text-muted">{mode === 'one_way' ? 'Google events show here. Nothing you do here changes Google.' : 'Events you add or change here are saved to Google too.'}</p>
          <div><Button size="lg" loading={busy} onClick={async () => { setBusy(true); await guard(() => data.connectGoogle(mode), 'Google Calendar connected'); setBusy(false); }}><Plus aria-hidden className="h-5 w-5" />Connect Google</Button></div>
          <Banner tone="warning" title="Setting up your own Google project?">If Google lists it as “Testing”, it ends the sign-in every 7 days, whatever we do. Publish the consent screen to “In production” to stop that.</Banner>
        </section>
      </div>
      <ChoiceDialog open={!!removing} danger title="Remove this Google account?" detail="Its events disappear from this screen. Nothing is deleted in Google." choices={[{ value: 'go', label: 'Remove account' }]}
        onChoose={() => { const c = removing!; setRemoving(null); guard(() => data.removeConnection(c.id), 'Google account removed'); }} onCancel={() => setRemoving(null)} />
    </AdultGate>
  );
}
