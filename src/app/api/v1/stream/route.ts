import { subscribe } from '@/server/bus';
import { requestCtx } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A one-way stream of "something changed" pings for the caller's household. The browser re-reads what it is showing.
export async function GET(req: Request) {
  const c = await requestCtx();
  if (c.kind === 'anon' || !c.householdId) return new Response('Sign in first', { status: 401 });
  const enc = new TextEncoder();
  let off: (() => void) | undefined; let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (s: string) => { try { ctrl.enqueue(enc.encode(s)); } catch { /* closed */ } };
      send('retry: 3000\n\n');
      off = subscribe(c.householdId!, (t) => send(`event: change\ndata: ${JSON.stringify({ t })}\n\n`));
      timer = setInterval(() => send(': keepalive\n\n'), 25_000);
      req.signal.addEventListener('abort', () => { off?.(); clearInterval(timer); try { ctrl.close(); } catch { /* already closed */ } });
    },
    cancel() { off?.(); clearInterval(timer); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' } });
}
