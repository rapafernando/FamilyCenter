import { z } from 'zod';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, type Slide } from '@/lib/types';
import { plain } from '../db';
import { env } from '../env';
import { sha256, sign } from '../crypto';
import { def, limit, tenant, zId, zStr } from '../rpc';
import { clean } from './core';

/* ---------------------------------------------------------------- upload rules */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PER_CALL = 10;
export const MAX_ALBUM_PHOTOS = 2000;
type Kind = { mime: string; ext: string };

/** Decide the type from the first bytes, never from what the browser says. */
export function sniffImage(b: Buffer): Kind | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (b.length > 12 && /^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1'))) return { mime: 'image/gif', ext: 'gif' };
  return null;
}
/** Width and height from the picture's own header, so imported pictures need no trust in what the sender says. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    if (b.subarray(0, 4).toString('latin1') === 'RIFF') {
      const t = b.subarray(12, 16).toString('latin1');
      if (t === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      return null;
    }
    if (b.subarray(0, 3).toString('latin1') === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  } catch { /* fall through */ }
  return null;
}
export const photoPath = (hid: string, key: string) => join(env.photoDir, hid, key);
const dataUrl = z.string().max(Math.ceil(MAX_PHOTO_BYTES * 1.4) + 100).regex(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/);
export const photoUrl = (id: string) => `/api/photo/${id}`;

type Row = { id: string; name: string; show_on_display: boolean };

