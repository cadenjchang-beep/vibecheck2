import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import {
  aiUsage,
  assignments,
  cardProgress,
  cards,
  classes,
  classMembers,
  dailyActivity,
  folders,
  matchScores,
  media,
  reviewLogs,
  setFolderLinks,
  sets,
  setUserState,
  streaks,
  studySessions,
  subscriptions,
  users,
} from '../db/schema';
import type { Viewer } from '../http/context';
import { log } from '../log';
import { cancelBillingForDeletion } from './billing';
import { storage } from './storage';

/**
 * Runs before a user row is removed. The database cascades every row the user
 * owns; uploaded files live outside it and are deleted here, and a paid
 * subscription is cancelled so it is not charged again.
 */
export async function beforeAccountDeletion(userId: string): Promise<void> {
  try {
    await cancelBillingForDeletion(userId);
  } catch (error) {
    log.error({ userId, err: error instanceof Error ? error.message : String(error) }, 'account deletion: could not cancel subscription');
  }
  const files = await db.select({ key: media.storageKey }).from(media).where(eq(media.ownerId, userId));
  const results = await Promise.allSettled(files.map((f) => storage.delete(f.key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  log.info({ userId, files: files.length, failed }, 'account deletion: removed uploaded files');
}

/** Everything held about the viewer, as one JSON document (data portability). */
export async function exportAccountData(viewer: Viewer) {
  const id = viewer.id;
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      plan: users.plan,
      planExpiresAt: users.planExpiresAt,
      locale: users.locale,
      timezone: users.timezone,
      dailyGoal: users.dailyGoal,
      reminderChannel: users.reminderChannel,
      reminderHour: users.reminderHour,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));
  const ownSets = await db.select().from(sets).where(eq(sets.ownerId, id));
  const setIds = ownSets.map((s) => s.id);
  const ownFolders = await db.select().from(folders).where(eq(folders.ownerId, id));
  const folderIds = ownFolders.map((f) => f.id);
  const [
    ownCards,
    links,
    setState,
    sessions,
    progress,
    reviews,
    matches,
    streak,
    activity,
    taught,
    memberships,
    assigned,
    ai,
    subscription,
    uploads,
  ] = await Promise.all([
    setIds.length
      ? db
          .select({
            id: cards.id,
            setId: cards.setId,
            position: cards.position,
            term: cards.termPlain,
            definition: cards.definitionPlain,
            termMarkup: cards.term,
            definitionMarkup: cards.definition,
            aiGenerated: cards.aiGenerated,
          })
          .from(cards)
          .where(inArray(cards.setId, setIds))
      : [],
    folderIds.length ? db.select().from(setFolderLinks).where(inArray(setFolderLinks.folderId, folderIds)) : [],
    db.select().from(setUserState).where(eq(setUserState.userId, id)),
    db.select().from(studySessions).where(eq(studySessions.userId, id)),
    db.select().from(cardProgress).where(eq(cardProgress.userId, id)),
    db.select().from(reviewLogs).where(eq(reviewLogs.userId, id)),
    db.select().from(matchScores).where(eq(matchScores.userId, id)),
    db.select().from(streaks).where(eq(streaks.userId, id)),
    db.select().from(dailyActivity).where(eq(dailyActivity.userId, id)),
    db.select().from(classes).where(eq(classes.teacherId, id)),
    db.select().from(classMembers).where(eq(classMembers.userId, id)),
    db.select().from(assignments).where(eq(assignments.assignedBy, id)),
    db.select({ feature: aiUsage.feature, createdAt: aiUsage.createdAt }).from(aiUsage).where(eq(aiUsage.userId, id)),
    db
      .select({ provider: subscriptions.provider, status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(eq(subscriptions.userId, id)),
    db.select({ id: media.id, kind: media.kind, mime: media.mime, bytes: media.sizeBytes, createdAt: media.createdAt }).from(media).where(eq(media.ownerId, id)),
  ]);
  return {
    format: 'tessera-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    sets: ownSets.map((s) => ({ ...s, cards: ownCards.filter((c) => c.setId === s.id).sort((a, b) => a.position - b.position) })),
    folders: ownFolders.map((f) => ({ ...f, setIds: links.filter((l) => l.folderId === f.id).map((l) => l.setId) })),
    setActivity: setState,
    cardProgress: progress,
    reviewLog: reviews,
    studySessions: sessions,
    matchScores: matches,
    streak: streak[0] ?? null,
    dailyActivity: activity,
    classesTaught: taught,
    classMemberships: memberships,
    assignmentsCreated: assigned,
    aiRequests: ai,
    subscription: subscription[0] ?? null,
    uploads,
  };
}
