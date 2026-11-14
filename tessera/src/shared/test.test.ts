import { describe, expect, it } from 'vitest';
import type { LearnCard } from './learn';
import { buildReviewQueue } from './review';
import { cardCount, DEFAULT_TEST_CONFIG, generateTest, gradeQuestion, gradeTest, MATCHING_GROUP, type TestConfig, type TestQuestion, type TestResponses } from './test';

const deck = (count: number): LearnCard[] => Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, term: `term ${i + 1}`, definition: `the definition of thing number ${i + 1}` }));
const config = (patch: Partial<TestConfig> = {}): TestConfig => ({ ...DEFAULT_TEST_CONFIG, ...patch });
const only = (kind: keyof TestConfig['types']): TestConfig['types'] => ({ tf: false, mc: false, matching: false, written: false, [kind]: true });

/** The response that answers a question perfectly. */
function perfect(question: TestQuestion): TestResponses[string] {
  if (question.kind === 'tf') return question.isTrue;
  if (question.kind === 'mc') return question.correctIndex;
  if (question.kind === 'written') return question.expected;
  return Object.fromEntries(question.cardIds.map((id) => [id, id]));
}
const cardsOf = (q: TestQuestion) => (q.kind === 'matching' ? q.cardIds : [q.cardId]);

describe('generating a test', () => {
  it('tests the number of cards asked for, each exactly once', () => {
    const cards = deck(40);
    for (const count of [1, 7, 20, 40]) {
      const questions = generateTest(cards, config({ count }), 3);
      const used = questions.flatMap(cardsOf);
      expect(used).toHaveLength(count);
      expect(new Set(used).size).toBe(count);
      expect(cardCount(questions)).toBe(count);
    }
  });

  it('never asks for more cards than the set has', () => {
    const questions = generateTest(deck(5), config({ count: 50 }), 1);
    expect(cardCount(questions)).toBe(5);
  });

  it('spreads cards evenly over the chosen question types', () => {
    const questions = generateTest(deck(40), config({ count: 20 }), 9);
    const perKind = { tf: 0, mc: 0, matching: 0, written: 0 };
    for (const q of questions) perKind[q.kind] += cardsOf(q).length;
    expect(perKind).toEqual({ tf: 5, mc: 5, matching: 5, written: 5 });
    // Sections come in a fixed order, easiest first.
    const order = questions.map((q) => q.kind);
    expect(order).toEqual([...order].sort((a, b) => ['tf', 'mc', 'matching', 'written'].indexOf(a) - ['tf', 'mc', 'matching', 'written'].indexOf(b)));
  });

  it('uses only the question types that are switched on', () => {
    for (const kind of ['tf', 'mc', 'matching', 'written'] as const) {
      const questions = generateTest(deck(12), config({ count: 12, types: only(kind) }), 4);
      expect(new Set(questions.map((q) => q.kind))).toEqual(new Set([kind]));
    }
  });

  it('builds multiple-choice questions with four distinct options and one right answer', () => {
    const cards = deck(10);
    for (const q of generateTest(cards, config({ count: 10, types: only('mc') }), 5)) {
      if (q.kind !== 'mc') throw new Error('expected mc');
      const card = cards.find((c) => c.id === q.cardId)!;
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
      expect(q.options[q.correctIndex]!.text).toBe(card.definition);
    }
  });

  it('groups matching into questions of a manageable size, never a group of one', () => {
    for (const count of [2, 5, 6, 11, 16]) {
      const questions = generateTest(deck(30), config({ count, types: only('matching') }), 2);
      const sizes = questions.map((q) => (q.kind === 'matching' ? q.cardIds.length : 0));
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(MATCHING_GROUP);
      for (const q of questions) {
        if (q.kind !== 'matching') throw new Error('expected matching');
        // The choices are exactly the answers to the listed prompts, in a different order.
        expect(q.choices.map((c) => c.cardId).sort()).toEqual([...q.cardIds].sort());
      }
    }
  });

  it('falls back to a typed answer when a set is too small for choices', () => {
    const questions = generateTest(deck(1), config({ count: 1 }), 1);
    expect(questions.map((q) => q.kind)).toEqual(['written']);
  });

  it('asks for the shorter side in typed answers unless told otherwise', () => {
    const cards = deck(6);
    const auto = generateTest(cards, config({ count: 6, types: only('written') }), 1);
    expect(auto.every((q) => q.answerSide === 'term' && q.promptSide === 'definition')).toBe(true);
    const forced = generateTest(cards, config({ count: 6, types: only('written'), answerWith: 'definition' }), 1);
    expect(forced.every((q) => q.answerSide === 'definition')).toBe(true);
  });

  it('is repeatable for a seed and different for another', () => {
    const cards = deck(20);
    const ids = (seed: number) => generateTest(cards, config(), seed).map((q) => `${q.kind}:${cardsOf(q).join(',')}`);
    expect(ids(42)).toEqual(ids(42));
    expect(ids(42)).not.toEqual(ids(43));
  });
});

