import type { Stage } from './constants';
import { normalizeAnswer } from './grading';
import { createRng, shuffle, type Rng } from './random';
import { stageAfterAnswer } from './study';

/**
 * The Learn mode engine: a pure state machine that decides which card to ask
 * next, with what kind of question, and when the session is finished.
 *
 * How it adapts:
 *   - A small window of cards is in rotation at once; a new card joins only
 *     when another is finished, so each card comes back after a few others.
 *   - The question gets harder as the card moves up: multiple choice or
 *     true/false while it is new or being learned, a typed answer once it is
 *     familiar.
 *   - A wrong answer moves the card down a stage, brings it back after two
 *     other questions (sooner than its normal turn) and costs an extra correct
 *     answer before it can move up again. A card is only finished after it
 *     has been answered correctly at the top stage, so anything answered
 *     wrongly always comes back until it is right.
 *
 * Stage changes use the same rule as stored progress (see study.ts), so what a
 * session shows always matches what is saved.
 */

export interface LearnCard {
  id: string;
  /** Plain text of each side, used for options and for grading. */
  term: string;
  definition: string;
}

export type Side = 'term' | 'definition';
export type QuestionKind = 'mc' | 'tf' | 'written';

export interface LearnOptions {
  types: Record<QuestionKind, boolean>;
  /**
   * Which side the learner answers with. `auto` shows the term and asks for
   * the definition in choice questions, and asks for whichever side is shorter
   * (usually the term) when the answer has to be typed.
   */
  answerWith: 'auto' | Side;
  /** How many cards are in rotation at once. */
  windowSize: number;
}

export const DEFAULT_LEARN_OPTIONS: LearnOptions = {
  types: { mc: true, tf: true, written: true },
  answerWith: 'auto',
  windowSize: 6,
};

export interface LearnItem {
  cardId: string;
  stage: Stage;
  /** Consecutive correct answers, carried over from stored progress. */
  streak: number;
  /** Correct answers given in this session. */
  correct: number;
  misses: number;
  /** Turn on which it was last asked, or -1. */
  lastAsked: number;
  /** Turn from which a missed card should be asked again, or null. */
  retryAt: number | null;
  done: boolean;
}

export interface LearnState {
  options: LearnOptions;
  /** Stage a card must reach to be finished. */
  target: Stage;
  /** True when every card was already at the target, so the session is a refresher. */
  refresher: boolean;
  items: Record<string, LearnItem>;
  /** Cards in rotation. */
  active: string[];
  /** Cards waiting to enter the rotation, in order. */
  pending: string[];
  /** Cards left out because they were already at the target. */
  skipped: string[];
  turn: number;
  lastCardId: string | null;
  answered: number;
  correctAnswers: number;
  rngState: number;
}

export interface McOption {
  /** The card whose text this is, or null for a generated wrong answer. */
  cardId: string | null;
  text: string;
}

export type Question =
  | { kind: 'mc'; cardId: string; promptSide: Side; answerSide: Side; options: McOption[]; correctIndex: number }
  | { kind: 'tf'; cardId: string; promptSide: Side; answerSide: Side; shown: McOption; isTrue: boolean }
  | { kind: 'written'; cardId: string; promptSide: Side; answerSide: Side; expected: string };

const STAGE_RANK: Record<Stage, number> = { new: 0, learning: 1, familiar: 2, mastered: 3 };
const other = (side: Side): Side => (side === 'term' ? 'definition' : 'term');

/** Extra wrong answers for a card (for example AI-written ones), by answer side. */
export type Distractors = Record<string, Partial<Record<Side, string[]>>>;

/** Where a card stands when the session starts. */
export type LearnStart = Record<string, { stage: Stage; streak?: number } | undefined>;

