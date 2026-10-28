import { ApiError } from '@/lib/types';
import { call, statusFor } from '@/server/rpc';
import { ensureRegistry } from '@/server/handlers';
import { clientIp, makeJar, requestCtx, sameOrigin } from '@/server/http';
import { resolveCtx } from '@/server/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BODY = 40 * 1024 * 1024;
const H = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const out = (body: unknown, status = 200) => Response.json(body, { status, headers: H });

export async function POST(req: Request) {
  ensureRegistry();
  if (!sameOrigin(req)) return out({ ok: false, error: { code: 'forbidden', message: 'That request came from another site.' } }, 403);
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) return out({ ok: false, error: { code: 'invalid', message: 'Send JSON.' } }, 415);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return out({ ok: false, error: { code: 'too_big', message: 'That upload is too large. Send fewer pictures at once.' } }, 413);
  let body: { m?: unknown; a?: unknown };
  try { body = await req.json(); } catch { return out({ ok: false, error: { code: 'invalid', message: 'Send valid JSON.' } }, 400); }
  if (typeof body.m !== 'string' || body.m.length > 60) return out({ ok: false, error: { code: 'invalid', message: 'Unknown request.' } }, 400);
  try {
    const c = await resolveCtx(await makeJar(), await clientIp());
    const r = await call(c, body.m, body.a);
    return out({ ok: true, r });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('server_error', 'Something went wrong on our side. Try again in a moment.');
    if (!(e instanceof ApiError)) console.error('unhandled error in', body.m, e instanceof Error ? e.message : e);
    return out({ ok: false, error: { code: err.code, message: err.message } }, statusFor(err.code));
  }
}
void requestCtx;
