'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { buildRrule, parseRrule, type RepeatKind } from '@/lib/recurrence';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Banner } from '@/components/ui/misc';
import { Button, Field, ProfileChip, Segmented, Select, Switch } from '@/components/ui/controls';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

const EMOJI = ['🛏️', '🪥', '🍽️', '🧺', '🐱', '🐶', '🪴', '♻️', '📖', '🎒', '🧹', '🚿', '👕', '⚽'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PATTERNS: { value: RepeatKind; label: string }[] = [{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Every weekday' }, { value: 'weekly', label: 'On certain days' }, { value: 'monthly', label: 'Every month' }];

export function ChoreForm({ taskId }: { taskId?: string }) {
  const { profiles, today } = useApp(); const router = useRouter(); const notify = useNotice();
  const editing = !!taskId;
  const t = useQuery(() => (taskId ? data.getTask(taskId) : Promise.resolve(null)), [taskId]);
  const [f, setF] = useState({ title: '', emoji: '', who: [] as string[], kind: 'chore' as 'chore' | 'routine', timeOfDay: 'morning' as 'morning' | 'afternoon' | 'evening', useTime: false, dueTime: '17:00', repeats: true, pattern: 'daily' as RepeatKind, weekdays: [] as number[], startsOn: today, stars: 1 });
  const [ready, setReady] = useState(!editing); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!editing || ready || !t.data) return;
    const x = t.data, rr = parseRrule(x.rrule);
    setF({ title: x.title, emoji: x.emoji, who: x.siblings, kind: x.kind, timeOfDay: x.timeOfDay ?? 'morning', useTime: !!x.dueTime, dueTime: x.dueTime ?? '17:00', repeats: !!x.rrule, pattern: rr.kind === 'none' ? 'daily' : rr.kind, weekdays: rr.weekdays, startsOn: x.startsOn, stars: x.starValue });
    setReady(true);
  }, [editing, ready, t.data]);
  const people = profiles.filter((p) => p.kind === 'person' || p.kind === 'household');

  async function save() {
    setBusy(true); setErr('');
    if (!editing && f.who.length === 0) { setErr('Pick at least one person.'); setBusy(false); return; }
    try {
      const rrule = f.repeats ? buildRrule(f.pattern, f.weekdays) : null;
      const common = { title: f.title, emoji: f.emoji, kind: f.kind, timeOfDay: f.kind === 'routine' ? f.timeOfDay : null, dueTime: f.kind === 'chore' && f.useTime ? f.dueTime : null, rrule, starValue: f.stars };
      if (editing) await data.updateTask(taskId!, common); else await data.createTasks({ ...common, profileIds: f.who, startsOn: f.startsOn, endsOn: null });
      notify({ tone: 'success', title: editing ? 'Saved' : f.who.length > 1 ? 'Added for each person' : 'Chore added' });
      router.push('/chores');
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  }
  if (editing && !t.loading && !t.data) return <AdultGate><PageHeader title="Chore" back={{ href: '/chores', label: 'Chores' }} /><Banner tone="warning" title="This chore is gone">It may have been deleted on another screen.</Banner></AdultGate>;
  return (
    <AdultGate>
      {!ready ? <SkeletonList rows={5} /> : (
        <form className="mx-auto flex max-w-[40rem] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <PageHeader title={editing ? 'Edit chore' : 'New chore'} back={{ href: '/chores', label: 'Chores' }} />
          {err && <Banner tone="danger" title="Could not save">{err}</Banner>}
          <Field label="Name" required value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Feed the cat" />
          <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-bold">Picture (helps kids who cannot read yet)</legend>
            <div className="flex flex-wrap gap-1">
              {EMOJI.map((e) => <button key={e} type="button" aria-pressed={f.emoji === e} aria-label={`Use ${e}`} onClick={() => set('emoji', f.emoji === e ? '' : e)} className={cn('min-h-target min-w-target rounded-md border-2 text-xl', f.emoji === e ? 'border-accent bg-accent-tint' : 'border-line bg-surface')}>{e}</button>)}
            </div></fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0"><legend className="mb-1 text-sm font-bold">{editing ? 'For' : 'Who does it?'}</legend>
            <div className="flex flex-wrap gap-2">{people.map((p) => <ProfileChip key={p.id} name={p.name} color={p.color} selected={f.who.includes(p.id)} onClick={editing ? undefined : () => set('who', f.who.includes(p.id) ? f.who.filter((x) => x !== p.id) : [...f.who, p.id])} />)}</div>
            {!editing && f.who.length > 1 && <p className="text-sm text-muted">Each person gets their own copy, so they check it off separately.</p>}
            {editing && <p className="text-sm text-muted">To give it to someone else, add a new chore for them.</p>}
          </fieldset>
          <Segmented label="Type" value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'chore', label: 'Chore' }, { value: 'routine', label: 'Routine' }]} />
          {f.kind === 'routine'
            ? <Segmented label="Part of the day" value={f.timeOfDay} onChange={(v) => set('timeOfDay', v)} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} />
            : <><Switch label="Needs a time" checked={f.useTime} onChange={(v) => set('useTime', v)} />{f.useTime && <Field label="Due by" type="time" value={f.dueTime} onChange={(e) => set('dueTime', e.target.value)} />}</>}
          <Switch label="Repeats" checked={f.repeats} onChange={(v) => set('repeats', v)} />
          {f.repeats && <Select label="How often" value={f.pattern} onChange={(e) => set('pattern', e.target.value as RepeatKind)}>{PATTERNS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select>}
          {f.repeats && f.pattern === 'weekly' && <div role="group" aria-label="Days" className="flex flex-wrap gap-1">{DAY_LABELS.map((l, i) => { const on = f.weekdays.includes(i); return <button key={l} type="button" aria-pressed={on} onClick={() => set('weekdays', on ? f.weekdays.filter((d) => d !== i) : [...f.weekdays, i])} className={cn('min-h-target min-w-target rounded-md border-2 px-2 font-bold', on ? 'border-accent bg-accent text-accent-on' : 'border-line-input bg-surface text-ink')}>{l}</button>; })}</div>}
          {!editing && <Field label={f.repeats ? 'Starts on' : 'Date'} type="date" value={f.startsOn} onChange={(e) => set('startsOn', e.target.value)} />}
          <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-bold">Stars for finishing it</legend>
            <div className="flex flex-wrap items-center gap-1">{[0, 1, 2, 3, 5, 10].map((n) => <button key={n} type="button" aria-pressed={f.stars === n} onClick={() => set('stars', n)} className={cn('min-h-target min-w-target rounded-md border-2 px-2 font-bold', f.stars === n ? 'border-accent bg-accent text-accent-on' : 'border-line-input bg-surface text-ink')}>{n === 0 ? 'None' : n}</button>)}</div></fieldset>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" size="lg" loading={busy}>{editing ? 'Save changes' : 'Add chore'}</Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>Cancel</Button>
            {editing && <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={() => setAsk(true)}>Delete</Button>}
          </div>
          <ChoiceDialog open={ask} danger title="Delete this chore?" detail="Past check-offs for it are removed. Stars already earned stay." choices={[{ value: 'go', label: 'Delete' }]} onChoose={async () => { try { await data.deleteTask(taskId!); notify({ tone: 'success', title: 'Chore deleted' }); router.push('/chores'); } catch (e) { setErr(errMsg(e)); setAsk(false); } }} onCancel={() => setAsk(false)} />
        </form>
      )}
    </AdultGate>
  );
}
