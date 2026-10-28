'use client';
import { useState } from 'react';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { PinPad } from '@/components/ui/misc';

/** Settings and anything that edits the household need a parent: a signed-in adult, or the PIN on a wall display. */
export function AdultGate({ children }: { children: React.ReactNode }) {
  const { unlocked, unlock, session } = useApp();
  const pin = useQuery(() => data.hasPin(), []);
  const [err, setErr] = useState<string>();
  if (unlocked) return <>{children}</>;
  if (!session.user && pin.data === false) return <>{children}</>; // no PIN set yet: the screen is open
  if (!session.user && pin.data) {
    return (
      <div className="mx-auto mt-6 flex max-w-[24rem] flex-col gap-4">
        <h1 className="text-center font-display text-xl text-ink">Parents only</h1>
        <PinPad error={err} onComplete={async (p) => { if (await data.verifyPin(p)) { setErr(undefined); unlock(); } else setErr('That PIN did not match. Try again.'); }} />
      </div>
    );
  }
  if (pin.loading) return <p className="text-muted" role="status">Loading…</p>;
  return <p className="rounded-md bg-warning-tint p-4 text-ink">Your role can look but not change settings. Ask the household owner.</p>;
}
