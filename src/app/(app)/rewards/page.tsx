'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { fmtDate } from '@/lib/time';
import { markerAttrs } from '@/lib/marker';
import { PageHeader } from '@/components/shell/AppShell';
import { Button, Field, ProfileChip } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { RewardCard, StarCounter, StarSticker } from '@/components/ui/tasks';
import { SkeletonList } from '@/components/ui/skeleton';

export default function Rewards() {
  const { profiles, unlocked } = useApp(); const notify = useNotice();
  const rw = useQuery(() => data.listRewards(), []);
  const kids = profiles.filter((p) => p.kind === 'person');
  const [who, setWho] = useState<string | null>(null);
  const withRewards = kids.find((p) => (rw.data ?? []).some((r) => r.profileId === p.id));
  const current = kids.find((p) => p.id === who) ?? withRewards ?? kids[0];
  const hist = useQuery(() => (current ? data.listStarHistory(current.id) : Promise.resolve([])), [current?.id, current?.starBalance]);
  const [err, setErr] = useState(''); const [burst, setBurst] = useState(false);
  const [form, setForm] = useState({ title: '', emoji: '🎁', cost: 10 }); const [adding, setAdding] = useState(false);
  const [bonus, setBonus] = useState('1'); const [note, setNote] = useState('');

  async function redeem(id: string, title: string) {
    setErr('');
    try { await data.redeemReward(id); setBurst(true); setTimeout(() => setBurst(false), 3000); notify({ tone: 'success', title: `${current?.name} got “${title}”`, body: 'The stars were spent.' }); }
    catch (e) { setErr(errMsg(e)); }
  }
  async function add() {
    setErr('');
    try { await data.createReward({ profileId: current!.id, title: form.title, emoji: form.emoji, starsNeeded: Number(form.cost) }); setForm({ title: '', emoji: '🎁', cost: 10 }); setAdding(false); rw.reload(); }
    catch (e) { setErr(errMsg(e)); }
  }
  async function giveStars(sign: 1 | -1) {
    setErr('');
    try { await data.addBonusStars(current!.id, sign * Math.abs(Number(bonus)), note); setNote(''); }
    catch (e) { setErr(errMsg(e)); }
  }
  async function remove(id: string) { try { await data.deleteReward(id); rw.reload(); } catch (e) { setErr(errMsg(e)); } }

  if (!current) return <><PageHeader title="Rewards" back={{ href: '/chores', label: 'Chores' }} /><Banner tone="info" title="No one to earn stars yet">Add a person in Settings, then give them chores worth stars.</Banner></>;
  const mine = (rw.data ?? []).filter((r) => r.profileId === current.id);
  return (
    <>
      <PageHeader title="Rewards" back={{ href: '/chores', label: 'Chores' }} />
      <div role="group" aria-label="Whose rewards" className="mb-3 flex flex-wrap gap-2">
        {kids.map((p) => <ProfileChip key={p.id} name={p.name} color={p.color} selected={p.id === current.id} onClick={() => setWho(p.id)} />)}
      </div>
      {err && <div className="mb-3"><Banner tone="danger" title="That did not work">{err}</Banner></div>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StarCounter name={current.name} color={current.color} balance={current.starBalance} />
        {burst && <StarSticker burst className="h-14 w-14" />}
      </div>
      {rw.loading && !rw.data && <SkeletonList rows={3} />}
      {rw.error && <Banner tone="danger" title="Could not load rewards" action={<Button size="sm" onClick={rw.reload}>Try again</Button>}>Try again in a moment.</Banner>}
      {rw.data && mine.length === 0 && !adding && (
        <div className="rounded-lg border-2 border-dashed border-line-input p-6 text-center">
          <p className="text-lg font-bold text-ink">No rewards for {current.name} yet</p>
          <p className="text-base text-muted">{unlocked ? 'Add something worth saving up for.' : 'A parent can add one.'}</p>
        </div>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(15rem, 100%), 1fr))' }}>
        {mine.map((r) => (
          <RewardCard key={r.id} title={r.title} emoji={r.emoji} cost={r.starsNeeded} balance={current.starBalance} color={current.color} onRedeem={() => redeem(r.id, r.title)}
            footer={unlocked ? <button type="button" onClick={() => remove(r.id)} className="flex min-h-target items-center justify-center gap-1 text-sm text-muted"><Trash2 aria-hidden className="h-4 w-4" />Remove {r.title}</button> : undefined} />
        ))}
      </div>
      {unlocked && (
        <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(20rem, 100%), 1fr))', alignItems: 'start' }}>
          <section aria-label="Add a reward" {...markerAttrs(current.color)} className="flex flex-col gap-3 rounded-lg bg-m-tint p-4">
            {!adding ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden className="h-5 w-5" />Add a reward</Button> : (
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
                <h2 className="font-display text-lg text-ink">New reward for {current.name}</h2>
                <Field label="Name" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Movie night pick" />
                <Field label="Picture" value={form.emoji} maxLength={2} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
                <Field label="Stars needed" type="number" min={1} max={500} value={String(form.cost)} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                <div className="flex gap-2"><Button type="submit">Save reward</Button><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button></div>
              </form>
            )}
          </section>
          <section aria-label="Adjust stars" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
            <h2 className="font-display text-lg text-ink">Give or take stars</h2>
            <Field label="How many" type="number" min={1} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            <Field label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Helped a neighbor" />
            <div className="flex gap-2"><Button onClick={() => giveStars(1)}>Give</Button><Button variant="secondary" onClick={() => giveStars(-1)}>Take away</Button></div>
          </section>
        </div>
      )}
      <section aria-label="Star history" className="mt-5">
        <h2 className="mb-2 font-display text-lg text-ink">Recent stars</h2>
        {hist.data && hist.data.length === 0 && <p className="text-base text-muted">Nothing yet. Finish a chore that is worth stars.</p>}
        <ul className="flex flex-col gap-1">
          {(hist.data ?? []).slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-base">
              <span className="text-ink">{e.note || ({ task: 'Finished a chore', manual: 'Added by a parent', redeem: 'Reward', reversal: 'Chore unchecked' } as const)[e.reason]}<span className="ml-2 text-sm text-muted">{fmtDate(e.createdAt.slice(0, 10), 'LLL d')}</span></span>
              <span className="font-bold text-ink">{e.delta > 0 ? `+${e.delta}` : e.delta}<span className="sr-only"> stars</span></span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
