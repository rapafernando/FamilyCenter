'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getVersion, subscribe } from './store';

/** Re-render whenever the data changes (this tab, or another tab on the same browser). */
export function useDataVersion() {
  return useSyncExternalStore(subscribe, getVersion, () => -1);
}

export type Query<T> = { data: T | undefined; loading: boolean; error: Error | null; reload: () => void };

/** Run an async read, re-run it whenever the data changes. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const version = useDataVersion();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const first = useRef(true);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    if (version === -1) return;
    let live = true;
    if (first.current) setLoading(true);
    fnRef.current().then((d) => { if (live) { setData(d); setError(null); setLoading(false); first.current = false; } })
      .catch((e: Error) => { if (live) { setError(e); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps]);
  return { data, loading, error, reload: () => { first.current = true; setTick((t) => t + 1); } };
}
