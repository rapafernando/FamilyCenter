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


/** Every Settings screen. Always asks for the parent PIN (for everyone, on every device), and makes a household without a PIN choose one first. */
export function SettingsGate({ children }: { children: React.ReactNode }) {
  const { settingsOpen, unlock, isAdult } = useApp();
  const pin = useQuery(() => data.hasPin(), []);
  const [err, setErr] = useState<string>();
  const [first, setFirst] = useState<string | null>(null);
  if (!isAdult) return <p className="rounded-md bg-warning-tint p-4 text-ink">Your role can look but not change settings. Ask the household owner.</p>;
  if (settingsOpen) return <>{children}</>;
  if (pin.loading) return <p className="text-muted" role="status">Loading…</p>;
  if (pin.data === false) {
    return (
      <div className="mx-auto mt-6 flex max-w-[24rem] flex-col gap-4">
        <h1 className="text-center font-display text-xl text-ink">Choose a parent PIN</h1>
        <p className="text-center text-base text-muted">Settings are kept for parents. Pick 4 digits and keep them to yourselves; every phone and screen will ask for them.</p>
        <PinPad error={err} prompt={first ? 'Enter it once more' : 'Choose 4 digits'} onComplete={async (p) => {
          if (first === null) { setFirst(p); setErr(undefined); return; }
          if (p !== first) { setFirst(null); setErr('Those did not match. Start again.'); return; }
          try { await data.setPin(p); setErr(undefined); unlock(); pin.reload(); } catch (x) { setFirst(null); setErr(x instanceof Error ? x.message : 'Could not save the PIN.'); }
        }} />
      </div>
    );
  }
  return (
    <div className="mx-auto mt-6 flex max-w-[24rem] flex-col gap-4">
      <h1 className="text-center font-display text-xl text-ink">Parents only</h1>
      <PinPad error={err} onComplete={async (p) => {
        try { if (await data.verifyPin(p)) { setErr(undefined); unlock(); } else setErr('That PIN did not match. Try again.'); }
        catch (x) { setErr(x instanceof Error ? x.message : 'Could not check the PIN.'); }
      }} />
    </div>
  );
}
