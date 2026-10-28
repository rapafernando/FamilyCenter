import { cookies, headers } from 'next/headers';
import { env } from './env';
import { resolveCtx, type Ctx, type Jar } from './rpc';

/** The caller's cookies as the handlers see them. Session cookies are http-only and never readable by page scripts. */
export async function makeJar(): Promise<Jar> {
  const store = await cookies();
  return {
    get: (n) => store.get(n)?.value,
    set: (n, v, o) => store.set(n, v, { httpOnly: true, secure: env.secureCookies, sameSite: 'lax', path: '/', maxAge: o?.maxAge }),
    delete: (n) => { store.delete(n); },
  };
}

/** The client address. Only trusted when the app sits behind your own reverse proxy (TRUST_PROXY=true): the proxy adds the real address last. */
export async function clientIp(): Promise<string> {
  if (process.env.TRUST_PROXY !== 'true') return 'direct';
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  return xff ? xff.split(',').pop()!.trim() : h.get('x-real-ip') ?? 'direct';
}

export async function requestCtx(): Promise<Ctx> { return resolveCtx(await makeJar(), await clientIp()); }

/** Browsers send Origin on cross-site POSTs. A request from another site is refused. */
export function sameOrigin(req: Request): boolean {
  const o = req.headers.get('origin');
  if (!o) return true; // same-origin GET-style fetches and non-browser clients
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    return new URL(o).host === host || (!!env.baseUrl && o === env.baseUrl);
  } catch { return false; }
}
