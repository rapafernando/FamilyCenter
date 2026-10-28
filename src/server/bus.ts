import pg from 'pg';
import { env } from './env';

// One Postgres connection listens for "something changed" and hands it to every open stream for that household.
type Fn = (type: string) => void;
type Bus = { subs: Map<string, Set<Fn>>; client?: pg.Client; starting?: boolean };
const g = globalThis as unknown as { __bus?: Bus };
const bus: Bus = (g.__bus ??= { subs: new Map<string, Set<Fn>>() });

async function ensureListener() {
  if (bus.client || bus.starting) return;
  bus.starting = true;
  try {
    const c = new pg.Client({ connectionString: env.databaseUrl });
    c.on('notification', (m) => {
      try { const p = JSON.parse(m.payload ?? '{}') as { h?: string; t?: string }; if (p.h) bus.subs.get(p.h)?.forEach((f) => f(p.t ?? 'change')); } catch { /* ignore a bad payload */ }
    });
    const drop = () => { if (bus.client === c) bus.client = undefined; c.end().catch(() => {}); setTimeout(() => { if (bus.subs.size) void ensureListener(); }, 3000); };
    c.on('error', drop); c.on('end', drop);
    await c.connect(); await c.query('listen changes');
    bus.client = c;
  } catch { setTimeout(() => { if (bus.subs.size) void ensureListener(); }, 3000); }
  finally { bus.starting = false; }
}

export function subscribe(householdId: string, fn: Fn) {
  let set = bus.subs.get(householdId); if (!set) bus.subs.set(householdId, (set = new Set()));
  set.add(fn); void ensureListener();
  return () => { set!.delete(fn); if (!set!.size) bus.subs.delete(householdId); };
}
