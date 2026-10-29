// How big the interface is drawn on a tablet or wall screen. Everything in the app is sized in rem, so one number on the page's
// root scales the whole interface. People choose the screen's physical size; the app turns that into the number.
export type ScreenSize = 'auto' | '7' | '10' | '11' | '13';
export const SIZE_OPTIONS: { value: ScreenSize; label: string }[] = [
  { value: 'auto', label: 'Automatic (from the screen’s pixels)' },
  { value: '7', label: '7 inch tablet' },
  { value: '10', label: '8 to 10 inch tablet' },
  { value: '11', label: '11 inch tablet' },
  { value: '13', label: '13 inch or larger' },
];
export const ZOOM_OPTIONS: { value: number; label: string }[] = [
  { value: -2, label: 'Much smaller' }, { value: -1, label: 'Smaller' }, { value: 0, label: 'Normal' }, { value: 1, label: 'Larger' }, { value: 2, label: 'Much larger' },
];
const PERCENT: Record<Exclude<ScreenSize, 'auto'>, number> = { '7': 87.5, '10': 100, '11': 112.5, '13': 125 };

/** "Automatic" guesses from the screen's smaller side in CSS pixels: a 7 inch tablet is about 600, an 11 inch one about 800, a 13 inch one over 1000. */
export function resolveSize(size: ScreenSize, wall: boolean, w: number, h: number): Exclude<ScreenSize, 'auto'> {
  if (size !== 'auto') return size;
  if (!wall) return '10';
  const m = Math.min(w, h);
  return m <= 640 ? '7' : m <= 900 ? '10' : m <= 1000 ? '11' : '13';
}
export const rootPercent = (size: Exclude<ScreenSize, 'auto'>, zoom: number) => PERCENT[size] * (1 + 0.125 * Math.max(-2, Math.min(2, zoom)));

export function applyScreen(size: ScreenSize, zoom: number, wall: boolean) {
  if (typeof document === 'undefined') return;
  const r = resolveSize(size, wall, window.innerWidth, window.innerHeight);
  const el = document.documentElement;
  el.style.fontSize = `${rootPercent(r, zoom)}%`;
  el.dataset.size = r; el.dataset.density = r === '7' ? 'compact' : 'regular';
}

/** This browser's own choice (used when the browser is not a linked screen). */
export const readLocalScreen = (): { size: ScreenSize; zoom: number } => {
  try {
    const s = localStorage.getItem('fc-size') as ScreenSize | null; const z = Number(localStorage.getItem('fc-zoom') ?? 0);
    return { size: s && ['auto', '7', '10', '11', '13'].includes(s) ? s : 'auto', zoom: Number.isFinite(z) ? z : 0 };
  } catch { return { size: 'auto', zoom: 0 }; }
};
export function saveLocalScreen(size: ScreenSize, zoom: number) {
  try { localStorage.setItem('fc-size', size); localStorage.setItem('fc-zoom', String(zoom)); } catch { /* the choice just will not be remembered */ }
  window.dispatchEvent(new Event('fc:screen'));
}
