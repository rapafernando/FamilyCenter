'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Info, OctagonAlert, Sparkles, Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './controls';

/* ---------- Banner (sync notices, errors, success) ---------- */
type Tone = 'info' | 'success' | 'warning' | 'danger';
const tones: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-accent-tint border-accent', icon: 'text-accent', Icon: Info },
  success: { box: 'bg-success-tint border-success', icon: 'text-success', Icon: CheckCircle2 },
  warning: { box: 'bg-warning-tint border-warning', icon: 'text-warning', Icon: AlertTriangle },
  danger: { box: 'bg-danger-tint border-danger', icon: 'text-danger', Icon: OctagonAlert },
};
export function Banner({ tone = 'info', title, children, action }:
  { tone?: Tone; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const { box, icon, Icon } = tones[tone];
  return (
    <div role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-md border-l-[0.4rem] p-3', box)}>
      <Icon aria-hidden className={cn('mt-0.5 h-6 w-6 shrink-0', icon)} />
      <div className="flex-1">
        <p className="font-bold text-ink">{title}</p>
        {children && <p className="text-sm text-ink">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Event alert: native <dialog>, big OK, can close itself, tap outside closes ---------- */
export function AlertDialog({ open, title, detail, autoDismissSeconds = 60, onClose }:
  { open: boolean; title: string; detail: string; autoDismissSeconds?: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [left, setLeft] = useState(autoDismissSeconds);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { d.showModal(); setLeft(autoDismissSeconds); }
    if (!open && d.open) d.close();
  }, [open, autoDismissSeconds]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(t); onClose(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [open, onClose]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby="alert-title"
      className="w-[min(32rem,92vw)] rounded-lg border-2 border-line bg-surface p-0 text-ink shadow-pop">
      <div className="flex flex-col gap-4 p-6">
        <BellRing aria-hidden className="h-10 w-10 text-accent" />
        <h2 id="alert-title" className="font-display text-xl">{title}</h2>
        <p className="text-lg">{detail}</p>
        <Button size="lg" className="w-full" onClick={onClose} autoFocus>OK</Button>
        <p className="text-center text-sm text-muted" aria-live="off">Closes by itself in {left} seconds</p>
      </div>
    </dialog>
  );
}

/* ---------- Meal tile ---------- */
export function MealTile({ day, slot, meals, onAdd }: { day: string; slot: string; meals: string[]; onAdd: () => void }) {
  return (
    <div className="flex min-h-[6rem] flex-col gap-1 rounded-md border-2 border-line bg-surface p-3">
      <p className="text-sm text-muted">{day} · {slot}</p>
      {meals.length ? meals.map((m) => <p key={m} className="font-bold text-ink">{m}</p>) : (
        <button type="button" onClick={onAdd} className="mt-auto min-h-target self-start rounded-md px-1 text-left font-bold text-accent underline">Add a meal</button>
      )}
    </div>
  );
}

/* ---------- Google connection card with token health ---------- */
type Conn = 'ok' | 'syncing' | 'stale' | 'needs_reauth' | 'error';
export function ConnectionCard({ email, status, lastSynced, tokenChecked, mode, onReload, onReconnect, onRemove }:
  { email: string; status: Conn; lastSynced: string; tokenChecked: string; mode: 'one_way' | 'two_way';
    onReload?: () => void; onReconnect?: () => void; onRemove?: () => void }) {
  const label: Record<Conn, string> = { ok: 'Connected', syncing: 'Syncing', stale: 'Behind', needs_reauth: 'Needs reconnecting', error: 'Problem' };
  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg text-ink">Google Calendar</h3>
          <p className="text-sm text-muted">{email} · {mode === 'two_way' ? 'Changes go both ways' : 'Read only'}</p>
        </div>
        <span className={cn('rounded-pill px-3 py-1 text-sm font-bold',
          status === 'ok' || status === 'syncing' ? 'bg-success-tint text-ink' : status === 'stale' ? 'bg-warning-tint text-ink' : 'bg-danger-tint text-ink')}>{label[status]}</span>
      </header>
      {status === 'needs_reauth' && (
        <Banner tone="danger" title="Google needs you to sign in again" action={<Button size="sm" onClick={onReconnect}>Reconnect</Button>}>
          Your events stay on screen. They are marked as out of date until you reconnect.
        </Banner>
      )}
      {status === 'error' && <Banner tone="danger" title="Google did not answer for 3 days in a row">Check the connection, then try again.</Banner>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Last synced</dt><dd className="text-ink">{lastSynced}</dd>
        <dt className="text-muted">Sign-in checked</dt><dd className="text-ink">{tokenChecked}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onReload}>Sync now</Button>
        <Button variant="ghost" size="sm" onClick={onRemove}>Remove</Button>
      </div>
    </section>
  );
}

/* ---------- AI prompt panel (rendered only when the household has an AI key) ---------- */
export function PromptPanel({ title, placeholder, state, onSubmit }:
  { title: string; placeholder: string; state: 'idle' | 'working' | 'review'; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-line bg-surface p-4">
      <h3 className="flex items-center gap-2 text-lg text-ink"><Sparkles aria-hidden className="h-5 w-5 text-accent" />{title}</h3>
      <label className="sr-only" htmlFor="ai-text">{title}</label>
      <textarea id="ai-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={placeholder}
        className="rounded-md border-2 border-line-input bg-surface p-3 text-base text-ink placeholder:text-muted" />
      <p className="text-sm text-muted">Your text is sent to the AI service you chose in Settings. Nothing is saved until you approve it.</p>
      <Button loading={state === 'working'} onClick={() => onSubmit(text)} disabled={!text.trim()}>{state === 'review' ? 'Make another plan' : 'Make a plan'}</Button>
    </section>
  );
}

/* ---------- Sponsored slide: label always visible, the display never navigates away ---------- */
export function SponsorSlide({ advertiser, headline, handoff, qr, onTap, onBack, children }:
  { advertiser: string; headline: string; handoff: boolean; qr?: React.ReactNode; onTap: () => void; onBack: () => void; children?: React.ReactNode }) {
  return (
    <section className="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-lg border-2 border-line bg-surface">
      <div className="absolute inset-0">{children}</div>
      <span className="absolute left-3 top-3 rounded-pill border-2 border-line-input bg-surface px-3 py-1 text-sm font-bold text-ink">Sponsored · {advertiser}</span>
      {!handoff ? (
        <button type="button" onClick={onTap} className="relative m-3 flex min-h-primary items-center justify-between gap-3 rounded-md bg-surface px-4 text-left shadow-pop">
          <span className="text-lg font-bold text-ink">{headline}</span>
          <span className="shrink-0 text-base font-bold text-accent underline">Open on my phone</span>
        </button>
      ) : (
        <div className="relative m-3 flex items-center gap-4 rounded-md bg-surface p-4 shadow-pop">
          <div className="h-32 w-32 shrink-0">{qr}</div>
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-lg font-bold text-ink">Scan with your phone to open it there.</p>
            <p className="text-sm text-muted">This screen stays on your calendar.</p>
            <Button variant="secondary" onClick={onBack}>Back to photos</Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- PIN pad (parent unlock) ---------- */
export function PinPad({ length = 4, onComplete, error }: { length?: number; onComplete: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState('');
  const push = (d: string) => setPin((p) => {
    const n = (p + d).slice(0, length);
    if (n.length === length) setTimeout(() => { onComplete(n); setPin(''); }, 120);
    return n;
  });
  return (
    <div className="mx-auto flex w-[min(20rem,100%)] flex-col items-center gap-4">
      <div role="img" aria-label={`${pin.length} of ${length} digits entered`} className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={cn('h-5 w-5 rounded-pill border-2 border-line-input', i < pin.length ? 'bg-ink' : 'bg-surface')} />
        ))}
      </div>
      <p className={cn('min-h-[1.5rem] text-sm', error ? 'text-danger' : 'text-muted')} role="status">{error ?? 'Enter the parent PIN'}</p>
      <div className="grid w-full grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9'].map((d) => (
          <button key={d} type="button" onClick={() => push(d)} className="min-h-primary rounded-md border-2 border-line-input bg-surface font-display text-xl text-ink active:bg-accent-tint">{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => push('0')} className="min-h-primary rounded-md border-2 border-line-input bg-surface font-display text-xl text-ink active:bg-accent-tint">0</button>
        <button type="button" aria-label="Delete last digit" onClick={() => setPin((p) => p.slice(0, -1))} className="flex min-h-primary items-center justify-center rounded-md text-ink"><Delete aria-hidden className="h-7 w-7" /></button>
      </div>
    </div>
  );
}

/* ---------- Pairing code (first run on the display) ---------- */
export function PairingCode({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-lg text-ink">On your phone, open Linked devices and enter this code.</p>
      <p aria-label={`Code ${code.split('').join(' ')}`} className="flex gap-2">
        {code.split('').map((c, i) => (
          <span key={i} aria-hidden className="flex h-[4.5rem] w-14 items-center justify-center rounded-md border-2 border-line-input bg-surface font-display text-2xl text-ink">{c}</span>
        ))}
      </p>
      <p className="text-sm text-muted">The code works for 10 minutes. This screen updates by itself when it is linked.</p>
    </div>
  );
}
