/** Every time zone this browser knows, so a family anywhere can pick theirs. Falls back to a short list on old browsers. */
const FALLBACK = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];

// Some browsers still report the old spelling of a few zones. People look for the current one.
const MODERN: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Rangoon': 'Asia/Yangon', 'Europe/Kiev': 'Europe/Kyiv', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires' };
const modern = (z: string) => MODERN[z] ?? z;

export function allZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (list && list.length > 20) { const m = [...new Set(list.map(modern))]; return m.includes('UTC') ? m : [...m, 'UTC']; }
  } catch { /* use the short list */ }
  return FALLBACK;
}
export const browserZone = () => { try { return modern(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/New_York'; } catch { return 'America/New_York'; } };
export const zoneLabel = (z: string) => z.replace(/_/g, ' ');