export function createLearn(
  cards: LearnCard[],
  start: LearnStart,
  options: LearnOptions = DEFAULT_LEARN_OPTIONS,
  seed = 1,
): LearnState {
  const anyType = options.types.mc || options.types.tf || options.types.written;
  const types = anyType ? options.types : DEFAULT_LEARN_OPTIONS.types;
  // Without typed answers nothing can show recall, so "familiar" is the goal.
  const target: Stage = types.written ? 'mastered' : 'familiar';
  const items: Record<string, LearnItem> = {};
  const todo: string[] = [];
  const skipped: string[] = [];

  for (const card of cards) {
    const stage = start[card.id]?.stage ?? 'new';
    const reached = STAGE_RANK[stage] >= STAGE_RANK[target];
    items[card.id] = { cardId: card.id, stage, streak: start[card.id]?.streak ?? 0, correct: 0, misses: 0, lastAsked: -1, retryAt: null, done: false };
    (reached ? skipped : todo).push(card.id);
  }

  // Everything already learned: go round once more as a refresher.
  const refresher = todo.length === 0 && skipped.length > 0;
  const queue = refresher ? skipped.splice(0) : todo;
  for (const id of skipped) items[id]!.done = true;

  const windowSize = Math.max(1, options.windowSize);
  return {
    options: { ...options, types, windowSize },
    target,
    refresher,
    items,
    active: queue.slice(0, windowSize),
    pending: queue.slice(windowSize),
    skipped,
    turn: 0,
    lastCardId: null,
    answered: 0,
    correctAnswers: 0,
    rngState: seed >>> 0 || 1,
  };
}

export function isFinished(state: LearnState): boolean {
  return state.active.length === 0 && state.pending.length === 0;
}

/** The card to ask next, or null when the session is finished. */
function pickCard(state: LearnState): string | null {
  if (state.active.length === 0) return null;
  // Never the same card twice running, unless it is the only one left.
  const candidates = state.active.length > 1 ? state.active.filter((id) => id !== state.lastCardId) : state.active;
  const item = (id: string) => state.items[id]!;

  const dueRetries = candidates.filter((id) => item(id).retryAt !== null && item(id).retryAt! <= state.turn);
  if (dueRetries.length > 0) return dueRetries.reduce((a, b) => (item(a).retryAt! <= item(b).retryAt! ? a : b));

  const ready = candidates.filter((id) => item(id).retryAt === null);
  if (ready.length > 0) return ready.reduce((a, b) => (item(a).lastAsked <= item(b).lastAsked ? a : b));

  // Only cards waiting on a retry are left: take the one due soonest.
  return candidates.reduce((a, b) => (item(a).retryAt! <= item(b).retryAt! ? a : b));
}

function averageLength(cards: LearnCard[], side: Side): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + [...card[side]].length, 0) / cards.length;
}

function chooseKind(state: LearnState, item: LearnItem, rng: Rng, enoughForChoices: boolean): QuestionKind {
  const { types } = state.options;
  const recognition: QuestionKind[] = [];
  if (types.mc && enoughForChoices) recognition.push('mc');
  if (types.tf && enoughForChoices) recognition.push('tf');
  const wantsRecall = STAGE_RANK[item.stage] >= STAGE_RANK.familiar;

  // Typed answers once the card is familiar, and whenever the set is too small to offer choices.
  if ((wantsRecall && types.written) || recognition.length === 0) return 'written';
  if (recognition.length === 1) return recognition[0]!;
  // Mostly multiple choice, with true/false mixed in once the card has been seen.
  return item.stage !== 'new' && rng.next() < 0.3 ? 'tf' : 'mc';
}

function answerSideFor(state: LearnState, kind: QuestionKind, cards: LearnCard[]): Side {
  const { answerWith } = state.options;
  if (answerWith !== 'auto') return answerWith;
  if (kind !== 'written') return 'definition';
  return averageLength(cards, 'term') <= averageLength(cards, 'definition') ? 'term' : 'definition';
}

/** Wrong answers for `card`: other cards' answers first, then any supplied extras. */
function wrongOptions(card: LearnCard, cards: LearnCard[], side: Side, count: number, rng: Rng, extra: string[] = []): McOption[] {
  const correct = normalizeAnswer(card[side]);
  const seen = new Set([correct]);
  const out: McOption[] = [];
  const consider = (option: McOption) => {
    const key = normalizeAnswer(option.text);
    if (!key || seen.has(key) || out.length >= count) return;
    seen.add(key);
    out.push(option);
  };
  // Generated distractors are written to be plausible for this exact card, so they go first.
  for (const text of shuffle(extra, rng)) consider({ cardId: null, text });
  for (const candidate of shuffle(cards, rng)) {
    if (candidate.id !== card.id) consider({ cardId: candidate.id, text: candidate[side] });
  }
  return out;
}

