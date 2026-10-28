'use client';
import { useId } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { markerAttrs, type MarkerValue } from '@/lib/marker';

/* ---------- Task row: big check, emoji name for pre-readers, marker strike when done ---------- */
export function TaskRow({ title, emoji, color, done, stars, onToggle, locked, trailing, meta }:
  { title: string; emoji?: string; color: MarkerValue | null; done: boolean; stars?: number; onToggle: (v: boolean) => void; locked?: boolean; trailing?: React.ReactNode; meta?: string }) {
  const id = useId();
  return (
    <div {...markerAttrs(color)} className="flex min-h-primary items-center gap-3 rounded-md bg-surface px-3 shadow-lift">
      <input id={id} type="checkbox" checked={done} disabled={locked} onChange={(e) => onToggle(e.target.checked)} className="peer sr-only" />
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-3 py-2 peer-disabled:cursor-not-allowed">
        <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-[3px] border-m-solid transition-colors duration-fast',
          done ? 'bg-m-solid text-m-on' : 'bg-surface')}>
          {done && <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </span>
        {emoji && <span aria-hidden className="text-xl">{emoji}</span>}
        <span className={cn('strike text-base font-bold', done && 'text-muted')} data-done={done}>{title}</span>
        {meta && <span className="text-sm text-muted">{meta}</span>}
      </label>
      {!!stars && (
        <span className="flex items-center gap-1 text-sm font-bold text-ink">
          <Star aria-hidden className="h-4 w-4 fill-current" />{stars}<span className="sr-only"> stars</span>
        </span>
      )}
      {trailing}
    </div>
  );
}

/* ---------- Star sticker: a slightly tilted star, the reward currency ---------- */
export function StarSticker({ className, burst }: { className?: string; burst?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn('h-12 w-12 -rotate-6', burst && 'star-pop', className)}>
      <path d="M24 3l5.6 12.2 13.3 1.5-9.9 9 2.8 13.1L24 32.1 12.2 38.8 15 25.7 5.1 16.7l13.3-1.5L24 3z" fill="#F2B705" stroke="#101820" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------- Star counter ---------- */
export function StarCounter({ name, color, balance }: { name: string; color: MarkerValue | null; balance: number }) {
  return (
    <div {...markerAttrs(color)} className="flex items-center gap-3 rounded-md border-2 border-m-solid bg-m-tint px-3 py-2">
      <StarSticker className="h-10 w-10" />
      <div>
        <p className="font-display text-xl leading-none text-ink">{balance}</p>
        <p className="text-sm text-muted">{name}’s stars</p>
      </div>
    </div>
  );
}

/* ---------- Reward card ---------- */
export function RewardCard({ title, emoji, cost, balance, color, onRedeem, footer }:
  { title: string; emoji?: string; cost: number; balance: number; color: MarkerValue | null; onRedeem: () => void; footer?: React.ReactNode }) {
  const enough = balance >= cost;
  return (
    <div {...markerAttrs(color)} className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
      <h3 className="text-lg text-ink">{emoji && <span aria-hidden className="mr-2">{emoji}</span>}{title}</h3>
      <p className="flex items-center gap-1 text-sm text-muted"><Star aria-hidden className="h-4 w-4 fill-current text-ink" />{cost} stars</p>
      <button type="button" onClick={onRedeem} disabled={!enough}
        className="min-h-target rounded-md bg-m-solid px-4 font-bold text-m-on disabled:bg-surface disabled:text-muted disabled:outline disabled:outline-2 disabled:outline-line-input">
        {enough ? 'Redeem' : `${cost - balance} more to go`}
      </button>
      {footer}
    </div>
  );
}

/* ---------- Checklist item (grocery and custom lists) ---------- */
export function ChecklistItem({ text, done, color, onToggle }:
  { text: string; done: boolean; color: MarkerValue | null; onToggle: (v: boolean) => void }) {
  const id = useId();
  return (
    <div {...markerAttrs(color)} className="flex min-h-target items-center border-b border-line">
      <input id={id} type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} className="peer sr-only" />
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-3 py-2">
        <span aria-hidden className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border-[3px] border-m-solid', done ? 'bg-m-solid text-m-on' : 'bg-surface')}>
          {done && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
        </span>
        <span className={cn('strike text-base', done && 'text-muted')} data-done={done}>{text}</span>
      </label>
    </div>
  );
}
