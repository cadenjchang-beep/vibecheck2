import { gradeWritten, type WrittenResult } from './grading';
import { averageLength, wrongOptions, type Distractors, type LearnCard, type McOption, type Side } from './learn';
import { createRng, shuffle } from './random';
import type { AnswerKind } from './study';

/**
 * Practice tests: building one from a set, and scoring the answers.
 *
 * Every card appears in at most one question, and every card is worth one
 * point, so a matching question with five pairs is worth five points.
 */

export const TEST_KINDS = ['tf', 'mc', 'matching', 'written'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export interface TestConfig {
  /** How many cards to test. */
  count: number;
  types: Record<TestKind, boolean>;
  answerWith: 'auto' | Side;
}

export const DEFAULT_TEST_CONFIG: TestConfig = {
  count: 20,
  types: { tf: true, mc: true, matching: true, written: true },
  answerWith: 'auto',
};

/** Pairs in one matching question; more than this is tedious on a phone. */
export const MATCHING_GROUP = 5;

interface QuestionBase {
  id: string;
  promptSide: Side;
  answerSide: Side;
}

export type TestQuestion =
  | (QuestionBase & { kind: 'tf'; cardId: string; shown: McOption; isTrue: boolean })
  | (QuestionBase & { kind: 'mc'; cardId: string; options: McOption[]; correctIndex: number })
  | (QuestionBase & { kind: 'written'; cardId: string; expected: string })
  | (QuestionBase & {
      kind: 'matching';
      /** The cards whose prompts are listed, in display order. */
      cardIds: string[];
      /** The answers to choose from, shuffled. Each belongs to one of `cardIds`. */
      choices: Array<{ cardId: string; text: string }>;
    });

/**
 * tf: true or false · mc: index of the chosen option · written: the typed text
 * matching: for each prompt card id, the card id of the chosen answer
 */
export type TestResponse = boolean | number | string | Record<string, string>;
export type TestResponses = Record<string, TestResponse | undefined>;

const other = (side: Side): Side => (side === 'term' ? 'definition' : 'term');

/** Splits `total` cards between the enabled kinds as evenly as possible. */
function allocate(total: number, kinds: TestKind[]): Record<TestKind, number> {
  const out: Record<TestKind, number> = { tf: 0, mc: 0, matching: 0, written: 0 };
  if (kinds.length === 0) return out;
  const base = Math.floor(total / kinds.length);
  let extra = total - base * kinds.length;
  for (const kind of kinds) {
    out[kind] = base + (extra > 0 ? 1 : 0);
    extra--;
  }
  // A matching question needs at least two pairs; a lone card goes elsewhere.
  if (out.matching === 1) {
    out.matching = 0;
    const receiver = kinds.find((k) => k !== 'matching') ?? 'matching';
    out[receiver]++;
    if (receiver === 'matching') out.matching = 1;
  }
  return out;
}

export function generateTest(cards: LearnCard[], config: TestConfig, seed: number, distractors: Distractors = {}): TestQuestion[] {
  const rng = createRng(seed);
  const enabled = TEST_KINDS.filter((kind) => config.types[kind]);
  const kinds = enabled.length > 0 ? enabled : [...TEST_KINDS];
  const count = Math.max(0, Math.min(Math.floor(config.count), cards.length));
  const chosen = shuffle(cards, rng).slice(0, count);

  const choiceSide: Side = config.answerWith === 'auto' ? 'definition' : config.answerWith;
  const writtenSide: Side =
    config.answerWith === 'auto' ? (averageLength(cards, 'term') <= averageLength(cards, 'definition') ? 'term' : 'definition') : config.answerWith;

  // Choice questions need something to choose between.
  const canChoose = (card: LearnCard) => wrongOptions(card, cards, choiceSide, 1, createRng(1), distractors[card.id]?.[choiceSide]).length > 0;
  const usable = kinds.filter((kind) => kind === 'written' || kind === 'matching' ? kind !== 'matching' || chosen.length >= 2 : chosen.some(canChoose));
  const plan = allocate(chosen.length, usable.length > 0 ? usable : ['written']);

  const questions: TestQuestion[] = [];
  let cursor = 0;
  let serial = 0;
  const take = (n: number) => chosen.slice(cursor, (cursor += n));
  const nextId = () => `q${++serial}`;
  const written = (card: LearnCard): TestQuestion => ({
    id: nextId(),
    kind: 'written',
    cardId: card.id,
    promptSide: other(writtenSide),
    answerSide: writtenSide,
    expected: card[writtenSide],
  });

  for (const card of take(plan.tf)) {
    const wrong = wrongOptions(card, cards, choiceSide, 1, rng, distractors[card.id]?.[choiceSide])[0];
    if (!wrong) {
      questions.push(written(card));
      continue;
    }
    const isTrue = rng.next() < 0.5;
    questions.push({
      id: nextId(),
      kind: 'tf',
      cardId: card.id,
      promptSide: other(choiceSide),
      answerSide: choiceSide,
      isTrue,
      shown: isTrue ? { cardId: card.id, text: card[choiceSide] } : wrong,
    });
  }

  for (const card of take(plan.mc)) {
    const wrong = wrongOptions(card, cards, choiceSide, 3, rng, distractors[card.id]?.[choiceSide]);
    if (wrong.length === 0) {
      questions.push(written(card));
      continue;
    }
    const options = shuffle([{ cardId: card.id, text: card[choiceSide] }, ...wrong], rng);
    questions.push({
      id: nextId(),
      kind: 'mc',
      cardId: card.id,
      promptSide: other(choiceSide),
      answerSide: choiceSide,
      options,
      correctIndex: options.findIndex((o) => o.cardId === card.id),
    });
  }

  const matching = take(plan.matching);
  for (let i = 0; i < matching.length; i += MATCHING_GROUP) {
    let group = matching.slice(i, i + MATCHING_GROUP);
    // Avoid a trailing group of one by borrowing from the group before it.
    if (group.length === 1 && i > 0) {
      const previous = questions[questions.length - 1];
      if (previous?.kind === 'matching' && previous.cardIds.length > 2) {
        const movedId = previous.cardIds.pop()!;
        previous.choices = previous.choices.filter((c) => c.cardId !== movedId);
        group = [cards.find((c) => c.id === movedId)!, ...group];
      }
    }
    if (group.length < 2) {
      for (const card of group) questions.push(written(card));
      continue;
    }
    questions.push({
      id: nextId(),
      kind: 'matching',
      promptSide: other(choiceSide),
      answerSide: choiceSide,
      cardIds: group.map((c) => c.id),
      choices: shuffle(
        group.map((c) => ({ cardId: c.id, text: c[choiceSide] })),
        rng,
      ),
    });
  }

  for (const card of take(plan.written)) questions.push(written(card));
  // Anything left over through rounding is asked as a written question.
  for (const card of chosen.slice(cursor)) questions.push(written(card));
  return questions;
}

export interface CardResult {
  cardId: string;
  /** How the card was tested, for the progress record. */
  kind: AnswerKind;
  correct: boolean;
}

export interface QuestionResult {
  questionId: string;
  answered: boolean;
  /** Every card in the question answered correctly. */
  correct: boolean;
  points: number;
  maxPoints: number;
  cards: CardResult[];
  /** For written questions: exact, close enough, or wrong. */
  written?: WrittenResult;
}

export interface TestResult {
  questions: QuestionResult[];
  points: number;
  maxPoints: number;
  /** 0-100, rounded. */
  score: number;
  unanswered: number;
}

const KIND_TO_ANSWER: Record<TestKind, AnswerKind> = { tf: 'tf', mc: 'mc', matching: 'matching', written: 'written' };

export function gradeQuestion(question: TestQuestion, response: TestResponse | undefined, options: { lenient?: boolean } = {}): QuestionResult {
  const kind = KIND_TO_ANSWER[question.kind];
  if (question.kind === 'matching') {
    const picks = typeof response === 'object' && response !== null ? response : {};
    const byText = new Map(question.choices.map((c) => [c.cardId, c.text]));
    const cards = question.cardIds.map((cardId) => {
      const picked = picks[cardId];
      // Two cards can share the same answer text; either choice is then right.
      const correct = picked !== undefined && (picked === cardId || byText.get(picked) === byText.get(cardId));
      return { cardId, kind, correct };
    });
    const points = cards.filter((c) => c.correct).length;
    return {
      questionId: question.id,
      answered: question.cardIds.some((id) => picks[id] !== undefined),
      correct: points === cards.length,
      points,
      maxPoints: cards.length,
      cards,
    };
  }

  let correct = false;
  let answered = response !== undefined;
  let written: WrittenResult | undefined;
  if (question.kind === 'tf') correct = typeof response === 'boolean' && response === question.isTrue;
  else if (question.kind === 'mc') correct = typeof response === 'number' && response === question.correctIndex;
  else {
    const text = typeof response === 'string' ? response : '';
    answered = text.trim() !== '';
    const grade = gradeWritten(text, question.expected, options);
    correct = grade.correct;
    written = grade.result;
  }
  return {
    questionId: question.id,
    answered,
    correct,
    points: correct ? 1 : 0,
    maxPoints: 1,
    cards: [{ cardId: question.cardId, kind, correct }],
    written,
  };
}

export function gradeTest(questions: TestQuestion[], responses: TestResponses, options: { lenient?: boolean } = {}): TestResult {
  const results = questions.map((q) => gradeQuestion(q, responses[q.id], options));
  const points = results.reduce((sum, r) => sum + r.points, 0);
  const maxPoints = results.reduce((sum, r) => sum + r.maxPoints, 0);
  return {
    questions: results,
    points,
    maxPoints,
    score: maxPoints === 0 ? 0 : Math.round((points / maxPoints) * 100),
    unanswered: results.filter((r) => !r.answered).length,
  };
}

/** Number of cards a list of questions covers. */
export function cardCount(questions: TestQuestion[]): number {
  return questions.reduce((sum, q) => sum + (q.kind === 'matching' ? q.cardIds.length : 1), 0);
}