export const media = {
  listAlbums: def('read', [], async (c) => tenant(c, async (t) => {
    const albums = await t.all<Row>('select id, name, show_on_display from photo_albums order by created_at');
    const photos = await t.all<{ id: string; album_id: string; caption: string | null }>('select id, album_id, caption from photos where deleted_at is null and album_id is not null order by created_at');
    return albums.map((a) => ({ id: a.id, name: a.name, showOnDisplay: a.show_on_display, photos: photos.filter((p) => p.album_id === a.id).map((p) => ({ id: p.id, dataUrl: photoUrl(p.id), caption: p.caption ?? '' })) }));
  })),
  createAlbum: def('settings', [zStr(60)], async (c, name) => {
    if (!clean(name)) throw new ApiError('missing', 'Give the album a name.');
    const r = await tenant(c, (t) => t.one<{ id: string }>('insert into photo_albums (household_id, name) values ($1,$2) returning id', [c.hid, clean(name)]));
    return { id: r!.id, name: clean(name), showOnDisplay: true };
  }, { write: true }),
  updateAlbum: def('settings', [zId, z.object({ name: zStr(60).optional(), showOnDisplay: z.boolean().optional() })], async (c, id, p) => {
    if (p.name !== undefined && !clean(p.name)) throw new ApiError('missing', 'Give the album a name.');
    const n = await tenant(c, (t) => t.exec('update photo_albums set name = coalesce($2,name), show_on_display = coalesce($3,show_on_display) where id = $1', [id, p.name === undefined ? null : clean(p.name), p.showOnDisplay ?? null]));
    if (!n) throw new ApiError('not_found', 'That album was not found.');
  }, { write: true }),
  deleteAlbum: def('settings', [zId], async (c, id) => {
    const keys = await tenant(c, async (t) => {
      const k = await t.all<{ storage_key: string }>('select storage_key from photos where album_id = $1', [id]);
      await t.exec('delete from photos where album_id = $1', [id]);
      await t.exec('delete from photo_albums where id = $1', [id]);
      return k;
    });
    await Promise.all(keys.map((k) => rm(photoPath(c.hid, k.storage_key), { force: true })));
  }, { write: true }),
  addPhotos: def('member', [zId, z.array(z.object({ dataUrl, caption: zStr(200), width: z.number().int().min(1).max(20000), height: z.number().int().min(1).max(20000) })).min(1).max(MAX_PER_CALL)], async (c, albumId, files) => {
    limit(`photos:${c.hid}`, 200, 3600_000);
    const prepared = files.map((f) => {
      const buf = Buffer.from(f.dataUrl.slice(f.dataUrl.indexOf(',') + 1), 'base64');
      if (buf.length > MAX_PHOTO_BYTES) throw new ApiError('too_big', 'Each photo can be up to 8 MB.');
      const kind = sniffImage(buf);
      if (!kind) throw new ApiError('bad_type', 'Only JPEG, PNG, WebP and GIF pictures can be added.');
      return { buf, kind, f, key: `${crypto.randomUUID()}.${kind.ext}`, hash: sha256(buf.toString('base64')) };
    });
    await mkdir(join(env.photoDir, c.hid), { recursive: true });
    const written: string[] = [];
    try {
      let added = 0;
      await tenant(c, async (t) => {
        if (!(await t.one('select 1 from photo_albums where id = $1', [albumId]))) throw new ApiError('not_found', 'That album was not found.');
        const count = (await t.one<{ n: number }>('select count(*)::int as n from photos where household_id = $1 and deleted_at is null', [c.hid]))!.n;
        if (count + prepared.length > MAX_ALBUM_PHOTOS) throw new ApiError('limit', `A household can keep up to ${MAX_ALBUM_PHOTOS} photos.`);
        for (const p of prepared) {
          // The same picture added twice to a household is skipped, not stored twice.
          const r = await t.one('insert into photos (household_id, album_id, storage_key, mime, bytes, width, height, caption, sha256, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict do nothing returning id',
            [c.hid, albumId, p.key, p.kind.mime, p.buf.length, p.f.width, p.f.height, clean(p.f.caption) || null, p.hash, c.userId ?? null]);
          if (r) { await writeFile(photoPath(c.hid, p.key), p.buf, { mode: 0o600 }); written.push(p.key); added++; }
        }
      });
      return { added, skipped: prepared.length - added };
    } catch (e) { await Promise.all(written.map((k) => rm(photoPath(c.hid, k), { force: true }))); throw e; }
  }, { write: true }),
  deletePhoto: def('member', [zId], async (c, id) => {
    const r = await tenant(c, async (t) => {
      const p = await t.one<{ storage_key: string }>('select storage_key from photos where id = $1', [id]);
      if (p) await t.exec('delete from photos where id = $1', [id]);
      return p;
    });
    if (r) await rm(photoPath(c.hid, r.storage_key), { force: true });
  }, { write: true }),

  /* ---------------------------------------------------------------- screensaver and ads */
  screensaverSlides: def('read', [z.number().int().min(1).max(30), z.number().int().min(0).max(1_000_000)], async (c, count, cursor) => {
    const { photos, hh } = await tenant(c, async (t) => ({
      photos: await t.all<{ id: string; caption: string | null }>('select p.id, p.caption from photos p join photo_albums a on a.id = p.album_id and a.household_id = p.household_id where a.show_on_display and p.deleted_at is null order by p.created_at, p.id'),
      hh: (await t.one<{ ads_enabled: boolean; ads_every_n_photos: number }>('select ads_enabled, ads_every_n_photos from households where id = $1', [c.hid]))!,
    }));
    if (!photos.length) return { slides: [] as Slide[], next: cursor };
    // Platform ad table: not tenant data, and it holds nothing about this household.
    const ads = hh.ads_enabled ? await plain((t) => t.all<{ id: string; advertiser: string; headline: string | null; body: string; weight: number }>(
      "select id, advertiser, headline, body, weight from ad_campaigns where active and child_safe and 'screensaver' = any(placements) and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) order by id")) : [];
    const pool = ads.flatMap((a) => Array<typeof a>(a.weight).fill(a));
    const every = hh.ads_every_n_photos; const slides: Slide[] = []; let n = cursor;
    for (let i = 0; i < count; i++, n++) {
      const round = Math.floor(n / (every + 1));
      if (pool.length && n % (every + 1) === every) { const a = pool[round % pool.length]; slides.push({ type: 'ad', id: `ad-${n}`, campaignId: a.id, advertiser: a.advertiser, headline: a.headline ?? '', body: a.body }); }
      else { const p = photos[(n - round) % photos.length]; slides.push({ type: 'photo', id: `${p.id}-${n}`, dataUrl: photoUrl(p.id), caption: p.caption ?? '' }); }
    }
    return { slides, next: n };
  }),
  /** A short-lived signed link. The click goes out without any household, device or user id attached. */
  adHandoff: def('read', [zId], async (_c, campaignId) => {
    const ok = await plain((t) => t.one("select 1 from ad_campaigns where id = $1 and active and child_safe", [campaignId]));
    if (!ok) throw new ApiError('not_found', 'That ad is no longer running.');
    return { url: `/api/v1/ads/handoff/${encodeURIComponent(sign({ a: campaignId }, 120))}` };
  }),
  adImpression: def('read', [zId], async (_c, campaignId) => { await bump(campaignId, 'impressions'); }),
};

export async function bump(campaignId: string, col: 'impressions' | 'clicks' | 'handoffs') {
  await plain((t) => t.exec(`insert into ad_stats_daily (campaign_id, day, placement, ${col}) select id, (now() at time zone 'utc')::date, 'screensaver', 1 from ad_campaigns where id = $1
    on conflict (campaign_id, day, placement) do update set ${col} = ad_stats_daily.${col} + 1`, [campaignId])).catch(() => {});
}
