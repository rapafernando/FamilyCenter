'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { data, startLive } from './data';
import { useQuery } from './data/hooks';
import { setSurfacePref, sessionDeviceId, surfacePref } from './data/store';
import { todayIn } from './time';
import { ApiError, type Household, type Profile, type Session } from './types';
import { Banner } from '@/components/ui/misc';

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again in a moment.');

/* ---------- notices (replaces toasts: they stay until read or dismissed) ---------- */
type Notice = { id: number; tone: 'info' | 'success' | 'warning' | 'danger'; title: string; body?: string };
const NoticeCtx = createContext<(n: Omit<Notice, 'id'>) => void>(() => {});
export const useNotice = () => useContext(NoticeCtx);
export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Notice[]>([]);
  const push = useCallback((n: Omit<Notice, 'id'>) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { ...n, id }]);
    if (n.tone === 'success' || n.tone === 'info') setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 9000);
  }, []);
  return (
    <NoticeCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-50 mx-auto flex w-[min(40rem,94vw)] flex-col gap-2" aria-live="polite">
        {list.map((n) => (
          <div key={n.id} className="pointer-events-auto rounded-md bg-surface shadow-pop">
            <Banner tone={n.tone} title={n.title} action={<button type="button" onClick={() => setList((l) => l.filter((x) => x.id !== n.id))} className="min-h-target min-w-target rounded-md px-2 text-sm font-bold text-ink underline">Dismiss</button>}>{n.body}</Banner>
          </div>
        ))}
      </div>
    </NoticeCtx.Provider>
  );
}

/* ---------- app context: session, household, people, today ---------- */
export type Surface = 'wall' | 'handheld';
type App = { session: Session; household: Household; profiles: Profile[]; today: string; surface: Surface; setSurface: (s: Surface | null) => void; isAdult: boolean; unlocked: boolean; unlock: () => void };
const AppCtx = createContext<App | null>(null);
export const useApp = () => { const v = useContext(AppCtx); if (!v) throw new Error('useApp needs <Gate>'); return v; };
export const useColor = () => { const { profiles } = useApp(); return (id: string | null | undefined) => profiles.find((p) => p.id === id)?.color ?? null; };

export function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const path = usePathname();
  const sess = useQuery(() => data.getSession(), []);
  const hh = useQuery(() => data.getHousehold(), []);
  const pr = useQuery(() => data.listProfiles(), []);
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const [, force] = useState(0);
  const s = sess.data;
  const signedIn = !!(s && (s.user || s.deviceId));
  useEffect(() => (signedIn ? startLive() : undefined), [signedIn]);
  useEffect(() => { if (s && !s.user && !s.deviceId) router.replace('/welcome'); }, [s, router]);
  const surfaceChoice = typeof window === 'undefined' ? null : surfacePref();
  const surface: Surface = s?.deviceId || surfaceChoice === 'wall' ? 'wall' : 'handheld';
  useEffect(() => { document.documentElement.dataset.surface = surface; }, [surface]);
  const value = useMemo<App | null>(() => {
    if (!s || !hh.data || !pr.data || (!s.user && !s.deviceId)) return null;
    const isAdult = s.user ? s.role !== 'viewer' : true;
    const unlocked = s.user ? s.role === 'owner' || s.role === 'adult' : Date.now() < unlockedUntil;
    return { session: s, household: hh.data, profiles: pr.data, today: todayIn(hh.data.timezone), surface, isAdult, unlocked,
      setSurface: (v) => { setSurfacePref(v); force((n) => n + 1); }, unlock: () => setUnlockedUntil(Date.now() + 5 * 60000) };
  }, [s, hh.data, pr.data, surface, unlockedUntil]);
  if (sess.error || (signedIn && (hh.error || pr.error))) return <div className="p-6"><Banner tone="danger" title="This screen could not load">Reload the page. If it keeps happening, check that the app is running.</Banner></div>;
  if (!value) return <div className="p-6 text-muted" role="status">Loading…</div>;
  void path; void sessionDeviceId;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
