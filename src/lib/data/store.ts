'use client';
import { emptyState, seed, type State } from './state';

const KEY = 'fc-demo-v1';
let state: State | null = null;
let version = 0;
const subs = new Set<() => void>();
let wired = false;

function read(): State {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; if (s.v === 1) return s; } } catch { /* fall through */ }
  const s = seed(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: stay in memory */ }
  return s;
}
export function getState(): State {
  if (typeof window === 'undefined') throw new Error('The demo data lives in the browser');
  if (!state) state = read();
  if (!wired) {
    wired = true;
    // Another tab changed the data: this is how a phone tab and a wall tab stay in step in the demo.
    window.addEventListener('storage', (e) => { if (e.key === KEY) { state = read(); version++; subs.forEach((f) => f()); } });
  }
  return state;
}
export function commit<T>(fn: (s: State) => T): T {
  const s = getState();
  const r = fn(s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota: keep working in memory */ }
  version++; subs.forEach((f) => f());
  return r;
}
export function replaceState(s: State) { state = s; commit(() => 0); }
export const resetDemo = () => replaceState(seed());
export const resetEmpty = (o: Parameters<typeof emptyState>[0]) => replaceState(emptyState(o));
/** Tell every screen that is showing data to read it again. */
export function bump() { version++; subs.forEach((f) => f()); }
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getVersion = () => version;

// Session: the signed-in person lives in this tab (sessionStorage), the paired display lives in this browser (localStorage).
const U = 'fc-user', D = 'fc-device', S = 'fc-surface';
const get = (st: 'sessionStorage' | 'localStorage', k: string) => { try { return window[st].getItem(k); } catch { return null; } };
const put = (st: 'sessionStorage' | 'localStorage', k: string, v: string | null) => { try { v === null ? window[st].removeItem(k) : window[st].setItem(k, v); } catch { /* ignore */ } };
export const sessionUserId = () => get('sessionStorage', U);
export const setSessionUserId = (id: string | null) => { put('sessionStorage', U, id); version++; subs.forEach((f) => f()); };
export const sessionDeviceId = () => get('localStorage', D);
export const setSessionDeviceId = (id: string | null) => { put('localStorage', D, id); version++; subs.forEach((f) => f()); };
export const surfacePref = () => (get('localStorage', S) as 'wall' | 'handheld' | null);
export const setSurfacePref = (v: 'wall' | 'handheld' | null) => { put('localStorage', S, v); version++; subs.forEach((f) => f()); };
