'use client';
import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { markerAttrs } from '@/lib/marker';
import { MARKER_PRESETS } from '@/lib/markers.generated';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, ColorPicker, Field } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChecklistItem } from '@/components/ui/tasks';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

export default function Lists() {
  const notify = useNotice();
  const q = useQuery(() => data.listLists(), []);
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false); const [nl, setNl] = useState<{ name: string; emoji: string; color: string }>({ name: '', emoji: '📝', color: MARKER_PRESETS.sky });
  const [askDelete, setAskDelete] = useState(false);
  const lists = q.data ?? [];
  const list = lists.find((l) => l.id === sel) ?? lists[0];
  const open = list?.items.filter((i) => !i.done) ?? []; const done = list?.items.filter((i) => i.done) ?? [];

  const guard = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); } catch (e) { setErr(errMsg(e)); } };
  const add = (e: React.FormEvent) => { e.preventDefault(); if (!list) return; setBusy(true); guard(async () => { await data.addItem(list.id, text); setText(''); }).finally(() => setBusy(false)); };

  return (
    <>
      <PageHeader title="Lists" />
      {q.error && <Banner tone="danger" title="Could not load your lists" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Nothing was lost. Try again.</Banner>}
      {q.loading && !q.data && <SkeletonList rows={5} />}
      {q.data && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
           <div role="tablist" aria-label="Your lists" className="flex flex-wrap gap-2">
            {lists.map((l) => {
              const on = l.id === list?.id; const left = l.items.filter((i) => !i.done).length;
              return (
                <button key={l.id} role="tab" type="button" aria-selected={on} onClick={() => { setSel(l.id); setErr(''); }} {...markerAttrs(l.color)}
                  className={cn('inline-flex min-h-target items-center gap-2 rounded-pill border-2 px-4 font-bold text-ink', on ? 'border-m-solid bg-m-tint' : 'border-line-input bg-surface')}>
                  <span aria-hidden>{l.emoji}</span><span className="max-w-[12rem] truncate">{l.name}</span><span className="text-sm text-muted">{left}<span className="sr-only"> left</span></span>
                </button>
              );
            })}
           </div>
            <Button variant="secondary" onClick={() => setMaking((v) => !v)} aria-expanded={making}><Plus aria-hidden className="h-5 w-5" />New list</Button>
          </div>
          {making && (
            <AdultGate>
              <form className="mb-4 flex max-w-[34rem] flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4" onSubmit={(e) => { e.preventDefault(); guard(async () => { const l = await data.createList(nl); setSel(l.id); setMaking(false); setNl({ name: '', emoji: '📝', color: MARKER_PRESETS.sky }); }); }}>
                <h2 className="font-display text-lg text-ink">New list</h2>
                <Field label="Name" required value={nl.name} onChange={(e) => setNl({ ...nl, name: e.target.value })} placeholder="Packing for camp" />
                <Field label="Picture" value={nl.emoji} maxLength={2} onChange={(e) => setNl({ ...nl, emoji: e.target.value })} />
                <ColorPicker label="Colour" value={nl.color} onChange={(c) => setNl({ ...nl, color: c })} />
                <div className="flex gap-2"><Button type="submit">Create list</Button><Button type="button" variant="secondary" onClick={() => setMaking(false)}>Cancel</Button></div>
              </form>
            </AdultGate>
          )}
          {err && <div className="mb-3"><Banner tone="danger" title="That did not work">{err}</Banner></div>}
          {list && (
            <section aria-label={list.name} {...markerAttrs(list.color)} className="max-w-[40rem] rounded-lg border-2 border-m-solid bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="truncate font-display text-xl text-ink"><span aria-hidden className="mr-2">{list.emoji}</span>{list.name}</h2>
                {!list.isGrocery && <Button size="sm" variant="ghost" aria-label={`Delete list ${list.name}`} onClick={() => setAskDelete(true)}><Trash2 aria-hidden className="h-4 w-4" />Delete</Button>}
              </div>
              <form onSubmit={add} className="mb-2 flex items-end gap-2">
                <div className="flex-1"><Field label={`Add to ${list.name}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={list.isGrocery ? 'Oat milk' : 'Sunscreen'} /></div>
                <Button type="submit" size="lg" loading={busy}>Add</Button>
              </form>
              {list.items.length === 0 && <p className="rounded-md border-2 border-dashed border-line-input p-4 text-center text-base text-muted">Nothing here yet. Type an item above and press Add.</p>}
              <ul className="m-0 list-none p-0">
                {open.map((i) => (
                  <li key={i.id} className="flex items-center">
                    <div className="flex-1"><ChecklistItem text={i.text} done={false} color={list.color} onToggle={(v) => guard(() => data.setItemDone(i.id, v))} /></div>
                    <button type="button" aria-label={`Remove ${i.text}`} onClick={() => guard(() => data.deleteItem(i.id))} className="flex min-h-target min-w-target items-center justify-center text-muted"><X aria-hidden className="h-5 w-5" /></button>
                  </li>
                ))}
              </ul>
              {done.length > 0 && (
                <>
                  <div className="mt-3 flex items-center justify-between"><h3 className="text-base font-bold text-muted">Checked off ({done.length})</h3>
                    <Button size="sm" variant="secondary" onClick={() => guard(async () => { const n = await data.clearChecked(list.id); notify({ tone: 'success', title: `Cleared ${n} ${n === 1 ? 'item' : 'items'}` }); })}>Clear checked</Button></div>
                  <ul className="m-0 list-none p-0">{done.map((i) => <li key={i.id}><ChecklistItem text={i.text} done color={list.color} onToggle={(v) => guard(() => data.setItemDone(i.id, v))} /></li>)}</ul>
                </>
              )}
            </section>
          )}
          <ChoiceDialog open={askDelete} danger title={`Delete “${list?.name}”?`} detail="The list and everything on it will be removed." choices={[{ value: 'go', label: 'Delete list' }]}
            onChoose={() => { setAskDelete(false); guard(async () => { await data.deleteList(list!.id); setSel(null); }); }} onCancel={() => setAskDelete(false)} />
        </>
      )}
    </>
  );
}
