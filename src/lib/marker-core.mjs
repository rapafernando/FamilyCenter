// Turns any hex colour into a safe set of person colours for one theme.
// Used by the token build (for the nine presets) and at run time (for custom
// colours such as ones imported from Google Calendar), so one rule decides both.
//
//   solid  the pen colour: bars, dots, chip fills. At least 3.5:1 against the
//          page and card backgrounds (WCAG asks 3:1 for graphics).
//   on     text on a solid fill, white or dark ink, at least 4.5:1.
//   tint   a light (or dark) wash for event cards, with normal text on it.

export const THEMES = {
  light: { bg: '#F2F5F7', surface: '#FFFFFF', ink: '#101820', onDark: '#FFFFFF', onLight: '#101820', tint: 0.16, toward: '#000000' },
  dark: { bg: '#121C24', surface: '#1B2833', ink: '#EEF3F6', onDark: '#FFFFFF', onLight: '#0B1117', tint: 0.28, toward: '#FFFFFF' },
};

export function parseHex(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('not a hex colour: ' + hex);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  return toHex(A.map((v, i) => v * (1 - t) + B[i] * t));
}
function lum(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = parseHex(hex).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function deriveMarker(hex, theme = 'light') {
  const T = THEMES[theme];
  let solid = toHex(parseHex(hex));
  let on = ratio(T.onDark, solid) >= ratio(T.onLight, solid) ? T.onDark : T.onLight;
  for (let step = 0; step < 60; step++) {
    on = ratio(T.onDark, solid) >= ratio(T.onLight, solid) ? T.onDark : T.onLight;
    const tint = mix(T.surface, solid, T.tint);
    const ok = ratio(solid, T.bg) >= 3.5 && ratio(solid, T.surface) >= 3.5 && ratio(on, solid) >= 4.5 && ratio(solid, tint) >= 3.1;
    if (ok) break;
    solid = mix(solid, T.toward, 0.04); // nudge toward black (light theme) or white (dark theme)
  }
  const tint = mix(T.surface, solid, T.tint);
  return { solid, on, tint };
}
