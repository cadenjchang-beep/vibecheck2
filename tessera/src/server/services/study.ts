import { and, eq, inArray, sql } from 'drizzle-orm';
import type { CardProgressDto } from '@shared/api';
import type { Stage } from '@shared/constants';
import { computeStreak, localDay } from '@shared/dates';
import type { SyncInput } from '@shared/schemas';
import { applyEvent, isCorrect, NEW_PROGRESS, type CardProgress, type StudyEvent } from '@shared/study';
import { db, type Tx } from '../db/client';
import { cardProgress, cards, dailyActivity, matchScores, reviewLogs, setUserState, streaks, studySessions } from '../db/schema';
import type { Viewer } from '../http/context';
import { HttpError } from '../http/errors';
import { newId } from '../ids';
import { loadViewableSet } from './policies';
import { toProgressDto } from './sets';

export interface SyncResult {
  /** Authoritative progress for every card the batch touched. */
  progress: Record<string, CardProgressDto>;
  appliedEvents: number;
  streak: { current: number; longest: number };
}

const CHUNK = 500;
const MAX_AGE_MS = 400 * 86_400_000;

/** Events arrive with the device's clock; keep them within a believable range. */
function clampTime(iso: string, now: number): Date {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time) || time > now + 60_000 || time < now - MAX_AGE_MS) return new Date(now);
  return new Date(time);
}

interface DayTotals {
  cards: number;
  correct: number;
  incorrect: number;
  seconds: number;
  sessions: number;
}

function addTo(days: Map<string, DayTotals>, day: string, patch: Partial<DayTotals>): void {
  const current = days.get(day) ?? { cards: 0, correct: 0, incorrect: 0, seconds: 0, sessions: 0 };
  for (const [key, value] of Object.entries(patch)) current[key as keyof DayTotals] += value ?? 0;
  days.set(day, current);
}

/** The sets among `setIds` that the viewer may study; the rest are silently skipped. */
async function studyableSets(tx: Tx, viewer: Viewer, setIds: string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  for (const setId of setIds) {
    try {
      await loadViewableSet(viewer, setId, tx);
      allowed.add(setId);
    } catch (err) {
      // Deleted or made private since the device last saw it: drop those events.
      if (!(err instanceof HttpError && err.status === 404)) throw err;
    }
  }
  return allowed;
}

function toProgress(row: typeof cardProgress.$inferSelect): CardProgress {
  return {
    stage: row.stage as Stage,
    easeFactor: row.easeFactor,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    correctCount: row.correctCount,
    incorrectCount: row.incorrectCount,
    streak: row.streak,
    starred: row.starred,
  };
}

/**
 * Applies a batch of study activity from one device.
 *
 * The batch can be replayed safely: events, sessions and scores each carry an
 * id generated on the device, and anything already stored is skipped. The
 * whole batch is one transaction, serialised per user, so two devices syncing
 * at once cannot interleave their updates to the same card.
 */
