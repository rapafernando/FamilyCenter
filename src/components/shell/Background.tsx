'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { AlertDialog } from '@/components/ui/misc';
import { describeTimes } from '@/lib/time';

/** Light and dark: this browser's choice, the screen's own setting on a display, or the device. */
export function ThemeSync() {
  const { session, household } = useApp();
  const dev = useQuery(() => (session.deviceId ? data.getDevice(session.deviceId) : Promise.resolve(null)), [session.deviceId]);
  useEffect(() => {
    const pick = (): 'light' | 'dark' | null => {
      let choice: string | null = null; try { choice = localStorage.getItem('fc-theme'); } catch { /* ignore */ }
      const t = session.deviceId ? dev.data?.config.theme ?? 'auto' : (choice ?? 'auto');
      if (t === 'light' || t === 'dark') return t;
      if (session.deviceId) { const h = DateTime.now().setZone(household.timezone).hour; return h >= 20 || h < 6 ? 'dark' : 'light'; }
      return null; // follow the device setting
    };
    const apply = () => { const v = pick(); if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; };
    apply(); const t = setInterval(apply, 60000); return () => clearInterval(t);
  }, [session.deviceId, dev.data, household.timezone]);
  return null;
}

/** Event alerts (S08): a loud, easy-to-dismiss box when something is about to start. Shown on screens, not phones. */
export function AlertHost() {
  const { surface, household } = useApp();
  const [queue, setQueue] = useState<{ key: string; title: string; detail: string }[]>([]);
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (surface !== 'wall') return;
    let live = true;
    const check = async () => {
      const now = DateTime.now();
      const occ = await data.listEvents({ from: now.minus({ minutes: 5 }).toUTC().toISO()!, to: now.plus({ days: 1 }).toUTC().toISO()! });
      const profiles = await data.listProfiles();
      const due = occ.filter((o) => !o.allDay && o.alertMinutes.some((m) => { const at = DateTime.fromISO(o.startsAt).minus({ minutes: m }); return at <= now && at > now.minus({ minutes: 1 }); }) && !seen.current.has(o.key));
      if (!live || !due.length) return;
      due.forEach((o) => seen.current.add(o.key));
      setQueue((q) => [...q, ...due.map((o) => ({ key: o.key, title: `${o.title} starts ${DateTime.fromISO(o.startsAt) <= now ? 'now' : 'soon'}`, detail: `${profiles.find((p) => p.id === o.profileId)?.name ?? ''} · ${describeTimes({ ...o, tz: household.timezone })}` }))]);
    };
    check(); const t = setInterval(check, 20000); return () => { live = false; clearInterval(t); };
  }, [surface, household.timezone]);
  const cur = queue[0];
  return <AlertDialog open={!!cur} title={cur?.title ?? ''} detail={cur?.detail ?? ''} autoDismissSeconds={60} onClose={() => setQueue((q) => q.slice(1))} />;
}

/** After a few minutes with no touch, a wall display shows the photo screensaver (if there are photos). */
export function IdleWatcher() {
  const { surface, session } = useApp();
  const router = useRouter();
  const dev = useQuery(() => (session.deviceId ? data.getDevice(session.deviceId) : Promise.resolve(null)), [session.deviceId]);
  useEffect(() => {
    if (surface !== 'wall') return;
    const minutes = dev.data?.config.idleMinutes ?? 5;
    if (!minutes) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(async () => {
      if (Date.now() - last < minutes * 60000) return;
      const albums = await data.listAlbums();
      if (albums.some((a) => a.showOnDisplay && a.photos.length)) router.push('/screensaver');
      last = Date.now();
    }, 15000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [surface, dev.data, router]);
  return null;
}
