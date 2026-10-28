'use client';
import { useState } from 'react';
import Link from 'next/link';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { PageHeader } from '@/components/shell/AppShell';
import { AdultGate } from '@/components/shell/AdultGate';
import { Button, Field, Segmented, Select, Switch } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';

type Theme = 'auto' | 'light' | 'dark';
function readTheme(): Theme { try { return (localStorage.getItem('fc-theme') as Theme) || 'auto'; } catch { return 'auto'; } }

export default function Display() {
  const { household, session } = useApp(); const notify = useNotice();
  const hasPin = useQuery(() => data.hasPin(), []);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [pin, setPin] = useState(''); const [err, setErr] = useState(''); const [ads, setAds] = useState(household.adsEnabled); const [every, setEvery] = useState(household.adsEveryNPhotos);
  const guard = async (fn: () => Promise<unknown>, ok: string) => { setErr(''); try { await fn(); notify({ tone: 'success', title: ok }); } catch (e) { setErr(errMsg(e)); } };
  const pickTheme = (t: Theme) => { setTheme(t); try { localStorage.setItem('fc-theme', t); } catch { /* ignore */ } if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; };
  return (
    <AdultGate>
      <PageHeader title="Display and ads" back={{ href: '/settings', label: 'Settings' }} />
      {err && <div className="mb-3"><Banner tone="danger" title="Could not save">{err}</Banner></div>}
      <div className="flex max-w-[40rem] flex-col gap-5">
        <section aria-label="Look" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Look</h2>
          {session.deviceId
            ? <p className="text-base text-muted">This is a linked screen. Its look and photo timer are set on the <Link className="font-bold text-accent underline" href="/settings/devices">Screens</Link> page.</p>
            : <Segmented label="Light or dark on this device" value={theme} onChange={pickTheme} options={[{ value: 'auto', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />}
        </section>
        <section aria-label="Parent PIN" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Parent PIN</h2>
          <p className="text-base text-muted">{hasPin.data ? 'A PIN is set. Wall screens ask for it before settings open.' : 'No PIN yet. Without one, anyone at a wall screen can open settings.'}</p>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); guard(async () => { await data.setPin(pin); setPin(''); hasPin.reload(); }, 'PIN saved'); }}>
            <div className="flex-1"><Field label={hasPin.data ? 'New PIN' : 'Choose a PIN'} inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} hint="4 digits" /></div>
            <Button type="submit" disabled={pin.length !== 4}>Save PIN</Button>
          </form>
          {hasPin.data && <div><Button variant="ghost" className="text-danger" onClick={() => guard(async () => { await data.setPin(null); hasPin.reload(); }, 'PIN removed')}>Remove PIN</Button></div>}
        </section>
        <section aria-label="Ads" className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
          <h2 className="font-display text-lg text-ink">Ads in the photo screensaver</h2>
          <p className="text-base text-muted">This app is free. To keep it that way, a small sponsored card can appear between photos on the screensaver. It never shows on the calendar, chores or lists, and it is always labelled “Sponsored”.</p>
          <Switch label="Show sponsored cards" checked={ads} onChange={(v) => { setAds(v); guard(() => data.updateHousehold({ adsEnabled: v }), v ? 'Sponsored cards on' : 'Sponsored cards off'); }} />
          {ads && <Select label="One card after every" value={String(every)} onChange={(e) => { const n = Number(e.target.value); setEvery(n); guard(() => data.updateHousehold({ adsEveryNPhotos: n }), 'Saved'); }}>{[3, 4, 5, 8].map((n) => <option key={n} value={n}>{n} photos</option>)}</Select>}
          <p className="text-sm text-muted">Only ads marked suitable for children, with a secure link, are used. Tapping one shows a code to open it on your phone. The screen stays where it is.</p>
        </section>
        <div><Link href="/screensaver" className="inline-flex min-h-primary items-center rounded-md border-2 border-line-input bg-surface px-5 font-bold text-ink">Preview the screensaver</Link></div>
      </div>
    </AdultGate>
  );
}
