import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { media } from '../db/schema';
import { log } from '../log';
import { storage } from './storage';

/**
 * Runs before a user row is removed. The database cascades every row the user
 * owns; uploaded files live outside it and are deleted here.
 */
export async function beforeAccountDeletion(userId: string): Promise<void> {
  const files = await db.select({ key: media.storageKey }).from(media).where(eq(media.ownerId, userId));
  const results = await Promise.allSettled(files.map((f) => storage.delete(f.key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  log.info({ userId, files: files.length, failed }, 'account deletion: removed uploaded files');
}