/**
 * The next question and the state to continue from, or null when every card
 * has reached the target stage.
 */
export function nextQuestion(
  state: LearnState,
  cards: LearnCard[],
  distractors: Distractors = {},
): { question: Question; state: LearnState } | null {
  const cardId = pickCard(state);
  if (cardId === null) return null;
  const card = cards.find((c) => c.id === cardId);
  const item = state.items[cardId];
  if (!card || !item) return null;

  const rng = createRng(state.rngState);
  const extra = distractors[cardId] ?? {};
  const enoughFor = (side: Side) => wrongOptions(card, cards, side, 1, createRng(1), extra[side]).length > 0;
  const choiceSide = answerSideFor(state, 'mc', cards);
  const kind = chooseKind(state, item, rng, enoughFor(choiceSide));
  const answerSide = answerSideFor(state, kind, cards);
  const promptSide = other(answerSide);

  let question: Question;
  if (kind === 'written') {
    question = { kind, cardId, promptSide, answerSide, expected: card[answerSide] };
  } else if (kind === 'tf') {
    const wrong = wrongOptions(card, cards, answerSide, 1, rng, extra[answerSide])[0];
    const isTrue = !wrong || rng.next() < 0.5;
    question = { kind, cardId, promptSide, answerSide, isTrue, shown: isTrue ? { cardId, text: card[answerSide] } : wrong! };
  } else {
    const options = shuffle([{ cardId, text: card[answerSide] }, ...wrongOptions(card, cards, answerSide, 3, rng, extra[answerSide])], rng);
    question = { kind, cardId, promptSide, answerSide, options, correctIndex: options.findIndex((o) => o.cardId === cardId) };
  }

  const nextState: LearnState = {
    ...state,
    rngState: rng.state(),
    lastCardId: cardId,
    turn: state.turn + 1,
    items: { ...state.items, [cardId]: { ...item, lastAsked: state.turn } },
  };
  return { question, state: nextState };
}

/** State after the learner answers `question`. */
export function answerQuestion(state: LearnState, question: Question, correct: boolean): LearnState {
  const item = state.items[question.cardId];
  if (!item || item.done) return state;

  const stage = stageAfterAnswer(item.stage, question.kind, correct, item.streak);
  const updated: LearnItem = {
    ...item,
    stage,
    streak: correct ? item.streak + 1 : 0,
    correct: item.correct + (correct ? 1 : 0),
    misses: item.misses + (correct ? 0 : 1),
    // A miss comes back after two other questions.
    retryAt: correct ? null : state.turn + 2,
  };
  updated.done = correct && STAGE_RANK[stage] >= STAGE_RANK[state.target];

  let active = state.active;
  let pending = state.pending;
  if (updated.done) {
    active = active.filter((id) => id !== item.cardId);
    if (pending.length > 0) {
      active = [...active, pending[0]!];
      pending = pending.slice(1);
    }
  }
  return {
    ...state,
    items: { ...state.items, [item.cardId]: updated },
    active,
    pending,
    answered: state.answered + 1,
    correctAnswers: state.correctAnswers + (correct ? 1 : 0),
  };
}

export interface LearnSummary {
  total: number;
  done: number;
  remaining: number;
  byStage: Record<Stage, number>;
  /** Cards missed at least once this session, most-missed first. */
  struggling: string[];
  accuracy: number | null;
}

export function summarize(state: LearnState): LearnSummary {
  const items = Object.values(state.items);
  const byStage: Record<Stage, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const item of items) byStage[item.stage]++;
  const done = items.filter((i) => i.done).length;
  return {
    total: items.length,
    done,
    remaining: items.length - done,
    byStage,
    struggling: items
      .filter((i) => i.misses > 0)
      .sort((a, b) => b.misses - a.misses)
      .map((i) => i.cardId),
    accuracy: state.answered > 0 ? Math.round((state.correctAnswers / state.answered) * 100) : null,
  };
}
