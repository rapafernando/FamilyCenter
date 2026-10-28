'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data/fake';
import { errMsg } from '@/lib/ctx';
import { Banner, PairingCode } from '@/components/ui/misc';
import { Button } from '@/components/ui/controls';

export default function Pair() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'waiting' | 'expired' | 'error'>('loading');
  const [err, setErr] = useState('');
  const start = useCallback(async () => {
    setState('loading');
    try { const p = await data.startPairing(); setCode(p.code); setState('waiting'); } catch (e) { setErr(errMsg(e)); setState('error'); }
  }, []);
  useEffect(() => { start(); }, [start]);
  useEffect(() => {
    if (!code || state !== 'waiting') return;
    const t = setInterval(async () => {
      const s = await data.pairingStatus(code);
      if (s === 'paired') router.replace('/calendar');
      if (s === 'expired') setState('expired');
    }, 2000);
    return () => clearInterval(t);
  }, [code, state, router]);
  return (
    <>
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">‹ Back</Link>
      <h1 className="font-display text-xl text-ink">Link this screen</h1>
      {state === 'error' && <Banner tone="danger" title="No code yet">{err}</Banner>}
      {state === 'loading' && <p role="status" className="text-muted">Getting a code…</p>}
      {state === 'waiting' && code && <PairingCode code={code} />}
      {state === 'expired' && <Banner tone="warning" title="That code ran out" action={<Button size="sm" onClick={start}>Get a new code</Button>}>Codes work for 10 minutes.</Banner>}
      <div className="rounded-lg border-2 border-dashed border-line-input p-4 text-base text-muted">
        <p className="font-bold text-ink">Trying the demo?</p>
        <p>Open this site in another tab, choose “Try the sample household”, then go to More › Screens › Link a screen and type the code.</p>
      </div>
    </>
  );
}
