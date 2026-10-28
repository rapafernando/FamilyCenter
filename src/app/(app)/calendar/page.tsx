'use client';
import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/cn';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { addDays, dayRangeUTC, describeTimes, daysUntil, fmtTime } from '@/lib/time';
import { groupByDay, step, windowFor, type View } from '@/lib/calendar';
import type { Occurrence } from '@/lib/types';
import { Button, FabLink, ProfileChip, Segmented } from '@/components/ui/controls';
import { Countdown, EventCard } from '@/components/ui/calendar';
import { Banner } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/AppShell';

const href = (o: Occurrence) => `/calendar/event/${o.eventId}?rid=${encodeURIComponent(o.recurrenceId)}`;

function EventLink({ o, tz, color, person, short }: { o: Occurrence; tz: string; color: string | null; person: string; short?: boolean }) {
  return (
    <Link href={href(o)} className="block rounded-md">
      <EventCard title={o.title} time={short && !o.allDay ? fmtTime(o.startsAt, tz) : describeTimes({ ...o, tz })} person={person} color={color} source={o.source} repeats={o.repeats} compact />
    </Link>
  );
}

function CalendarInner() {
  const { household, profiles, today, surface } = useApp();
  const sp = useSearchParams(); const router = useRouter();
  const view = (sp.get('view') as View) || household.defaultView;
  const date = sp.get('date') || today;
  const only = sp.get('who')?.split(',').filter(Boolean) ?? [];
  const tz = household.timezone;
  const win = useMemo(() => windowFor(view, date, household.weekStartsOn), [view, date, household.weekStartsOn]);
  const range = useMemo(() => dayRangeUTC(win.start, win.endExclusive, tz), [win, tz]);
  const q = useQuery(() => data.listEvents({ ...range, profileIds: only.length ? only : undefined }), [range.from, range.to, only.join(',')]);
  const cds = useQuery(() => data.listCountdowns(), []);
  const byDay = useMemo(() => groupByDay(q.data ?? [], tz), [q.data, tz]);
  const person = (id: string) => profiles.find((p) => p.id === id);
  const go = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString()); Object.entries(patch).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v)));
    router.replace(`/calendar?${n.toString()}`, { scroll: false });
  };
  const people = profiles.filter((p) => p.kind !== 'other');
  const days: string[] = []; for (let d = win.start; d < win.endExclusive; d = addDays(d, 1)) days.push(d);
  const upcoming = (cds.data ?? []).filter((c) => c.showOnDisplay && daysUntil(c.targetDate, today) >= 0 && daysUntil(c.targetDate, today) <= 120).slice(0, 3);
  const total = q.data?.length ?? 0;

  return (
    <>
      <PageHeader title="Calendar" actions={
        <>
          <Segmented<View> label="Calendar view" value={view} onChange={(v) => go({ view: v })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label={`Previous ${view}`} onClick={() => go({ date: step(view, date, -1) })} className="px-3"><ChevronLeft aria-hidden className="h-6 w-6" /></Button>
        <Button variant="secondary" onClick={() => go({ date: null })}>Today</Button>
        <Button variant="secondary" aria-label={`Next ${view}`} onClick={() => go({ date: step(view, date, 1) })} className="px-3"><ChevronRight aria-hidden className="h-6 w-6" /></Button>
        <h2 className="ml-2 font-display text-xl text-ink" aria-live="polite">{win.label}</h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show events for">
        {people.map((p) => {
          const on = !only.length || only.includes(p.id);
          return <ProfileChip key={p.id} name={p.name} color={p.color} selected={on} size="sm"
            onClick={() => { const cur = only.length ? only : people.map((x) => x.id); const next = cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]; go({ who: next.length === people.length || !next.length ? null : next.join(',') }); }} />;
        })}
      </div>
      {upcoming.length > 0 && view !== 'month' && (
        <div className="mb-3 flex flex-wrap gap-2">{upcoming.map((c) => <Countdown key={c.id} title={c.title} days={daysUntil(c.targetDate, today)} color={null} />)}</div>
      )}
      {q.error && <Banner tone="danger" title="Could not load events" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Your events are safe. Check the connection and try again.</Banner>}
      {q.loading && !q.data && <div role="status" aria-label="Loading events" className="grid gap-2 md:grid-cols-7">{Array.from({ length: view === 'week' ? 7 : 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>}
      {q.data && total === 0 && view !== 'month' && (
        <div className="rounded-lg border-2 border-dashed border-line-input p-6 text-center">
          <p className="text-lg font-bold text-ink">{view === 'day' ? 'Nothing planned today' : 'Nothing planned this week'}</p>
          <p className="mb-3 text-base text-muted">Add an event and it shows up on every screen in the house.</p>
          <Link href={`/calendar/event/new?date=${view === 'day' ? date : today}`} className="inline-flex min-h-target items-center rounded-md bg-accent px-5 font-bold text-accent-on">Add an event</Link>
        </div>
      )}
      {q.data && view === 'day' && total > 0 && (
        <div className="flex max-w-[48rem] flex-col gap-2">
          {(byDay.get(date) ?? []).map((o) => <EventLink key={o.key} o={o} tz={tz} color={person(o.profileId)?.color ?? null} person={person(o.profileId)?.name ?? ''} />)}
        </div>
      )}
      {q.data && view === 'week' && total > 0 && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const dt = DateTime.fromISO(d), isToday = d === today, list = byDay.get(d) ?? [];
            return (
              <section key={d} aria-label={dt.toFormat('cccc LLLL d')} className={cn('min-w-0 rounded-md', surface === 'wall' ? 'bg-surface p-2' : 'md:bg-surface md:p-2')}>
                <h3 className={cn('mb-2 flex items-baseline gap-2 text-base', isToday ? 'font-bold text-ink' : 'text-muted')}>
                  <span className={cn('rounded-pill px-2 py-0.5 font-display text-lg', isToday && 'bg-accent text-accent-on')}>{dt.toFormat('d')}</span>{dt.toFormat('ccc')}
                </h3>
                <div className="flex flex-col gap-2">
                  {list.length === 0 ? <p className="px-1 text-sm text-muted md:hidden">Nothing planned</p> : list.map((o) => <EventLink short key={o.key + d} o={o} tz={tz} color={person(o.profileId)?.color ?? null} person={person(o.profileId)?.name ?? ''} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {q.data && view === 'month' && (
        <div>
          <div className="mb-1 hidden grid-cols-7 gap-1 text-center text-sm font-bold text-muted md:grid" aria-hidden>
            {days.slice(0, 7).map((d) => <span key={d}>{DateTime.fromISO(d).toFormat('ccc')}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const dt = DateTime.fromISO(d), list = byDay.get(d) ?? [], isToday = d === today, inMonth = dt.month === DateTime.fromISO(date).month;
              return (
                <Link key={d} href={`/calendar?view=day&date=${d}`} aria-label={`${dt.toFormat('cccc LLLL d')}, ${list.length ? `${list.length} event${list.length > 1 ? 's' : ''}` : 'nothing planned'}`}
                  className={cn('flex min-h-[5.5rem] min-w-0 flex-col gap-1 rounded-md border-2 p-1', isToday ? 'border-accent bg-accent-tint' : 'border-line bg-surface', !inMonth && 'opacity-60')}>
                  <span className={cn('font-display text-base', isToday ? 'text-ink' : 'text-muted')}>{dt.toFormat('d')}</span>
                  <span className="hidden flex-col gap-0.5 md:flex">
                    {list.slice(0, 3).map((o) => <span key={o.key + d} {...markerAttrs(person(o.profileId)?.color ?? null)} className="truncate rounded-sm border-l-4 border-m-solid bg-m-tint px-1 text-xs font-bold text-ink">{o.title}</span>)}
                    {list.length > 3 && <span className="text-xs text-muted">+{list.length - 3} more</span>}
                  </span>
                  <span className="flex flex-wrap gap-0.5 md:hidden" aria-hidden>{list.slice(0, 6).map((o) => <Dot key={o.key + d} color={person(o.profileId)?.color ?? null} />)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <FabLink label="Add event" href={`/calendar/event/new?date=${view === 'day' ? date : today}`} />
    </>
  );
}

import { markerAttrs } from '@/lib/marker';
function Dot({ color }: { color: string | null }) {
  return <span {...markerAttrs(color)} className="h-2.5 w-2.5 rounded-pill bg-m-solid" />;
}

export default function CalendarPage() { return <Suspense fallback={<Skeleton className="h-40" />}><CalendarInner /></Suspense>; }
