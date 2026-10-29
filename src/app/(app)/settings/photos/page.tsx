'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { errMsg, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { PageHeader } from '@/components/shell/AppShell';
import { SettingsGate } from '@/components/shell/AdultGate';
import { Button, Field, Switch } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

const MAX_SIDE = 1920;
/** Shrinks a picture in the browser before it is sent, so uploads stay quick on a home connection. */
async function shrink(file: File): Promise<{ dataUrl: string; caption: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return { dataUrl: c.toDataURL('image/jpeg', 0.82), caption: file.name.replace(/\.[^.]+$/, '').slice(0, 60), width: w, height: h };
}

export default function Photos() {
  const notify = useNotice();
  const q = useQuery(() => data.listAlbums(), []);
  const [name, setName] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<{ id: string; name: string } | null>(null);
  const files = useRef<HTMLInputElement>(null); const target = useRef<string>('');
  const guard = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); q.reload(); } catch (e) { setErr(errMsg(e)); } };

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const ok = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, 40);
    const skipped = list.length - ok.length;
    setBusy(target.current); setErr('');
    try {
      let added = 0, dupes = 0;
      for (let i = 0; i < ok.length; i += 4) { // a few at a time keeps each upload small
        const batch = []; for (const f of ok.slice(i, i + 4)) batch.push(await shrink(f));
        const r = (await data.addPhotos(target.current, batch)) as { added: number; skipped: number } | undefined;
        added += r?.added ?? batch.length; dupes += r?.skipped ?? 0;
      }
      const notes = [skipped ? `${skipped} files were skipped. Only pictures, up to 40 at a time.` : '', dupes ? `${dupes} were already in the album.` : ''].filter(Boolean).join(' ');
      notify({ tone: skipped ? 'warning' : 'success', title: `Added ${added} ${added === 1 ? 'photo' : 'photos'}`, body: notes || undefined });
      q.reload();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(null); if (files.current) files.current.value = ''; }
  }
  return (
    <SettingsGate>
      <PageHeader title="Photos" back={{ href: '/settings', label: 'Settings' }} />
      <p className="mb-3 max-w-[40rem] text-base text-muted">Photos in albums marked “Show on screens” play when a screen is idle.</p>
      <input ref={files} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files)} />
      {err && <div className="mb-3 max-w-[40rem]"><Banner tone="danger" title="That did not work">{err}</Banner></div>}
      {q.loading && !q.data && <SkeletonList rows={3} />}
      {q.error && <Banner tone="danger" title="Could not load albums" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Try again in a moment.</Banner>}
      <form className="mb-4 flex max-w-[40rem] items-end gap-2" onSubmit={(e) => { e.preventDefault(); guard(async () => { await data.createAlbum(name); setName(''); }); }}>
        <div className="flex-1"><Field label="New album" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer at the lake" /></div>
        <Button type="submit" size="lg">Create</Button>
      </form>
      {q.data && q.data.length === 0 && <p className="max-w-[40rem] rounded-lg border-2 border-dashed border-line-input p-6 text-center text-base text-muted">No albums yet. Make one above, then add pictures to it.</p>}
      <ul className="m-0 flex max-w-[44rem] list-none flex-col gap-4 p-0">
        {(q.data ?? []).map((a) => (
          <li key={a.id}><section aria-label={a.name} className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2"><h2 className="truncate font-display text-lg text-ink">{a.name} <span className="text-sm font-normal text-muted">{a.photos.length} {a.photos.length === 1 ? 'photo' : 'photos'}</span></h2>
              <Button variant="ghost" size="sm" aria-label={`Delete album ${a.name}`} onClick={() => setGone({ id: a.id, name: a.name })}><Trash2 aria-hidden className="h-4 w-4" />Delete</Button></div>
            <Switch label="Show on screens" checked={a.showOnDisplay} onChange={(v) => guard(() => data.updateAlbum(a.id, { showOnDisplay: v }))} />
            {a.photos.length === 0 && <p className="text-base text-muted">This album is empty.</p>}
            <ul className="m-0 grid list-none gap-2 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(6rem, 1fr))' }}>
              {a.photos.map((p) => (
                <li key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt={p.caption || 'Photo'} className="aspect-square w-full rounded-md object-cover" />
                  <button type="button" aria-label={`Remove ${p.caption || 'photo'}`} onClick={() => guard(() => data.deletePhoto(p.id))} className="absolute right-1 top-1 flex min-h-target min-w-target items-center justify-center rounded-pill bg-surface text-ink shadow-lift"><Trash2 aria-hidden className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            <div><Button variant="secondary" loading={busy === a.id} onClick={() => { target.current = a.id; files.current?.click(); }}><ImagePlus aria-hidden className="h-5 w-5" />Add pictures</Button></div>
          </section></li>
        ))}
      </ul>
      <ChoiceDialog open={!!gone} danger title={`Delete “${gone?.name}”?`} detail="Every picture in this album is removed." choices={[{ value: 'go', label: 'Delete album' }]} onChoose={() => { const g = gone!; setGone(null); guard(() => data.deleteAlbum(g.id)); }} onCancel={() => setGone(null)} />
    </SettingsGate>
  );
}
