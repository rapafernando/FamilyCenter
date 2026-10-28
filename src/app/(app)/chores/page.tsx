'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { addDays, fmtDate } from '@/lib/time';
import type { TaskForDay } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { Button, FabLink, ProfileChip } from '@/components/ui/controls';
import { StarCounter, StarSticker, TaskRow } from '@/components/ui/tasks';
import { Banner } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';
import { markerAttrs } from '@/lib/marker';

const GROUPS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;

export default function Chores() {
  const { profiles, today } = useApp(); const notify = useNotice();
  const [date, setDate] = useState(today);
  const q = useQuery(() => data.listTasksForDay(date), [date]);
  const [burst, setBurst] = useState<string | null>(null);
  const people = profiles.filter((p) => p.kind === 'person' || p.kind === 'household');
  const byPerson = useMemo(() => {
    const m = new Map<string, TaskForDay[]>(); for (const t of q.data ?? []) (m.get(t.task.profileId) ?? m.set(t.task.profileId, []).get(t.task.profileId)!).push(t); return m;
  }, [q.data]);

  async function toggle(t: TaskForDay, v: boolean) {
    try {
      await data.setCompletion(t.task.id, date, v);
      const list = (byPerson.get(t.task.profileId) ?? []).map((x) => (x.task.id === t.task.id ? { ...x, done: v } : x));
      if (v && list.every((x) => x.done)) { setBurst(t.task.profileId); setTimeout(() => setBurst(null), 4000); }
    } catch (e) { notify({ tone: 'danger', title: 'Could not change that chore', body: errMsg(e) }); }
  }
  const shown = people.filter((p) => byPerson.has(p.id));
  return (
    <>
      <PageHeader title="Chores" actions={<Link href="/rewards" className="inline-flex min-h-target items-center rounded-md border-2 border-line-input bg-surface px-5 font-bold text-ink">Rewards</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label="Previous day" className="px-3" onClick={() => setDate(addDays(date, -1))}><ChevronLeft aria-hidden className="h-6 w-6" /></Button>
        <Button variant="secondary" onClick={() => setDate(today)}>Today</Button>
        <Button variant="secondary" aria-label="Next day" className="px-3" onClick={() => setDate(addDays(date, 1))}><ChevronRight aria-hidden className="h-6 w-6" /></Button>
        <h2 className="ml-2 font-display text-xl text-ink" aria-live="polite">{date === today ? 'Today' : fmtDate(date, 'cccc, LLL d')}</h2>
      </div>
      {q.error && <Banner tone="danger" title="Could not load chores" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Your chores are safe. Try again.</Banner>}
      {q.loading && !q.data && <SkeletonList rows={4} />}
      {q.data && shown.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-line-input p-6 text-center">
          <p className="text-lg font-bold text-ink">No chores on this day</p>
          <p className="mb-3 text-base text-muted">Add a chore or a routine for anyone in the house.</p>
          <Link href="/chores/new" className="inline-flex min-h-target items-center rounded-md bg-accent px-5 font-bold text-accent-on">Add a chore</Link>
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(19rem, 100%), 1fr))' }}>
        {shown.map((p) => {
          const list = byPerson.get(p.id)!; const done = list.filter((x) => x.done).length; const all = done === list.length;
          const routines = (['morning', 'afternoon', 'evening'] as const).map((k) => ({ k, items: list.filter((x) => x.task.kind === 'routine' && x.task.timeOfDay === k) })).filter((g) => g.items.length);
          const chores = list.filter((x) => x.task.kind === 'chore');
          const row = (x: TaskForDay) => (
            <TaskRow key={x.task.id} title={x.task.title} emoji={x.task.emoji} color={p.color} done={x.done} stars={x.task.starValue} meta={x.task.dueTime ? `by ${x.task.dueTime}` : undefined} onToggle={(v) => toggle(x, v)}
              trailing={<Link href={`/chores/${x.task.id}`} aria-label={`Edit ${x.task.title} for ${p.name}`} className="flex min-h-target min-w-target items-center justify-center rounded-md text-muted"><Pencil aria-hidden className="h-4 w-4" /></Link>} />
          );
          return (
            <section key={p.id} aria-label={p.name} {...markerAttrs(p.color)} className="flex flex-col gap-2 rounded-lg bg-m-tint p-3">
              <div className="flex items-center justify-between gap-2"><ProfileChip name={p.name} color={p.color} /><span className="text-sm font-bold text-ink">{done} of {list.length} done</span></div>
              {p.kind === 'person' && <StarCounter name={p.name} color={p.color} balance={p.starBalance} />}
              {all && (
                <div role="status" className="flex items-center gap-3 rounded-md bg-surface p-3">
                  <StarSticker burst={burst === p.id} className="h-12 w-12 shrink-0" />
                  <p className="text-base font-bold text-ink">{p.name} finished everything. Nice work!</p>
                </div>
              )}
              {routines.map((g) => <div key={g.k} className="flex flex-col gap-2"><h3 className="mt-1 text-base font-bold text-ink">{GROUPS[g.k]}</h3>{g.items.map(row)}</div>)}
              {chores.length > 0 && <div className="flex flex-col gap-2">{routines.length > 0 && <h3 className="mt-1 text-base font-bold text-ink">Chores</h3>}{chores.map(row)}</div>}
            </section>
          );
        })}
      </div>
      <FabLink label="Add chore" href="/chores/new" />
    </>
  );
}
