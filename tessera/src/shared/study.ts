import type { Stage, StudyMode } from './constants';
import { dueAfterDays, NEW_SCHEDULE, schedule, type Rating, type Schedule } from './srs';

/**
 * How studying changes a card's progress.
 *
 * The same functions run in the browser (so the interface updates instantly
 * and works offline) and on the server (which is authoritative). Everything a
 * learner does is recorded as a `StudyEvent`; progress is the result of
 * applying those events in order.
 */

export interface CardProgress extends Schedule {
  stage: Stage;
  correctCount: number;
  incorrectCount: number;
  /** Consecutive correct answers. */
  streak: number;
  starred: boolean;
}

export const NEW_PROGRESS: CardProgress = {
  ...NEW_SCHEDULE,
  stage: 'new',
  correctCount: 0,
  incorrectCount: 0,
  streak: 0,
  starred: false,
};

/**
 * mc         multiple choice           recognition
 * tf         true / false              recognition
 * matching   match game, test matching recognition
 * flashcard  "know it" self-report     recognition
 * written    typed from memory         recall
 */
export const ANSWER_KINDS = ['mc', 'tf', 'matching', 'flashcard', 'written'] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

interface EventBase {
  /** Generated on the device; makes a replayed event harmless. */
  id: string;
  cardId: string;
  setId: string;
  /** ISO time the answer was given, which may be well before it is synced. */
  at: string;
}

export interface AnswerEvent extends EventBase {
  type: 'answer';
  mode: StudyMode;
  kind: AnswerKind;
  correct: boolean;
}

export interface RatingEvent extends EventBase {
  type: 'rating';
  mode: 'review';
  rating: Rating;
}

export type StudyEvent = AnswerEvent | RatingEvent;

const LADDER: Stage[] = ['new', 'learning', 'familiar', 'mastered'];

/**
 * The mastery ladder: new → learning → familiar → mastered.
 *
 * A correct answer moves a card up one step. Recognising the right answer is
 * weaker evidence than producing it, so recognition alone stops at "familiar";
 * only recall (a typed answer, or a passed spaced-repetition review) reaches
 * "mastered".
 */
export function promote(stage: Stage, recall: boolean): Stage {
  const next = LADDER[Math.min(LADDER.indexOf(stage) + 1, LADDER.length - 1)]!;
  if (next === 'mastered' && !recall) return stage === 'mastered' ? 'mastered' : 'familiar';
  return next;
}

/** A wrong answer moves a card down one step, but a card once seen is never "new" again. */
export function demote(stage: Stage): Stage {
  return LADDER[Math.max(1, LADDER.indexOf(stage) - 1)]!;
}

/**
 * The stage after an answer. `streak` is the number of consecutive correct
 * answers before this one.
 *
 * Leaving "learning" takes two correct answers in a row. Without that, a card
 * answered wrongly the first time would be in the same position as one
 * answered correctly; with it, every miss costs one extra correct answer.
 */
export function stageAfterAnswer(stage: Stage, kind: AnswerKind, correct: boolean, streak: number): Stage {
  if (!correct) return demote(stage);
  if (stage === 'learning' && streak < 1) return 'learning';
  return promote(stage, kind === 'written');
}

export function stageAfterRating(stage: Stage, rating: Rating): Stage {
  if (rating === 1) return 'learning';
  if (rating === 2) return stage === 'new' ? 'learning' : stage;
  return promote(stage, true);
}

function applyAnswer(progress: CardProgress, event: AnswerEvent, timeZone: string): CardProgress {
  const now = new Date(event.at);
  const next: CardProgress = {
    ...progress,
    stage: stageAfterAnswer(progress.stage, event.kind, event.correct, progress.streak),
    correctCount: progress.correctCount + (event.correct ? 1 : 0),
    incorrectCount: progress.incorrectCount + (event.correct ? 0 : 1),
    streak: event.correct ? progress.streak + 1 : 0,
    lastReviewedAt: event.at,
  };
  // Practice modes do not drive the review schedule, with two exceptions that
  // feed the daily queue: a card studied for the first time is queued for
  // tomorrow, and a card answered wrongly is queued for review now.
  if (!event.correct) {
    if (progress.dueAt === null || new Date(progress.dueAt).getTime() > now.getTime()) next.dueAt = event.at;
  } else if (progress.dueAt === null) {
    next.dueAt = dueAfterDays(now, 1, timeZone).toISOString();
  }
  return next;
}

function applyRating(progress: CardProgress, event: RatingEvent, timeZone: string): CardProgress {
  const passed = event.rating !== 1;
  return {
    ...progress,
    ...schedule(progress, event.rating, new Date(event.at), timeZone),
    stage: stageAfterRating(progress.stage, event.rating),
    correctCount: progress.correctCount + (passed ? 1 : 0),
    incorrectCount: progress.incorrectCount + (passed ? 0 : 1),
    streak: passed ? progress.streak + 1 : 0,
  };
}

/** Progress after one event. Pure: the input is not modified. */
export function applyEvent(progress: CardProgress | undefined, event: StudyEvent, timeZone = 'UTC'): CardProgress {
  const current = progress ?? NEW_PROGRESS;
  return event.type === 'rating' ? applyRating(current, event, timeZone) : applyAnswer(current, event, timeZone);
}

/** Whether an event counts as a correct answer, for totals and accuracy. */
export function isCorrect(event: StudyEvent): boolean {
  return event.type === 'rating' ? event.rating !== 1 : event.correct;
}

/** What the server stores for one finished stretch of studying. */
export interface SessionInput {
  /** Generated on the device, so a session recorded offline is stored once. */
  clientId: string;
  setId: string | null;
  mode: StudyMode;
  startedAt: string;
  endedAt: string;
  /** Time actually spent studying: pauses and idle time are left out. */
  durationSeconds: number;
  cardsStudied: number;
  correctCount: number;
  incorrectCount: number;
  /** Percentage for scored modes. */
  score?: number | null;
  details?: Record<string, unknown>;
}
