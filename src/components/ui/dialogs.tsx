'use client';
import { useEffect, useRef } from 'react';
import { Button } from './controls';

/** A native <dialog> that asks one question with a few answers. Escape or a tap outside means cancel. */
export function ChoiceDialog<T extends string>({ open, title, detail, choices, onChoose, onCancel, danger }:
  { open: boolean; title: string; detail?: string; choices: { value: T; label: string }[]; onChoose: (v: T) => void; onCancel: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} aria-labelledby="choice-title" onClose={onCancel} onClick={(e) => { if (e.target === ref.current) onCancel(); }}
      className="w-[min(28rem,92vw)] rounded-lg border-2 border-line bg-surface p-0 text-ink shadow-pop">
      <div className="flex flex-col gap-3 p-5">
        <h2 id="choice-title" className="font-display text-xl">{title}</h2>
        {detail && <p className="text-base text-muted">{detail}</p>}
        {choices.map((c, i) => <Button key={c.value} variant={danger ? 'danger' : i === 0 ? 'primary' : 'secondary'} onClick={() => onChoose(c.value)}>{c.label}</Button>)}
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </dialog>
  );
}
