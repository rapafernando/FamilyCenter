import { env } from '@/server/env';
import { finishGoogleConnect } from '@/server/google';
import { finishPhotosImport, hasPhotosCookie } from '@/server/gphotos';
import { clientIp, makeJar } from '@/server/http';
import { resolveCtx } from '@/server/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const jar = await makeJar();
  const c = await resolveCtx(jar, await clientIp());
  const to = c.kind === 'anon' ? '/signin' : (hasPhotosCookie(jar) ? await finishPhotosImport(c, new URL(req.url).searchParams) : await finishGoogleConnect(c, new URL(req.url).searchParams));
  return new Response(null, { status: 303, headers: { location: new URL(to, env.baseUrl || req.url).toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}
