'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, ListChecks, ShoppingBasket, UtensilsCrossed, Settings, CloudSun, RefreshCw, TriangleAlert } from 'lucide-react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/cn';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';

export const NAV = [
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/chores', label: 'Chores', Icon: ListChecks },
  { href: '/lists', label: 'Lists', Icon: ShoppingBasket },
  { href: '/meals', label: 'Meals', Icon: UtensilsCrossed },
  { href: '/settings', label: 'More', Icon: Settings },
] as const;
const activeFor = (path: string, href: string) => path === href || path.startsWith(href + '/') || (href === '/chores' && path.startsWith('/rewards')) || (href === '/meals' && path.startsWith('/recipes'));

export function useClock(tz: string) {
  const [now, setNow] = useState<DateTime | null>(null);
  useEffect(() => { const tick = () => setNow(DateTime.now().setZone(tz)); tick(); const t = setInterval(tick, 10000); return () => clearInterval(t); }, [tz]);
  return now;
}

export function SyncStatus({ className }: { className?: string }) {
  const q = useQuery(() => data.listConnections(), []);
  const c = q.data?.[0];
  if (!c) return null;
  const bad = c.status === 'needs_reauth' || c.status === 'error';
  const ago = c.lastSyncedAt ? DateTime.fromISO(c.lastSyncedAt).toRelative({ style: 'long' }) : 'not yet';
  const Icon = bad ? TriangleAlert : RefreshCw;
  return (
    <Link href="/settings/calendars" className={cn('inline-flex min-h-target items-center gap-2 rounded-md text-sm', bad ? 'font-bold text-danger' : 'text-muted', className)}>
      <Icon aria-hidden className="h-4 w-4" />
      {bad ? 'Google needs to be reconnected' : `Google synced ${ago}`}
    </Link>
  );
}

function WallHeader() {
  const { household } = useApp();
  const now = useClock(household.timezone);
  const w = useQuery(() => data.getWeather(), []);
  return (
    <header className="flex items-end justify-between gap-4 px-6 pt-4">
      <div>
        <p className="font-display text-2xl text-ink">{now ? now.toFormat('cccc') : ' '}</p>
        <p className="text-lg text-muted">{now ? now.toFormat('LLLL d') : ' '}</p>
      </div>
      <p className="font-display text-clock text-ink" aria-label={now ? `Time ${now.toFormat('h:mm a')}` : undefined}>{now ? now.toFormat('h:mm') : ''}</p>
      <div className="flex flex-col items-end">
        {w.data && <span className="inline-flex items-center gap-2 rounded-pill border-2 border-line bg-surface px-3 py-1 text-base text-ink"><CloudSun aria-hidden className="h-5 w-5" />{w.data.tempF}° {w.data.label}</span>}
        <SyncStatus />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { surface } = useApp();
  const path = usePathname();
  if (surface === 'wall') {
    return (
      <div className="grid min-h-screen" style={{ gridTemplateColumns: '6rem minmax(0,1fr)' }}>
        <nav aria-label="Main" className="sticky top-0 flex h-screen flex-col items-center gap-2 border-r-2 border-line bg-surface py-4">
          {NAV.map(({ href, label, Icon }) => {
            const on = activeFor(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                className={cn('flex min-h-primary w-[5rem] flex-col items-center justify-center gap-0.5 rounded-md text-xs font-bold', on ? 'bg-accent text-accent-on' : 'text-ink')}>
                <Icon aria-hidden className="h-6 w-6" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-col"><WallHeader /><main id="main" className="flex-1 px-6 pb-8 pt-3">{children}</main></div>
      </div>
    );
  }
  return (
    <div className="min-h-screen pb-24">
      <main id="main" className="mx-auto w-full max-w-[1100px] px-4 pt-4">{children}</main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ href, label, Icon }) => {
          const on = activeFor(path, href);
          return (
            <Link key={href} href={href} aria-current={on ? 'page' : undefined}
              className={cn('flex min-h-[4rem] min-w-[4rem] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold', on ? 'text-accent' : 'text-muted')}>
              <Icon aria-hidden className={cn('h-6 w-6', on && 'stroke-[2.75]')} />{label}
              <span aria-hidden className={cn('h-1 w-6 rounded-pill', on ? 'bg-accent' : 'bg-transparent')} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({ title, back, actions, sub }: { title: string; back?: { href: string; label: string }; actions?: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        {back && <Link href={back.href} className="inline-flex min-h-target items-center text-base font-bold text-accent underline">‹ {back.label}</Link>}
        <h1 className="font-display text-xl text-ink">{title}</h1>
        {sub && <p className="text-base text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
