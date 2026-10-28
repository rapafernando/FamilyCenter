import { plain } from '@/server/db';
import { verify } from '@/server/crypto';
import { bump } from '@/server/handlers/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The tap on an ad lands here, then goes straight on. Nothing about the household, screen or person is sent along.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = verify<{ a: string }>(decodeURIComponent(token));
  if (!t?.a) return new Response('This link has expired.', { status: 410 });
  const row = await plain((x) => x.one<{ click_url: string }>('select click_url from ad_campaigns where id = $1 and active and child_safe', [t.a]));
  if (!row || !row.click_url.startsWith('https://')) return new Response('This ad is no longer running.', { status: 410 });
  await bump(t.a, 'handoffs');
  return new Response(null, { status: 302, headers: { location: row.click_url, 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