export async function syncStudy(viewer: Viewer, input: SyncInput): Promise<SyncResult> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${viewer.id}, 0))`);

    const setIds = [...new Set([...input.events.map((e) => e.setId), ...input.sessions.map((s) => s.setId), ...input.matchScores.map((m) => m.setId)].filter((v): v is string => Boolean(v)))];
    const allowedSets = await studyableSets(tx, viewer, setIds);
    const days = new Map<string, DayTotals>();
    const lastStudied = new Map<string, Date>();
    const touch = (setId: string, at: Date) => {
      const previous = lastStudied.get(setId);
      if (!previous || previous < at) lastStudied.set(setId, at);
    };

    // ── Events ───────────────────────────────────────────────────────────────
    let events: Array<StudyEvent & { time: Date }> = input.events.filter((e) => allowedSets.has(e.setId)).map((e) => ({ ...e, time: clampTime(e.at, now) }));
    const progress = new Map<string, CardProgress>();
    let appliedEvents = 0;

    if (events.length > 0) {
      const eventIds = events.map((e) => e.id);
      const seen = await tx
        .select({ id: reviewLogs.clientEventId })
        .from(reviewLogs)
        .where(and(eq(reviewLogs.userId, viewer.id), inArray(reviewLogs.clientEventId, eventIds)));
      const seenIds = new Set(seen.map((s) => s.id));
      const firstOfId = new Set<string>();
      events = events.filter((e) => {
        if (seenIds.has(e.id) || firstOfId.has(e.id)) return false;
        firstOfId.add(e.id);
        return true;
      });
    }

    if (events.length > 0) {
      const cardIds = [...new Set(events.map((e) => e.cardId))];
      const cardRows = await tx.select({ id: cards.id, setId: cards.setId }).from(cards).where(inArray(cards.id, cardIds));
      const cardSet = new Map(cardRows.map((c) => [c.id, c.setId]));
      // A card must still exist and belong to the set the event names.
      events = events.filter((e) => cardSet.get(e.cardId) === e.setId);
    }

    if (events.length > 0) {
      const cardIds = [...new Set(events.map((e) => e.cardId))];
      const rows = await tx
        .select()
        .from(cardProgress)
        .where(and(eq(cardProgress.userId, viewer.id), inArray(cardProgress.cardId, cardIds)))
        .for('update');
      for (const row of rows) progress.set(row.cardId, toProgress(row));

      events.sort((a, b) => a.time.getTime() - b.time.getTime());
      const logs: Array<typeof reviewLogs.$inferInsert> = [];
      const cardSetIds = new Map<string, string>();
      for (const event of events) {
        const at = event.time.toISOString();
        const next = applyEvent(progress.get(event.cardId) ?? NEW_PROGRESS, { ...event, at }, viewer.timezone);
        progress.set(event.cardId, next);
        cardSetIds.set(event.cardId, event.setId);
        logs.push({
          userId: viewer.id,
          cardId: event.cardId,
          setId: event.setId,
          mode: event.mode,
          kind: event.type === 'rating' ? 'rating' : event.kind,
          correct: isCorrect(event),
          rating: event.type === 'rating' ? event.rating : null,
          stageAfter: next.stage,
          intervalAfter: next.intervalDays,
          easeAfter: next.easeFactor,
          reviewedAt: event.time,
          clientEventId: event.id,
        });
        const correct = isCorrect(event);
        addTo(days, localDay(event.time, viewer.timezone), { cards: 1, correct: correct ? 1 : 0, incorrect: correct ? 0 : 1 });
        touch(event.setId, event.time);
      }

      const progressRows = [...progress].map(([cardId, p]) => ({
        userId: viewer.id,
        cardId,
        setId: cardSetIds.get(cardId)!,
        stage: p.stage,
        easeFactor: p.easeFactor,
        intervalDays: p.intervalDays,
        repetitions: p.repetitions,
        lapses: p.lapses,
        dueAt: p.dueAt ? new Date(p.dueAt) : null,
        lastReviewedAt: p.lastReviewedAt ? new Date(p.lastReviewedAt) : null,
        correctCount: p.correctCount,
        incorrectCount: p.incorrectCount,
        streak: p.streak,
        updatedAt: new Date(now),
      }));
      for (let i = 0; i < progressRows.length; i += CHUNK) {
        await tx
          .insert(cardProgress)
          .values(progressRows.slice(i, i + CHUNK))
          .onConflictDoUpdate({
            target: [cardProgress.userId, cardProgress.cardId],
            // The star is set elsewhere and must survive a sync.
            set: {
              stage: sql`excluded.stage`,
              easeFactor: sql`excluded.ease_factor`,
              intervalDays: sql`excluded.interval_days`,
              repetitions: sql`excluded.repetitions`,
              lapses: sql`excluded.lapses`,
              dueAt: sql`excluded.due_at`,
              lastReviewedAt: sql`excluded.last_reviewed_at`,
              correctCount: sql`excluded.correct_count`,
              incorrectCount: sql`excluded.incorrect_count`,
              streak: sql`excluded.streak`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
      for (let i = 0; i < logs.length; i += CHUNK) await tx.insert(reviewLogs).values(logs.slice(i, i + CHUNK));
      appliedEvents = events.length;
    }

    // ── Sessions ─────────────────────────────────────────────────────────────
    for (const session of input.sessions) {
      const setId = session.setId && allowedSets.has(session.setId) ? session.setId : null;
      if (session.setId && !setId) continue;
      const endedAt = clampTime(session.endedAt, now);
      const startedAtRaw = clampTime(session.startedAt, now);
      const startedAt = startedAtRaw > endedAt ? endedAt : startedAtRaw;
      // Active time can never exceed the wall-clock length of the session.
      const durationSeconds = Math.min(session.durationSeconds, Math.max(0, Math.ceil((endedAt.getTime() - startedAt.getTime()) / 1000)));
      const inserted = await tx
        .insert(studySessions)
        .values({
          id: newId(),
          userId: viewer.id,
          setId,
          mode: session.mode,
          startedAt,
          endedAt,
          durationSeconds,
          cardsStudied: session.cardsStudied,
          correctCount: session.correctCount,
          incorrectCount: session.incorrectCount,
          score: session.score ?? null,
          details: session.details && JSON.stringify(session.details).length <= 20_000 ? session.details : null,
          clientId: session.clientId,
        })
        .onConflictDoNothing({ target: [studySessions.userId, studySessions.clientId] })
        .returning({ id: studySessions.id });
      if (inserted.length === 0) continue;
      addTo(days, localDay(endedAt, viewer.timezone), { seconds: durationSeconds, sessions: 1 });
      if (setId) touch(setId, endedAt);
    }

    // ── Match scores ─────────────────────────────────────────────────────────
    for (const score of input.matchScores) {
      if (!allowedSets.has(score.setId)) continue;
      await tx
        .insert(matchScores)
        .values({ id: newId(), userId: viewer.id, setId: score.setId, timeMs: score.timeMs, pairs: score.pairs, mistakes: score.mistakes, clientId: score.clientId })
        .onConflictDoNothing({ target: [matchScores.userId, matchScores.clientId] });
    }

    // ── Daily totals, recency and streak ─────────────────────────────────────
    for (const [day, totals] of days) {
      await tx
        .insert(dailyActivity)
        .values({
          userId: viewer.id,
          day,
          cardsStudied: totals.cards,
          correctCount: totals.correct,
          incorrectCount: totals.incorrect,
          secondsStudied: totals.seconds,
          sessions: totals.sessions,
        })
        .onConflictDoUpdate({
          target: [dailyActivity.userId, dailyActivity.day],
          set: {
            cardsStudied: sql`${dailyActivity.cardsStudied} + excluded.cards_studied`,
            correctCount: sql`${dailyActivity.correctCount} + excluded.correct_count`,
            incorrectCount: sql`${dailyActivity.incorrectCount} + excluded.incorrect_count`,
            secondsStudied: sql`${dailyActivity.secondsStudied} + excluded.seconds_studied`,
            sessions: sql`${dailyActivity.sessions} + excluded.sessions`,
          },
        });
    }
    for (const [setId, at] of lastStudied) {
      await tx
        .insert(setUserState)
        .values({ userId: viewer.id, setId, lastStudiedAt: at, lastOpenedAt: at })
        .onConflictDoUpdate({
          target: [setUserState.userId, setUserState.setId],
          set: { lastStudiedAt: sql`greatest(${setUserState.lastStudiedAt}, excluded.last_studied_at)` },
        });
    }

    const streak = days.size > 0 ? await refreshStreak(tx, viewer) : await readStreak(tx, viewer);

    const result: Record<string, CardProgressDto> = {};
    if (progress.size > 0) {
      const rows = await tx
        .select()
        .from(cardProgress)
        .where(and(eq(cardProgress.userId, viewer.id), inArray(cardProgress.cardId, [...progress.keys()])));
      for (const row of rows) result[row.cardId] = toProgressDto(row);
    }
    return { progress: result, appliedEvents, streak };
  });
}

/** Recomputes the streak from the days that have activity, which also absorbs late offline syncs. */
async function refreshStreak(tx: Tx, viewer: Pick<Viewer, 'id' | 'timezone'>): Promise<{ current: number; longest: number }> {
  const rows = await tx
    .select({ day: dailyActivity.day })
    .from(dailyActivity)
    .where(and(eq(dailyActivity.userId, viewer.id), sql`(${dailyActivity.cardsStudied} > 0 or ${dailyActivity.secondsStudied} > 0)`))
    .orderBy(sql`${dailyActivity.day} desc`)
    .limit(1000);
  const days = rows.map((r) => r.day);
  const computed = computeStreak(days, localDay(new Date(), viewer.timezone));
  const [stored] = await tx
    .insert(streaks)
    .values({ userId: viewer.id, currentStreak: computed.current, longestStreak: computed.longest, lastActiveDay: days[0] ?? null })
    .onConflictDoUpdate({
      target: streaks.userId,
      set: {
        currentStreak: computed.current,
        longestStreak: sql`greatest(${streaks.longestStreak}, ${computed.longest})`,
        lastActiveDay: days[0] ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ current: streaks.currentStreak, longest: streaks.longestStreak });
  return stored ?? computed;
}

/** The streak as of today: a stored streak lapses once a whole day has been missed. */
export async function readStreak(tx: Tx, viewer: Pick<Viewer, 'id' | 'timezone'>): Promise<{ current: number; longest: number }> {
  const [row] = await tx.select().from(streaks).where(eq(streaks.userId, viewer.id)).limit(1);
  if (!row) return { current: 0, longest: 0 };
  const today = localDay(new Date(), viewer.timezone);
  const alive = row.lastActiveDay !== null && computeStreak([row.lastActiveDay], today).current > 0;
  return { current: alive ? row.currentStreak : 0, longest: row.longestStreak };
}
