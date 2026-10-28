'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { errMsg, useApp } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { addDays, fmtDate, startOfWeek } from '@/lib/time';
import type { MealSlot } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { Button, Field, Select } from '@/components/ui/controls';
import { Banner, MealTile } from '@/components/ui/misc';
import { SkeletonList } from '@/components/ui/skeleton';

const SLOTS: { id: MealSlot; label: string }[] = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }];

export default function Meals() {
  const { household, today } = useApp();
  const [anchor, setAnchor] = useState(today);
  const start = startOfWeek(anchor, household.weekStartsOn); const end = addDays(start, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const q = useQuery(() => data.listMeals(start, end), [start]);
  const rec = useQuery(() => data.listRecipes(), []);
  const [adding, setAdding] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [title, setTitle] = useState(''); const [recipeId, setRecipeId] = useState(''); const [err, setErr] = useState('');

  async function save() {
    setErr('');
    try {
      const r = rec.data?.find((x) => x.id === recipeId);
      await data.addMeal({ planDate: adding!.date, slot: adding!.slot, title: title || r?.title || '', recipeId: r?.id ?? null });
      setAdding(null); setTitle(''); setRecipeId(''); q.reload();
    } catch (e) { setErr(errMsg(e)); }
  }
  const body = (d: string) => SLOTS.map((s) => {
    const meals = (q.data ?? []).filter((m) => m.planDate === d && m.slot === s.id).map((m) => ({ id: m.id, title: m.title, href: m.recipeId ? `/recipes/${m.recipeId}` : undefined }));
    return <MealTile key={s.id} day={fmtDate(d, 'ccc')} slot={s.label} meals={meals} onAdd={() => { setAdding({ date: d, slot: s.id }); setErr(''); }} onRemove={async (id) => { await data.deleteMeal(id); q.reload(); }} />;
  });
  return (
    <>
      <PageHeader title="Meals" actions={<Link href="/recipes" className="inline-flex min-h-target items-center rounded-md border-2 border-line-input bg-surface px-5 font-bold text-ink">Recipes</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label="Previous week" className="px-3" onClick={() => setAnchor(addDays(start, -7))}><ChevronLeft aria-hidden className="h-6 w-6" /></Button>
        <Button variant="secondary" onClick={() => setAnchor(today)}>This week</Button>
        <Button variant="secondary" aria-label="Next week" className="px-3" onClick={() => setAnchor(addDays(start, 7))}><ChevronRight aria-hidden className="h-6 w-6" /></Button>
        <h2 className="ml-2 font-display text-xl text-ink" aria-live="polite">{fmtDate(start, 'LLL d')} – {fmtDate(end, 'LLL d')}</h2>
      </div>
      {q.error && <Banner tone="danger" title="Could not load the plan" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Try again in a moment.</Banner>}
      {q.loading && !q.data && <SkeletonList rows={4} />}
      {q.data && q.data.length === 0 && <p className="mb-3 rounded-md border-2 border-dashed border-line-input p-4 text-center text-base text-muted">Nothing planned this week. Pick a day below and add what you will eat.</p>}
      {adding && (
        <form className="mb-4 flex max-w-[34rem] flex-col gap-3 rounded-lg border-2 border-accent bg-surface p-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <h2 className="font-display text-lg text-ink">Add to {fmtDate(adding.date, 'cccc')} {adding.slot}</h2>
          {err && <Banner tone="danger" title="Could not add it">{err}</Banner>}
          <Field label="What is on the menu" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leftover pizza" autoFocus />
          {!!rec.data?.length && <Select label="Or pick a saved recipe" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}><option value="">None</option>{rec.data.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select>}
          <div className="flex gap-2"><Button type="submit">Add meal</Button><Button type="button" variant="secondary" onClick={() => setAdding(null)}>Cancel</Button></div>
        </form>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(16rem, 100%), 1fr))' }}>
        {days.map((d) => (
          <section key={d} aria-label={fmtDate(d, 'cccc, LLL d')} className="flex flex-col gap-2">
            <h3 className={`font-display text-lg ${d === today ? 'text-accent' : 'text-ink'}`}>{d === today ? 'Today' : fmtDate(d, 'cccc')}<span className="ml-2 text-sm font-normal text-muted">{fmtDate(d, 'LLL d')}</span></h3>
            {body(d)}
          </section>
        ))}
      </div>
    </>
  );
}
