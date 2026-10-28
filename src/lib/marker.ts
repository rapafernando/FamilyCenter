import type { CSSProperties } from 'react';
import { deriveMarker } from './marker-core.mjs';
import { MARKER_PRESETS } from './markers.generated';

export { deriveMarker };
export type MarkerValue = string; // a preset name ("tomato") or any #RRGGBB

type Attrs = { 'data-marker'?: string; 'data-marker-custom'?: string; style?: CSSProperties };

/** Spread onto an element to give it the --m-solid, --m-on and --m-tint variables. */
export function markerAttrs(value: MarkerValue | null | undefined): Attrs {
  if (!value) return { 'data-marker': 'graphite' };
  if (value in MARKER_PRESETS) return { 'data-marker': value };
  const hex = value.toUpperCase();
  const hit = Object.entries(MARKER_PRESETS).find(([, h]) => h === hex);
  if (hit) return { 'data-marker': hit[0] };
  const l = deriveMarker(hex, 'light');
  const d = deriveMarker(hex, 'dark');
  return {
    'data-marker-custom': '',
    style: {
      '--ml-solid': l.solid, '--ml-on': l.on, '--ml-tint': l.tint,
      '--md-solid': d.solid, '--md-on': d.on, '--md-tint': d.tint,
    } as CSSProperties,
  };
}
