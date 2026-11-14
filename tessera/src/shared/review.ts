import { isDue } from './srs';

/**
 * Builds a spaced-repetition session from what is already known about a set.
 * It runs on the device, so reviewing a set works offline.
 */

export interface ReviewCandidate {
  cardId: string;
  /** Null when the card has never been studied. */
  dueAt: string | null;
  studied: boolean;
}

export interface ReviewQueue {
  /** Cards whose review is due, most overdue first. */
  due: string[];
  /** Cards never studied, introduced a few at a time, in set order. */
  fresh: string[];
  /** When the next card comes due, if none are due now. */
  nextDueAt: string | null;
}

const DEFAULT_NEW_PER_SESSION = 10;

export function buildReviewQueue(candidates: ReviewCandidate[], now: Date, newLimit = DEFAULT_NEW_PER_SESSION): ReviewQueue {
  const due = candidates
    .filter((c) => isDue(c.dueAt, now))
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
    .map((c) => c.cardId);
  const fresh = candidates
    .filter((c) => !c.studied && c.dueAt === null)
    .slice(0, Math.max(0, newLimit))
    .map((c) => c.cardId);
  const upcoming = candidates
    .filter((c) => c.dueAt !== null && !isDue(c.dueAt, now))
    .map((c) => c.dueAt!)
    .sort();
  return { due, fresh, nextDueAt: upcoming[0] ?? null };
}

/**
 * Where a card rated "again" goes back into the session: a few cards later, so
 * it is seen again before the session ends but not straight away.
 */
export function requeuePosition(remaining: number): number {
  return Math.min(remaining, 3);
}
