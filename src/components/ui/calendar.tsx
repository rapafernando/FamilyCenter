import { BellRing, CloudDownload, Repeat } from 'lucide-react';
import { cn } from '@/lib/cn';
import { markerAttrs, type MarkerValue } from '@/lib/marker';

/* ---------- Event card: tint wash, a pen-width bar on the left, the person's name always in text ---------- */
export type EventCardProps = {
  title: string; time: string; person: string; color: MarkerValue | null;
  source?: 'local' | 'synced' | 'imported'; repeats?: boolean; alertDue?: boolean; stale?: boolean; compact?: boolean;
};
export function EventCard({ title, time, person, color, source = 'local', repeats, alertDue, stale, compact }: EventCardProps) {
  return (
    <article {...markerAttrs(color)}
      className={cn('relative overflow-hidden rounded-md border-l-[0.4rem] border-m-solid bg-m-tint py-2 pl-3 pr-3',
        alertDue && 'outline outline-[3px] outline-offset-0 outline-m-solid', stale && 'opacity-80')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn('font-bold text-ink', compact ? 'text-sm' : 'text-base')}>{title}</h3>
        <span className="flex shrink-0 items-center gap-1 text-muted">
          {repeats && <Repeat aria-label="Repeats" className="h-4 w-4" />}
          {source === 'synced' && <CloudDownload aria-label="From Google Calendar" className="h-4 w-4" />}
          {alertDue && <BellRing aria-label="Starting now" className="h-4 w-4 text-ink" />}
        </span>
      </div>
      <p className="text-sm text-muted">{time} · {person}</p>
    </article>
  );
}

/* ---------- Countdown ---------- */
export function Countdown({ title, days, color }: { title: string; days: number; color: MarkerValue | null }) {
  return (
    <div {...markerAttrs(color)} className="flex items-center gap-3 rounded-md border-2 border-m-solid bg-surface px-3 py-2">
      <span className="font-display text-xl text-ink">{days === 0 ? 'Today' : days}</span>
      <span className="text-sm text-muted">{days === 0 ? title : days === 1 ? `day until ${title}` : `days until ${title}`}</span>
    </div>
  );
}
