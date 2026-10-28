'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useApp } from '@/lib/ctx';
import { data } from '@/lib/data';
import type { Slide } from '@/lib/types';
import { SponsorSlide } from '@/components/ui/misc';
import { useClock } from '@/components/shell/AppShell';

const HOLD_MS = 8000;

export default function Screensaver() {
  const { household } = useApp(); const router = useRouter(); const clock = useClock(household.timezone);
  const [slides, setSlides] = useState<Slide[] | null>(null); const [i, setI] = useState(0);
  const [handoff, setHandoff] = useState<{ qr: string } | null>(null);
  const cursor = useRef(0); const leave = useCallback(() => router.push('/calendar'), [router]);
  useEffect(() => { data.screensaverSlides(12, 0).then((r) => { cursor.current = r.next; setSlides(r.slides); }); }, []);
  const cur = slides?.[i];
  useEffect(() => {
    if (!slides?.length || handoff) return;
    const t = setTimeout(async () => {
      if (i >= slides.length - 3) { const r = await data.screensaverSlides(12, cursor.current); cursor.current = r.next; setSlides((s) => [...(s ?? []), ...r.slides]); }
      setI((n) => n + 1);
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [i, slides, handoff]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') (handoff ? setHandoff(null) : leave()); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [leave, handoff]);
  async function openAd(campaignId: string) { const { url } = await data.adHandoff(campaignId); setHandoff({ qr: await QRCode.toDataURL(url, { margin: 1, width: 256 }) }); }

  return (
    <div role="dialog" aria-label="Photo screensaver" className="fixed inset-0 z-50 flex flex-col bg-ink text-surface" data-surface="wall">
      <div className="flex items-center justify-between p-4">
        <p className="font-display text-xl" aria-live="off">{clock ? clock.toFormat('h:mm a · cccc, LLL d') : ''}</p>
        <button type="button" onClick={leave} className="min-h-primary rounded-md bg-surface px-5 font-bold text-ink">Back to calendar</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {slides === null && <p role="status" className="text-lg">Loading photos…</p>}
        {slides && slides.length === 0 && (
          <div className="max-w-[30rem] rounded-lg bg-surface p-6 text-center text-ink"><p className="text-lg font-bold">No photos to show</p><p className="text-base text-muted">Add photos to an album in Settings, and turn on “Show on screens”.</p></div>
        )}
        {cur?.type === 'photo' && (
          // eslint-disable-next-line @next/next/no-img-element
          <button type="button" onClick={leave} aria-label="Photo. Tap to go back to the calendar." className="flex h-full w-full items-center justify-center"><img key={cur.id} src={cur.dataUrl} alt={cur.caption || 'A family photo'} className="max-h-full max-w-full rounded-lg object-contain motion-safe:animate-[fadein_600ms_ease]" /></button>
        )}
        {cur?.type === 'ad' && (
          <div className="w-full max-w-[60rem] text-ink">
            <SponsorSlide advertiser={cur.advertiser} headline={cur.headline} handoff={!!handoff} onTap={() => openAd(cur.campaignId)} onBack={() => setHandoff(null)}
              qr={handoff ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={handoff.qr} alt="Code to open this on your phone" className="h-full w-full" /> : undefined}>
              <div className="flex h-full items-center justify-center bg-accent-tint p-6"><p className="max-w-[28rem] text-center text-lg text-ink">{cur.body}</p></div>
            </SponsorSlide>
          </div>
        )}
      </div>
    </div>
  );
}
