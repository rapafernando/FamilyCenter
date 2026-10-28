import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { withTenant } from '@/server/db';
import { requestCtx } from '@/server/http';
import { photoPath } from '@/server/handlers/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pictures are served only to a signed-in person or a paired screen of the same household. Row security does the household check.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response('Not found', { status: 404 });
  const c = await requestCtx();
  if (c.kind === 'anon' || !c.householdId) return new Response('Sign in first', { status: 401 });
  const p = await withTenant(c.householdId, (t) => t.one<{ storage_key: string; mime: string }>('select storage_key, mime from photos where id = $1 and deleted_at is null', [id]));
  if (!p) return new Response('Not found', { status: 404 });
  try {
    const buf = await readFile(photoPath(c.householdId, p.storage_key));
    return new Response(new Uint8Array(buf), { headers: {
      'content-type': p.mime, 'content-length': String(buf.length), 'cache-control': 'private, max-age=86400, immutable',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'content-disposition': 'inline', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' } });
  } catch { return new Response('Not found', { status: 404 }); }
}