describe('scoring a test', () => {
  const cards = deck(20);
  const questions = generateTest(cards, config({ count: 20 }), 11);

  it('gives 100% for a perfect paper and 0% for a blank one', () => {
    const responses = Object.fromEntries(questions.map((q) => [q.id, perfect(q)]));
    const full = gradeTest(questions, responses);
    expect(full).toMatchObject({ score: 100, points: 20, maxPoints: 20, unanswered: 0 });
    expect(full.questions.every((q) => q.correct)).toBe(true);

    const blank = gradeTest(questions, {});
    expect(blank).toMatchObject({ score: 0, points: 0, maxPoints: 20, unanswered: questions.length });
  });

  it('counts one point per card, so matching earns partial credit', () => {
    const matching = questions.find((q) => q.kind === 'matching')!;
    if (matching.kind !== 'matching') throw new Error('expected matching');
    const [first, second, ...rest] = matching.cardIds;
    // Swap two answers, get the rest right.
    const response = { [first!]: second!, [second!]: first!, ...Object.fromEntries(rest.map((id) => [id, id])) };
    const result = gradeQuestion(matching, response);
    expect(result).toMatchObject({ points: rest.length, maxPoints: matching.cardIds.length, correct: false, answered: true });
    expect(result.cards.filter((c) => !c.correct).map((c) => c.cardId).sort()).toEqual([first, second].sort());
  });

  it('computes the percentage from points', () => {
    const responses: TestResponses = {};
    let earned = 0;
    for (const q of questions) {
      if (q.kind === 'matching') continue; // left blank
      responses[q.id] = perfect(q);
      earned += 1;
    }
    const result = gradeTest(questions, responses);
    expect(result.points).toBe(earned);
    expect(result.score).toBe(Math.round((earned / 20) * 100));
    expect(result.unanswered).toBe(questions.filter((q) => q.kind === 'matching').length);
  });

  it('marks wrong choices wrong', () => {
    const mc = questions.find((q) => q.kind === 'mc')!;
    const tf = questions.find((q) => q.kind === 'tf')!;
    if (mc.kind !== 'mc' || tf.kind !== 'tf') throw new Error('unexpected kinds');
    expect(gradeQuestion(mc, (mc.correctIndex + 1) % mc.options.length).correct).toBe(false);
    expect(gradeQuestion(tf, !tf.isTrue).correct).toBe(false);
    expect(gradeQuestion(mc, undefined)).toMatchObject({ answered: false, correct: false });
  });

  it('grades typed answers with the same tolerance as Learn', () => {
    const written = questions.find((q) => q.kind === 'written')!;
    if (written.kind !== 'written') throw new Error('expected written');
    expect(gradeQuestion(written, written.expected.toUpperCase())).toMatchObject({ correct: true, written: 'correct' });
    expect(gradeQuestion(written, 'something else entirely')).toMatchObject({ correct: false, written: 'incorrect' });
    expect(gradeQuestion(written, '   ')).toMatchObject({ answered: false, correct: false });
  });

  it('can be strict about typos', () => {
    const cards2: LearnCard[] = [
      { id: 'a', term: 'mitochondrion', definition: 'makes ATP' },
      { id: 'b', term: 'ribosome', definition: 'makes protein' },
    ];
    const [q] = generateTest(cards2, config({ count: 1, types: only('written') }), 1);
    if (q!.kind !== 'written') throw new Error('expected written');
    const typo = q!.expected.slice(0, -1);
    expect(gradeQuestion(q!, typo, { lenient: true }).correct).toBe(true);
    expect(gradeQuestion(q!, typo, { lenient: false })).toMatchObject({ correct: false, written: 'almost' });
  });

  it('accepts either of two prompts that share the same answer in matching', () => {
    const twins: LearnCard[] = [
      { id: 'a', term: 'big', definition: 'large' },
      { id: 'b', term: 'huge', definition: 'large' },
      { id: 'c', term: 'small', definition: 'little' },
    ];
    const [q] = generateTest(twins, config({ count: 3, types: only('matching') }), 1);
    expect(gradeQuestion(q!, { a: 'b', b: 'a', c: 'c' })).toMatchObject({ points: 3, correct: true });
  });

  it('reports each card with the kind of question it was tested by', () => {
    const responses = Object.fromEntries(questions.map((q) => [q.id, perfect(q)]));
    const kinds = new Set(gradeTest(questions, responses).questions.flatMap((q) => q.cards.map((c) => c.kind)));
    expect(kinds).toEqual(new Set(['tf', 'mc', 'matching', 'written']));
  });
});

describe('building a review session', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  const candidates = [
    { cardId: 'due-yesterday', dueAt: '2026-03-09T00:00:00Z', studied: true },
    { cardId: 'due-last-week', dueAt: '2026-03-03T00:00:00Z', studied: true },
    { cardId: 'due-tomorrow', dueAt: '2026-03-11T00:00:00Z', studied: true },
    { cardId: 'due-next-month', dueAt: '2026-04-10T00:00:00Z', studied: true },
    { cardId: 'new-1', dueAt: null, studied: false },
    { cardId: 'new-2', dueAt: null, studied: false },
    { cardId: 'new-3', dueAt: null, studied: false },
  ];

  it('lists due cards, most overdue first', () => {
    expect(buildReviewQueue(candidates, now).due).toEqual(['due-last-week', 'due-yesterday']);
  });

  it('introduces a limited number of new cards, in set order', () => {
    expect(buildReviewQueue(candidates, now, 2).fresh).toEqual(['new-1', 'new-2']);
    expect(buildReviewQueue(candidates, now, 0).fresh).toEqual([]);
    expect(buildReviewQueue(candidates, now).fresh).toHaveLength(3);
  });

  it('says when the next card comes due', () => {
    expect(buildReviewQueue(candidates, now).nextDueAt).toBe('2026-03-11T00:00:00Z');
    expect(buildReviewQueue([], now)).toEqual({ due: [], fresh: [], nextDueAt: null });
  });

  it('a card is due at exactly its due time', () => {
    const exact = [{ cardId: 'x', dueAt: now.toISOString(), studied: true }];
    expect(buildReviewQueue(exact, now).due).toEqual(['x']);
  });
});
