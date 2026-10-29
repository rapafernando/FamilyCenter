'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data, IS_FAKE } from '@/lib/data';
import type { PhotoImport } from '@/lib/data/fake';
import { useQuery } from '@/lib/data/hooks';
import { Button, Select } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';

const RETURN_NOTES: Record<string, [tone: 'warning' | 'danger', title: string, body: string]> = {
  denied: ['warning', 'Google Photos was not connected', 'You chose not to share. Nothing was added.'],
  expired: ['warning', 'That sign-in took too long', 'Start again with Choose photos in Google Photos.'],
  scope: ['danger', 'Google did not allow choosing photos', 'On Google’s screen, allow the app to see the photos you choose, then try again.'],
  failed: ['danger', 'Google Photos could not be reached', 'Try again. If it keeps happening, check the Google connection settings.'],
};

/** Choose photos in Google's own window; this app copies them into one of its albums. Nothing stays linked to Google Photos afterwards. */
export function GooglePhotos({ albums, onImported }: { albums: { id: string; name: string }[]; onImported: () => void }) {
  const { session } = useApp(); const notify = useNotice();
  const feat = useQuery(() => data.features(), []);
  const [albumId, setAlbumId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [impId, setImpId] = useState<string | null>(null); const [imp, setImp] = useState<PhotoImport | null>(null);
  const done = useRef(onImported); done.current = onImported;
  useEffect(() => { if (!albumId && albums[0]) setAlbumId(albums[0].id); }, [albums, albumId]);

  // Coming back from Google's sign-in: ?import=<id> carries on, ?google=<reason> explains what happened.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search); const i = p.get('import'); const g = p.get('google');
    if (i) setImpId(i);
    if (g && RETURN_NOTES[g]) notify({ tone: RETURN_NOTES[g][0], title: RETURN_NOTES[g][1], body: RETURN_NOTES[g][2] });
    if (i || g) window.history.replaceState(null, '', '/settings/photos');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!impId) return;
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await data.getPhotosImport(impId); if (stop) return; setImp(r);
        if (r.status === 'waiting' || r.status === 'importing') timer = setTimeout(tick, 2500); else done.current();
      } catch (e) { if (!stop) { setErr(errMsg(e)); setImpId(null); } }
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [impId]);

  const start = async () => {
    setBusy(true); setErr('');
    try { const r = await data.startPhotosImport(albumId); window.location.assign(r.url); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  const cancel = async () => { if (imp) { try { await data.cancelPhotosImport(imp.id); } catch { /* the next poll shows the truth */ } setImpId(null); setImp(null); } };
  const albumName = (id: string) => albums.find((a) => a.id === id)?.name ?? 'the album';
  const notSetUp = !IS_FAKE && feat.data && !feat.data.googleConfigured;

  return (
    <section aria-label="Google Photos" className="mb-5 flex max-w-[40rem] flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
      <h2 className="font-display text-lg text-ink">Google Photos</h2>
      <p className="text-base text-muted">Choose photos in Google Photos and this app keeps its own copy for the screensaver. Google only lets apps see photos that you pick yourself, so you pick them in Google’s window each time you want to add more. Nothing stays linked to your Google Photos afterwards.</p>
      {IS_FAKE && <Banner tone="info" title="Practice mode">Choosing photos from Google works on a real server only.</Banner>}
      {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
      {notSetUp && <Banner tone="info" title="Google is not set up on this server">{session.admin ? <>Add the client ID and secret in <Link href="/settings/google" className="font-bold text-accent underline">Google connection</Link> first.</> : 'Ask the person who set up this server to add the Google client ID and secret.'}</Banner>}

      {imp?.status === 'waiting' && (
        <div className="flex flex-col gap-3 rounded-md bg-accent-tint p-4" role="status">
          <p className="text-base text-ink"><b>Step 2.</b> Open Google Photos, choose your photos, and press Done there. They are copied to <b>{albumName(imp.albumId)}</b> as soon as you do. You can keep this page open.</p>
          <div className="flex flex-wrap gap-2">
            <a href={imp.pickerUri} target="_blank" rel="noreferrer" className="inline-flex min-h-primary items-center gap-2 rounded-md bg-accent px-5 text-lg font-bold text-accent-on"><ExternalLink aria-hidden className="h-5 w-5" />Open Google Photos</a>
            <Button variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}
      {imp?.status === 'importing' && <p className="rounded-md bg-accent-tint p-4 text-base text-ink" role="status">Copying photos… {imp.added + imp.skipped} of {imp.picked}</p>}
      {imp?.status === 'done' && (
        <Banner tone="success" title={imp.added ? `Added ${imp.added} ${imp.added === 1 ? 'photo' : 'photos'}` : 'No new photos added'}>
          {imp.skipped ? `${imp.skipped} ${imp.skipped === 1 ? 'was' : 'were'} skipped: already in the household, not a picture, or too big.` : `They are in ${albumName(imp.albumId)}.`}
        </Banner>
      )}
      {(imp?.status === 'failed' || imp?.status === 'expired') && <Banner tone="danger" title="The photos were not added">{imp.error || 'Try again.'}</Banner>}
      {imp?.status === 'cancelled' && <Banner tone="info" title="Cancelled">Nothing was added.</Banner>}

      {albums.length === 0
        ? <p className="text-base text-muted">Make an album first, then come back here.</p>
        : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1"><Select label="Add the photos to" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>{albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
            <Button size="lg" loading={busy} disabled={!!notSetUp || IS_FAKE || imp?.status === 'waiting' || imp?.status === 'importing'} onClick={start}>Choose photos in Google Photos</Button>
          </div>
        )}
    </section>
  );
}
