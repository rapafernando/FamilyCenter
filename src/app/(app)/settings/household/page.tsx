'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import type { Role } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Button, Field, Select } from '@/components/ui/controls';
import { allZones } from '@/lib/zones';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';

const ROLE: Record<Role, string> = { owner: 'Owner', adult: 'Adult', viewer: 'Can only look' };

export default function HouseholdSettings() {
  const { household } = useApp(); const notify = useNotice();
  const mem = useQuery(() => data.listMembers(), []);
  const feat = useQuery(() => data.features(), []);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [h, setH] = useState({ name: household.name, timezone: household.timezone, weekStartsOn: household.weekStartsOn, defaultView: household.defaultView, location: household.location });
  const [inv, setInv] = useState({ email: '', role: 'adult' as 'adult' | 'viewer' }); const [err, setErr] = useState(''); const [gone, setGone] = useState<{ id: string; name: string } | null>(null);
  const all = allZones(); const zones = all.includes(h.timezone) ? all : [h.timezone, ...all];
  const guard = async (fn: () => Promise<unknown>, ok?: string) => { setErr(''); try { await fn(); if (ok) notify({ tone: 'success', title: ok }); mem.reload(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <SettingsGate>
      <PageHeader title="Household" back={{ href: '/settings', label: 'Settings' }} />
      <div className="flex max-w-[40rem] flex-col gap-5">
        {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
        <form className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4" onSubmit={(e) => { e.preventDefault(); guard(() => data.updateHousehold(h), 'Saved'); }}>
          <h2 className="font-display text-lg text-ink">About your home</h2>
          <Field label="Household name" required value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
          <Select label="Time zone" value={h.timezone} onChange={(e) => setH({ ...h, timezone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')} ({DateTime.now().setZone(z).toFormat('ZZZZ')})</option>)}</Select>
          <Select label="Week starts on" value={String(h.weekStartsOn)} onChange={(e) => setH({ ...h, weekStartsOn: Number(e.target.value) })}><option value="0">Sunday</option><option value="1">Monday</option><option value="6">Saturday</option></Select>
          <Select label="Calendar opens on" value={h.defaultView} onChange={(e) => setH({ ...h, defaultView: e.target.value as 'day' | 'week' | 'month' })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></Select>
          <Field label="Place for the weather" value={h.location} onChange={(e) => setH({ ...h, location: e.target.value })} placeholder="Albany, NY" />
          <div><Button type="submit" size="lg">Save</Button></div>
        </form>
        <section aria-label="Members" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Who can sign in</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(mem.data?.members ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span className="min-w-0"><span className="block truncate font-bold text-ink">{m.name}{m.isYou && ' (you)'}</span><span className="text-sm text-muted">{m.email}</span></span>
                {m.isYou ? <span className="text-sm font-bold text-ink">{ROLE[m.role]}</span> : (
                  <span className="flex items-center gap-2"><Select label={`Role for ${m.name}`} className="[&>label]:sr-only" value={m.role} onChange={(e) => guard(() => data.setMemberRole(m.id, e.target.value as Role))}><option value="adult">Adult</option><option value="viewer">Can only look</option></Select>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setGone({ id: m.id, name: m.name })}>Remove</Button></span>
                )}
              </li>
            ))}
          </ul>
          {!!mem.data?.invitations.length && <><h3 className="text-base font-bold text-ink">Waiting to join</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">{mem.data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2"><span className="text-base text-ink">{i.email} <span className="text-sm text-muted">· {ROLE[i.role]}</span></span><Button size="sm" variant="ghost" onClick={() => guard(() => data.revokeInvitation(i.id), 'Invitation cancelled')}>Cancel invitation</Button></li>))}</ul></>}
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); guard(async () => { const r = await data.invite(inv.email, inv.role); setLink({ email: r.email, url: `${window.location.origin}/join/${r.token}` }); setInv({ email: '', role: 'adult' }); }, 'Invitation made'); }}>
            <div className="min-w-[12rem] flex-1"><Field label="Invite by email" type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="partner@example.com" /></div>
            <Select label="As" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as 'adult' | 'viewer' })}><option value="adult">Adult</option><option value="viewer">Can only look</option></Select>
            <Button type="submit">Invite</Button>
          </form>
          {link && (
            <div className="flex flex-col gap-2 rounded-md border-2 border-line bg-accent-tint p-3" role="status">
              <p className="text-base font-bold text-ink">Link for {link.email}</p>
              <input readOnly aria-label={`Invitation link for ${link.email}`} value={link.url} onFocus={(e) => e.currentTarget.select()} className="min-h-target w-full rounded-md border-2 border-line-input bg-surface px-3 text-sm text-ink" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(link.url).then(() => notify({ tone: 'success', title: 'Link copied' }), () => notify({ tone: 'warning', title: 'Could not copy', body: 'Select the link and copy it by hand.' })); }}>Copy link</Button>
                <span className="text-sm text-muted">Works once, for 7 days. {feat.data?.smtp ? 'It was also emailed.' : 'Email is not set up on this server, so send the link yourself.'}</span>
              </div>
            </div>
          )}
          {!link && <p className="text-sm text-muted">The invitation link is shown once, right after you invite someone. It works for 7 days.</p>}
        </section>
      </div>
      <ChoiceDialog open={!!gone} danger title={`Remove ${gone?.name}?`} detail="They can no longer sign in to this household." choices={[{ value: 'go', label: 'Remove person' }]} onChoose={() => { const g = gone!; setGone(null); guard(() => data.removeMember(g.id), 'Removed'); }} onCancel={() => setGone(null)} />
    </SettingsGate>
  );
}
