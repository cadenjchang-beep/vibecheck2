import { eq, sql } from 'drizzle-orm';
import type { MediaRef } from '@shared/api';
import { LIMITS } from '@shared/constants';
import { db } from '../db/client';
import { media, storageUsage } from '../db/schema';
import type { Viewer } from '../http/context';
import { badRequest, notFound, paymentRequired } from '../http/errors';
import { newId } from '../ids';
import { viewableSetCondition } from './policies';
import { storage } from './storage';

export type MediaKind = 'image' | 'audio';

interface Sniffed {
  kind: MediaKind;
  mime: string;
  ext: string;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Works out what a file really is from its first bytes. The browser's claimed
 * type and the file name are ignored: only formats recognised here are stored,
 * which keeps HTML, SVG and scripts out of the bucket.
 */
export function sniffMedia(bytes: Uint8Array): Sniffed | null {
  if (bytes.length < 12) return null;
  const [b0, b1, b2, b3] = bytes;
  if (b0 === 0x89 && ascii(bytes, 1, 3) === 'PNG') return { kind: 'image', mime: 'image/png', ext: 'png' };
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { kind: 'image', mime: 'image/gif', ext: 'gif' };
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const format = ascii(bytes, 8, 4);
    if (format === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
    if (format === 'WAVE') return { kind: 'audio', mime: 'audio/wav', ext: 'wav' };
    return null;
  }
  if (ascii(bytes, 0, 3) === 'ID3') return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  if (b0 === 0xff && (b1! & 0xe0) === 0xe0 && (b1! & 0x06) !== 0) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
  if (ascii(bytes, 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
  if (b0 === 0x1a && b1 === 0x45 && b2 === 0xdf && b3 === 0xa3) return { kind: 'audio', mime: 'audio/webm', ext: 'webm' };
  if (ascii(bytes, 4, 4) === 'ftyp') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
  return null;
}

export async function uploadMedia(viewer: Viewer, kind: MediaKind, file: File): Promise<MediaRef> {
  const entitled = kind === 'image' ? viewer.entitlements.imageUploads : viewer.entitlements.audioUploads;
  if (!entitled) throw paymentRequired(kind === 'image' ? 'imageUploads' : 'audioUploads');

  const limit = kind === 'image' ? LIMITS.imageBytes : LIMITS.audioBytes;
  if (file.size === 0) throw badRequest('empty_file', 'That file is empty.');
  if (file.size > limit) {
    throw badRequest('file_too_large', `That file is too large. The limit is ${Math.round(limit / 1024 / 1024)} MB.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMedia(bytes);
  if (!sniffed || sniffed.kind !== kind) {
    throw badRequest(
      'unsupported_file',
      kind === 'image' ? 'Use a PNG, JPEG, WebP or GIF image.' : 'Use an MP3, M4A, WAV, OGG or WebM audio file.',
    );
  }

  // Reserve the space first so parallel uploads cannot overshoot the quota.
  const reserved = await db
    .insert(storageUsage)
    .values({ userId: viewer.id, bytes: bytes.length })
    .onConflictDoUpdate({
      target: storageUsage.userId,
      set: { bytes: sql`${storageUsage.bytes} + ${bytes.length}` },
      setWhere: sql`${storageUsage.bytes} + ${bytes.length} <= ${viewer.entitlements.storageBytes}`,
    })
    .returning({ bytes: storageUsage.bytes });
  if (reserved.length === 0) throw badRequest('storage_full', 'You have used all of your upload storage.');

  const id = newId();
  const storageKey = `media/${viewer.id}/${id}.${sniffed.ext}`;
  try {
    await storage.put(storageKey, bytes, sniffed.mime);
    await db.insert(media).values({ id, ownerId: viewer.id, kind, mime: sniffed.mime, sizeBytes: bytes.length, storageKey });
  } catch (err) {
    await releaseStorage(viewer.id, bytes.length);
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
  return { id, url: `/api/media/${id}` };
}

async function releaseStorage(userId: string, bytes: number): Promise<void> {
  await db
    .update(storageUsage)
    .set({ bytes: sql`greatest(0, ${storageUsage.bytes} - ${bytes})` })
    .where(eq(storageUsage.userId, userId));
}

/**
 * A file is readable by its uploader, and by anyone who may view a set that
 * has a card using it. So media on a private set is exactly as private as the set.
 */
export async function loadReadableMedia(viewer: Viewer | null, mediaId: string) {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row) throw notFound();
  if (viewer && row.ownerId === viewer.id) return { row, shared: false };
  const visible = await db.execute<{ visibility: string }>(sql`
    select s.visibility from cards c
    join sets s on s.id = c.set_id
    where (c.term_image_id = ${mediaId} or c.definition_image_id = ${mediaId}
           or c.term_audio_id = ${mediaId} or c.definition_audio_id = ${mediaId})
      and ${viewableSetCondition(viewer?.id ?? null)}
    limit 1
  `);
  if (visible.rows.length === 0) throw notFound();
  return { row, shared: true };
}

/** Deletes uploads that no card uses any more. Run from the scheduler. */
export async function purgeOrphanedMedia(olderThanHours = 24): Promise<number> {
  const orphans = await db.execute<{ id: string; owner_id: string; storage_key: string; size_bytes: number }>(sql`
    select m.id, m.owner_id, m.storage_key, m.size_bytes from media m
    where m.created_at < now() - make_interval(hours => ${olderThanHours})
      and not exists (
        select 1 from cards c
        where c.term_image_id = m.id or c.definition_image_id = m.id
           or c.term_audio_id = m.id or c.definition_audio_id = m.id
      )
    limit 500
  `);
  for (const orphan of orphans.rows) {
    await storage.delete(orphan.storage_key).catch(() => undefined);
    await db.delete(media).where(eq(media.id, orphan.id));
    await releaseStorage(orphan.owner_id, orphan.size_bytes);
  }
  return orphans.rows.length;
}
