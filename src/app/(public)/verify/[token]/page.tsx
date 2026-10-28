'use client';
import { use } from 'react';
import Link from 'next/link';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { errMsg } from '@/lib/ctx';
import { Banner } from '@/components/ui/misc';

export default function Verify({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const r = useQuery(async () => { await data.verifyEmail(token); return true; }, [token]);
  return (
    <>
      <h1 className="font-display text-xl text-ink">Confirm your email</h1>
      {r.loading && <p role="status" className="text-muted">Checking the link…</p>}
      {r.error && <Banner tone="warning" title="That link does not work">{errMsg(r.error)}</Banner>}
      {r.data && <Banner tone="success" title="Email confirmed">Thank you. You can close this page.</Banner>}
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">Go to the start page</Link>
    </>
  );
}
