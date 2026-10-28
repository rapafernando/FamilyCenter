'use client';
import { useId } from 'react';
import Link from 'next/link';
import { Check, Loader2, Plus } from 'lucide-react';
import { MARKER_PRESETS } from '@/lib/markers.generated';
import { cn } from '@/lib/cn';
import { markerAttrs, type MarkerValue } from '@/lib/marker';

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-on border-2 border-transparent hover:opacity-90',
  secondary: 'bg-surface text-ink border-2 border-line-input hover:bg-accent-tint',
  ghost: 'bg-transparent text-accent border-2 border-transparent hover:bg-accent-tint',
  danger: 'bg-danger text-danger-on border-2 border-transparent hover:opacity-90',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-[2.25rem] px-3 text-sm', // adult settings only, never on the wall
  md: 'min-h-target px-5 text-base',
  lg: 'min-h-primary px-7 text-lg',
};
export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn('inline-flex items-center justify-center gap-2 rounded-md font-bold transition-colors duration-fast active:translate-y-px',
        'disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], sizes[size], className)}
    >
      {loading && <Loader2 aria-hidden className="h-[1.1em] w-[1.1em] animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

/* ---------- Plus floating button ---------- */
export function Fab({ label, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} {...rest}
      className={cn('fixed bottom-6 right-6 inline-flex h-primary w-primary items-center justify-center rounded-pill bg-accent text-accent-on shadow-pop',
        'active:translate-y-px', className)}>
      <Plus aria-hidden className="h-7 w-7" strokeWidth={3} />
    </button>
  );
}

/* ---------- Text field ---------- */
export function Field({ label, hint, error, className, ...rest }:
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const msg = error ?? hint;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <input id={id} aria-invalid={!!error || undefined} aria-describedby={msg ? id + '-m' : undefined} {...rest}
        className={cn('min-h-target rounded-md border-2 bg-surface px-3 text-base text-ink placeholder:text-muted',
          error ? 'border-danger' : 'border-line-input')} />
      {msg && <p id={id + '-m'} className={cn('text-sm', error ? 'text-danger' : 'text-muted')}>{msg}</p>}
    </div>
  );
}

/* ---------- Switch (the Time and Repeats toggles) ---------- */
export function Switch({ label, checked, onChange, className }:
  { label: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex min-h-target cursor-pointer items-center justify-between gap-4', className)}>
      <span className="text-base">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden
        className={cn('relative h-8 w-14 shrink-0 rounded-pill border-2 transition-colors duration-fast peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          checked ? 'border-accent bg-accent' : 'border-line-input bg-surface')}>
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-pill transition-all duration-fast',
          checked ? 'left-[1.625rem] bg-accent-on' : 'left-0.5 bg-line-input')} />
      </span>
    </label>
  );
}

/* ---------- Segmented choice (view switcher, Chore or Routine, Morning/Afternoon/Evening) ---------- */
export function Segmented<T extends string>({ label, options, value, onChange, className }:
  { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const name = useId();
  return (
    <fieldset className={cn('m-0 border-0 p-0', className)}>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-pill border-2 border-line-input bg-surface p-0.5">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className={cn('flex min-h-[2.5rem] min-w-target cursor-pointer items-center justify-center rounded-pill px-4 font-bold transition-colors duration-fast',
              'peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              value === o.value ? 'bg-accent text-accent-on' : 'text-ink')}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------- Profile chip: colour is never the only signal, the name or initial is always there ---------- */
export function ProfileChip({ name, color, selected, onClick, size = 'md', className }:
  { name: string; color: MarkerValue | null; selected?: boolean; onClick?: () => void; size?: 'sm' | 'md'; className?: string }) {
  const body = (
    <>
      <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-pill bg-m-solid text-xs font-bold text-m-on">{name.trim().charAt(0).toUpperCase()}</span>
      <span className={cn('font-bold', size === 'sm' ? 'text-sm' : 'text-base')}>{name}</span>
    </>
  );
  const cls = cn('inline-flex items-center gap-2 rounded-pill border-2 pl-1 pr-3', size === 'md' && 'min-h-target',
    selected ? 'border-m-solid bg-m-tint' : 'border-line bg-surface', className);
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={!!selected} {...markerAttrs(color)} className={cls}>{body}</button>
    : <span {...markerAttrs(color)} className={cls}>{body}</span>;
}

/* ---------- Plus floating button as a link ---------- */
export function FabLink({ label, href, className }: { label: string; href: string; className?: string }) {
  return (
    <Link href={href} aria-label={label}
      className={cn('fixed bottom-6 right-6 z-20 inline-flex h-primary w-primary items-center justify-center rounded-pill bg-accent text-accent-on shadow-pop [html[data-surface=handheld]_&]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]', className)}>
      <Plus aria-hidden className="h-7 w-7" strokeWidth={3} />
    </Link>
  );
}

/* ---------- Select ---------- */
export function Select({ label, className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <select id={id} {...rest} className="min-h-target rounded-md border-2 border-line-input bg-surface px-3 text-base text-ink">{children}</select>
    </div>
  );
}

/* ---------- Colour picker: nine pens plus any colour ---------- */
export function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const name = useId();
  const presets = Object.entries(MARKER_PRESETS);
  const custom = !presets.some(([, h]) => h.toLowerCase() === value.toLowerCase());
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-1 text-sm font-bold">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([n, hex]) => {
          const on = hex.toLowerCase() === value.toLowerCase();
          return (
            <label key={n} className="relative">
              <input type="radio" name={name} checked={on} onChange={() => onChange(hex)} className="peer sr-only" />
              <span className="flex h-target w-target min-h-target min-w-target cursor-pointer items-center justify-center rounded-pill border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                style={{ background: hex }} title={n}>
                {on && <Check aria-hidden className="h-5 w-5 text-ink" strokeWidth={4} />}<span className="sr-only">{n}</span>
              </span>
            </label>
          );
        })}
        <label className="flex min-h-target cursor-pointer items-center gap-2 rounded-pill border-2 border-line-input bg-surface px-3 text-sm font-bold">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0" aria-label="Pick another colour" />
          {custom ? 'Custom colour' : 'Other'}
        </label>
      </div>
    </fieldset>
  );
}
