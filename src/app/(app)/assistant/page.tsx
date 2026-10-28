'use client';
import { useState } from 'react';
import Link from 'next/link';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import type { AiJob, AiKind } from '@/lib/types';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, Field, Segmented } from '@/components/ui/controls';
import { Banner, PromptPanel } from '@/components/ui/misc';

const KINDS: Record<AiKind, { tab: string; title: string; placeholder: string }> = {
  meal_plan: { tab: 'Meal plan', title: 'Plan the week’s dinners', placeholder: 'Quick weeknight dinners, one vegetarian night, nothing spicy.' },
  event_import: { tab: 'Events from text', title: 'Turn a note into events', placeholder: 'Paste a school email or flyer. Picture day is next Tuesday, concert Friday at 6:30.' },
  recipe_import: { tab: 'Recipe', title: 'Write down a recipe', placeholder: 'Paste a recipe, or describe a dish you want to cook.' },
};

export default function Assistant() {
  const notify = useNotice();
  const ai = useQuery(() => data.aiStatus(), []);
  const [kind, setKind] = useState<AiKind>('meal_plan'); const [days, setDays] = useState('5');
  const [job, setJob] = useState<AiJob | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [pick, setPick] = useState<string[]>([]);
  const k = KINDS[kind];
  async function run(text: string) {
    setBusy(true); setErr(''); setJob(null);
    try { const j = await data.runAiJob(kind, { text, days: Number(days) || 5 }); setJob(j); setPick(j.proposal.map((p) => p.id)); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  }
  async function apply() {
    try { const r = await data.applyAiJob(job!.id, pick); notify({ tone: 'success', title: `Added ${r.applied} ${r.applied === 1 ? 'item' : 'items'}` }); setJob(null); } catch (e) { setErr(errMsg(e)); }
  }
  return (
    <AdultGate>
      <PageHeader title="Assistant" />
      {ai.loading && !ai.data && <p role="status" className="text-muted">Loading…</p>}
      {ai.data && !ai.data.available && (
        <div className="max-w-[40rem] rounded-lg border-2 border-dashed border-line-input p-6 text-center"><p className="text-lg font-bold text-ink">The assistant is off</p>
          <p className="mb-3 text-base text-muted">Add your own AI key and it turns on.</p><Link href="/settings/ai" className="inline-flex min-h-target items-center rounded-md bg-accent px-5 font-bold text-accent-on">Add a key</Link></div>
      )}
      {ai.data?.available && (
        <div className="flex max-w-[40rem] flex-col gap-4">
          <Segmented label="What do you need?" value={kind} onChange={(v) => { setKind(v); setJob(null); setErr(''); }} options={(Object.keys(KINDS) as AiKind[]).map((v) => ({ value: v, label: KINDS[v].tab }))} />
          {kind === 'meal_plan' && <Field label="How many days" type="number" min={1} max={7} value={days} onChange={(e) => setDays(e.target.value)} className="max-w-[10rem]" />}
          <PromptPanel key={kind} title={k.title} placeholder={k.placeholder} state={busy ? 'working' : job ? 'review' : 'idle'} onSubmit={run} />
          {err && <Banner tone="danger" title="No plan this time">{err}</Banner>}
          {job && (
            <section aria-label="Review" className="flex flex-col gap-3 rounded-lg border-2 border-accent bg-surface p-4">
              <h2 className="font-display text-lg text-ink">Check before it is added</h2>
              {job.proposal.length === 0 && <p className="text-base text-muted">Nothing came back. Try adding more detail.</p>}
              <ul className="m-0 flex list-none flex-col p-0">
                {job.proposal.map((p) => (
                  <li key={p.id} className="border-b border-line"><label className="flex min-h-target cursor-pointer items-start gap-3 py-2">
                    <input type="checkbox" className="mt-1 h-6 w-6 accent-accent" checked={pick.includes(p.id)} onChange={(e) => setPick(e.target.checked ? [...pick, p.id] : pick.filter((x) => x !== p.id))} />
                    <span><span className="block font-bold text-ink">{p.label}</span><span className="text-sm text-muted">{p.detail}</span></span></label></li>
                ))}
              </ul>
              <div className="flex gap-2"><Button size="lg" disabled={!pick.length} onClick={apply}>Add {pick.length} {pick.length === 1 ? 'item' : 'items'}</Button><Button size="lg" variant="secondary" onClick={async () => { await data.discardAiJob(job.id); setJob(null); }}>Throw it away</Button></div>
            </section>
          )}
        </div>
      )}
    </AdultGate>
  );
}
