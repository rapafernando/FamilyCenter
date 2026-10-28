'use client';
import { useState } from 'react';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { PinPad } from '@/components/ui/misc';

/** Settings and anything that edits the household need a parent: a signed-in adult, or the PIN on a wall display. */
export function AdultGate({ children, anySignedIn = false }: { children: React.ReactNode; /** True for pages about the person's own sign-in (account, sign out): a signed-in viewer may use them too. */ anySignedIn?: boolean }) {
  const { unlocked, unlock, session } = useApp();
  const pin = useQuery(() => data.hasPin(), []);
  const [err, setErr] = useState<string>();
  if (unlocked || (anySignedIn && session.user)) return <>{children}</>;
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

/** Screens that add or change things. A viewer sees a plain note instead of a form that would only be refused. */
export function EditorsOnly({ children }: { children: React.ReactNode }) {
  const { isAdult } = useApp();
  if (isAdult) return <>{children}</>;
  return <p className="rounded-md bg-warning-tint p-4 text-ink">Your role can look but not change things. Ask the household owner if you need to add or edit.</p>;
}
