'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { data } from '@/lib/data';
import { allZones, browserZone, zoneLabel } from '@/lib/zones';
import { errMsg } from '@/lib/ctx';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';


export default function SignUp() {
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', password: '', householdName: '', timezone: 'America/New_York' });
  const [zones, setZones] = useState<string[]>(['America/New_York']);
  // Chosen after the page loads so the server and the browser agree on what was drawn; the person's own zone is the starting point.
  useEffect(() => { const z = allZones(); setZones(z); const g = browserZone(); setF((v) => (v.timezone === 'America/New_York' && z.includes(g) ? { ...v, timezone: g } : v)); }, []);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  return (
    <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await data.signUp(f); router.push('/settings/profiles?welcome=1'); } catch (x) { setErr(errMsg(x)); setBusy(false); } }}>
      <Link href="/welcome" className="min-h-target text-base font-bold text-accent underline">‹ Back</Link>
      <h1 className="font-display text-xl text-ink">Create your household</h1>
      {err && <Banner tone="danger" title="Could not create the household">{err}</Banner>}
      <Field label="Your name" autoComplete="name" required value={f.name} onChange={set('name')} />
      <Field label="Email" type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
      <Field label="Password" type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} hint="At least 8 characters." />
      <Field label="Household name" placeholder="The Garcia family" required value={f.householdName} onChange={set('householdName')} />
      <div className="flex flex-col gap-1">
        <label htmlFor="tz" className="text-sm font-bold">Time zone</label>
        <select id="tz" value={f.timezone} onChange={set('timezone')} className="min-h-target rounded-md border-2 border-line-input bg-surface px-3 text-base text-ink">
          {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
        </select>
        <p className="text-sm text-muted">Chores and “today” follow this, not the clock on each screen.</p>
      </div>
      <p className="text-sm text-muted">Creating a household means you agree to how your information is used. <Link href="/privacy" className="font-bold text-accent underline">Read the privacy page</Link>.</p>
      <Button type="submit" size="lg" loading={busy}>Create household</Button>
    </form>
  );
}
