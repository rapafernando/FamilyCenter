'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MonitorSmartphone, UserPlus, LogIn, Sparkles } from 'lucide-react';
import { data, IS_FAKE } from '@/lib/data';
import { errMsg } from '@/lib/ctx';
import { useQuery } from '@/lib/data/hooks';
import { Banner } from '@/components/ui/misc';
import { Button } from '@/components/ui/controls';

const row = 'flex min-h-primary items-center gap-4 rounded-lg border-2 border-line bg-surface p-4 text-left hover:border-accent';

export default function Welcome() {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const feat = useQuery(() => data.features(), []);
  useEffect(() => { data.getSession().then((s) => { if (s.user || s.deviceId) router.replace('/calendar'); }); }, [router]);
  return (
    <>
      <header>
        <h1 className="font-display text-2xl text-ink">Family calendar</h1>
        <p className="mt-1 text-lg text-muted">One screen for the whole household: events, chores, lists and meals.</p>
      </header>
      {err && <Banner tone="danger" title="Could not start the demo">{err}</Banner>}
      <nav aria-label="Ways to start" className="flex flex-col gap-3">
        <Link href="/signup" className={row}><UserPlus aria-hidden className="h-7 w-7 shrink-0 text-accent" /><span><span className="block text-lg font-bold text-ink">Create a household</span><span className="text-base text-muted">Start fresh on your phone or computer.</span></span></Link>
        <Link href="/signin" className={row}><LogIn aria-hidden className="h-7 w-7 shrink-0 text-accent" /><span><span className="block text-lg font-bold text-ink">Sign in</span><span className="text-base text-muted">You already have a household.</span></span></Link>
        <Link href="/pair" className={row}><MonitorSmartphone aria-hidden className="h-7 w-7 shrink-0 text-accent" /><span><span className="block text-lg font-bold text-ink">Use this screen as the family display</span><span className="text-base text-muted">A tablet or touchscreen you leave on the wall or counter.</span></span></Link>
      </nav>
      <p className="text-sm text-muted"><Link href="/privacy" className="font-bold text-accent underline">How your information is used</Link></p>
      {feat.data?.demo && <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-line-input p-4">
        <p className="flex items-center gap-2 font-bold text-ink"><Sparkles aria-hidden className="h-5 w-5 text-accent" />Just looking around?</p>
        <p className="text-base text-muted">Open a sample household with made-up people and events. {IS_FAKE ? 'Nothing leaves this browser.' : 'It is deleted after a day.'}</p>
        <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); try { await data.startDemo(); router.push('/calendar'); } catch (e) { setErr(errMsg(e)); setBusy(false); } }}>Try the sample household</Button>
      </div>}
    </>
  );
}
