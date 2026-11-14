import { describe, expect, it } from 'vitest';
import type { Stage } from './constants';
import { answerQuestion, createLearn, DEFAULT_LEARN_OPTIONS, isFinished, nextQuestion, summarize, type LearnCard, type LearnOptions, type LearnState, type Question } from './learn';
import { createRng } from './random';

const deck = (count: number): LearnCard[] => Array.from({ length: count }, (_, i) => ({ id: `c${i + 1}`, term: `term ${i + 1}`, definition: `the definition of thing number ${i + 1}` }));

interface Asked {
  question: Question;
  correct: boolean;
  turn: number;
}

/** Plays a whole session, answering each question with `policy`. */
function play(
  cards: LearnCard[],
  policy: (question: Question, askedBefore: number) => boolean,
  options: Partial<LearnOptions> = {},
  stages: Record<string, Stage> = {},
  seed = 7,
): { state: LearnState; log: Asked[] } {
  // A card stored as "learning" got there with one correct answer, hence the streak.
  const start = Object.fromEntries(Object.entries(stages).map(([id, stage]) => [id, { stage, streak: 1 }]));
  let state = createLearn(cards, start, { ...DEFAULT_LEARN_OPTIONS, ...options }, seed);
  const log: Asked[] = [];
  const seen = new Map<string, number>();
  for (let guard = 0; guard < 5000; guard++) {
    const step = nextQuestion(state, cards);
    if (!step) return { state, log };
    const before = seen.get(step.question.cardId) ?? 0;
    const correct = policy(step.question, before);
    seen.set(step.question.cardId, before + 1);
    log.push({ question: step.question, correct, turn: guard });
    state = answerQuestion(step.state, step.question, correct);
  }
  throw new Error('session did not finish');
}

describe('Learn mode', () => {
  it('finishes once every card has been mastered', () => {
    const cards = deck(12);
    const { state, log } = play(cards, () => true);
    expect(isFinished(state)).toBe(true);
    expect(summarize(state)).toMatchObject({ total: 12, done: 12, remaining: 0, accuracy: 100 });
    expect(Object.values(state.items).every((i) => i.stage === 'mastered')).toBe(true);
    // Three correct answers per card: new → learning → familiar → mastered.
    expect(log).toHaveLength(36);
  });

  it('asks easier questions first and typed answers last', () => {
    const cards = deck(8);
    const { log } = play(cards, () => true);
    for (const card of cards) {
      const kinds = log.filter((l) => l.question.cardId === card.id).map((l) => l.question.kind);
      expect(kinds).toHaveLength(3);
      expect(kinds[0]).toBe('mc'); // a brand-new card always starts with multiple choice
      expect(['mc', 'tf']).toContain(kinds[1]);
      expect(kinds[2]).toBe('written');
    }
    // All three question types are actually used.
    expect(new Set(log.map((l) => l.question.kind))).toEqual(new Set(['mc', 'tf', 'written']));
  });

  it('brings back a card answered wrongly until it is answered correctly', () => {
    const cards = deck(10);
    const missTwice = new Set(['c2', 'c5', 'c9']);
    const { state, log } = play(cards, (q, askedBefore) => !(missTwice.has(q.cardId) && askedBefore < 2));
    expect(isFinished(state)).toBe(true);
    for (const id of missTwice) {
      const answers = log.filter((l) => l.question.cardId === id);
      const lastMiss = answers.map((a) => a.correct).lastIndexOf(false);
      expect(lastMiss).toBe(1);
      // After its last miss the card came back and was answered correctly.
      expect(answers.slice(lastMiss + 1).length).toBeGreaterThanOrEqual(1);
      expect(answers.slice(lastMiss + 1).every((a) => a.correct)).toBe(true);
      expect(state.items[id]).toMatchObject({ done: true, stage: 'mastered', misses: 2 });
      // Two misses, then the three correct answers it takes to climb from "learning".
      expect(answers.map((a) => a.correct)).toEqual([false, false, true, true, true]);
    }
  });

  it('never finishes a card on a wrong answer, whatever the answers are', () => {
    // Random answers, right about two times in three, across many sessions.
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed);
      const cards = deck(3 + (seed % 9));
      const { state, log } = play(cards, () => rng.next() < 0.66, {}, {}, seed);
      expect(isFinished(state)).toBe(true);
      for (const card of cards) {
        const answers = log.filter((l) => l.question.cardId === card.id);
        // The last answer to every card is correct…
        expect(answers[answers.length - 1]!.correct).toBe(true);
        // …and every miss is followed by another question on the same card.
        answers.forEach((a, i) => {
          if (!a.correct) expect(answers[i + 1]).toBeDefined();
        });
        expect(state.items[card.id]!.done).toBe(true);
      }
    }
  });

  it('returns a missed card sooner than its normal turn, and more often overall', () => {
    const cards = deck(10);
    const { log } = play(cards, (q, askedBefore) => !(q.cardId === 'c1' && askedBefore === 0));
    const turns = log.filter((l) => l.question.cardId === 'c1').map((l) => l.turn);
    // Missed at its first turn, it is asked again after two other questions…
    expect(turns[1]! - turns[0]!).toBe(3);
    // …whereas a card answered correctly waits for the rest of the window.
    const other = log.filter((l) => l.question.cardId === 'c2').map((l) => l.turn);
    expect(other[1]! - other[0]!).toBeGreaterThan(3);
    // And it is asked more times in total than a card that was never missed.
    expect(turns.length).toBeGreaterThan(other.length);
  });

  it('does not ask the same card twice in a row while others are available', () => {
    const cards = deck(6);
    const rng = createRng(3);
    const { log } = play(cards, () => rng.next() < 0.5);
    for (let i = 1; i < log.length; i++) {
      const remaining = new Set(log.slice(i).map((l) => l.question.cardId));
      if (remaining.size > 1) expect(log[i]!.question.cardId).not.toBe(log[i - 1]!.question.cardId);
    }
  });

  it('keeps only a few cards in rotation at once', () => {
    const cards = deck(30);
    let state = createLearn(cards, {}, { ...DEFAULT_LEARN_OPTIONS, windowSize: 5 }, 1);
    expect(state.active).toHaveLength(5);
    expect(state.pending).toHaveLength(25);
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const step = nextQuestion(state, cards)!;
      seen.add(step.question.cardId);
      state = answerQuestion(step.state, step.question, false);
    }
    // With every answer wrong, no new card is introduced.
    expect(seen.size).toBeLessThanOrEqual(5);
  });

  it('continues from where the learner already is', () => {
    const cards = deck(4);
    const { log, state } = play(cards, () => true, {}, { c1: 'mastered', c2: 'familiar', c3: 'learning' });
    expect(state.skipped).toEqual(['c1']);
    expect(log.filter((l) => l.question.cardId === 'c1')).toHaveLength(0);
    // A familiar card goes straight to a typed answer.
    expect(log.filter((l) => l.question.cardId === 'c2').map((l) => l.question.kind)).toEqual(['written']);
    expect(log.filter((l) => l.question.cardId === 'c3')).toHaveLength(2);
    expect(summarize(state).done).toBe(4);
  });

  it('offers a refresher round when everything is already mastered', () => {
    const cards = deck(3);
    const stages = { c1: 'mastered', c2: 'mastered', c3: 'mastered' } as const;
    const { state, log } = play(cards, () => true, {}, stages);
    expect(state.refresher).toBe(true);
    expect(log).toHaveLength(3);
    expect(log.every((l) => l.question.kind === 'written')).toBe(true);
  });

  it('stops at "familiar" when typed answers are switched off', () => {
    const cards = deck(5);
    const { state, log } = play(cards, () => true, { types: { mc: true, tf: true, written: false } });
    expect(state.target).toBe('familiar');
    expect(log.every((l) => l.question.kind !== 'written')).toBe(true);
    expect(Object.values(state.items).every((i) => i.stage === 'familiar' && i.done)).toBe(true);
  });

  it('uses only the question types that are switched on', () => {
    const cards = deck(5);
    expect(play(cards, () => true, { types: { mc: false, tf: false, written: true } }).log.every((l) => l.question.kind === 'written')).toBe(true);
    expect(play(cards, () => true, { types: { mc: false, tf: true, written: false } }).log.every((l) => l.question.kind === 'tf')).toBe(true);
  });

  it('builds multiple-choice questions with one right answer and no duplicates', () => {
    const cards = [...deck(6), { id: 'dup', term: 'twin', definition: 'the definition of thing number 1' }];
    let state = createLearn(cards, {}, { ...DEFAULT_LEARN_OPTIONS, types: { mc: true, tf: false, written: false } }, 5);
    for (let i = 0; i < 30; i++) {
      const step = nextQuestion(state, cards);
      if (!step) break;
      const q = step.question;
      if (q.kind !== 'mc') throw new Error('expected multiple choice');
      const card = cards.find((c) => c.id === q.cardId)!;
      expect(q.options.length).toBe(4);
      expect(q.options[q.correctIndex]).toEqual({ cardId: card.id, text: card.definition });
      expect(new Set(q.options.map((o) => o.text)).size).toBe(q.options.length);
      // No other option has the same text as the right answer.
      expect(q.options.filter((o) => o.text === card.definition)).toHaveLength(1);
      state = answerQuestion(step.state, q, true);
    }
  });

  it('offers fewer choices in a tiny set, and falls back to typing when there is only one card', () => {
    const two = deck(2);
    const first = nextQuestion(createLearn(two, {}, DEFAULT_LEARN_OPTIONS, 1), two)!.question;
    expect(first.kind).toBe('mc');
    expect(first.kind === 'mc' && first.options.length).toBe(2);

    const one = deck(1);
    const only = nextQuestion(createLearn(one, {}, DEFAULT_LEARN_OPTIONS, 1), one)!.question;
    expect(only.kind).toBe('written');
    expect(play(one, () => true).state.items.c1!.done).toBe(true);
  });

  it('true/false statements are true about half the time, and the false ones really are false', () => {
    const cards = deck(12);
    const { log } = play(cards, () => true, { types: { mc: false, tf: true, written: false } });
    const statements = log.map((l) => l.question).filter((q) => q.kind === 'tf');
    const trues = statements.filter((q) => q.isTrue).length;
    expect(trues).toBeGreaterThan(statements.length * 0.2);
    expect(trues).toBeLessThan(statements.length * 0.8);
    for (const q of statements) {
      const card = cards.find((c) => c.id === q.cardId)!;
      expect(q.shown.text === card.definition).toBe(q.isTrue);
    }
  });

  it('chooses the answer side sensibly: recognise the definition, type the shorter side', () => {
    const cards = deck(5);
    const { log } = play(cards, () => true);
    for (const { question } of log) {
      if (question.kind === 'written') {
        expect(question.answerSide).toBe('term');
        expect(question.promptSide).toBe('definition');
      } else {
        expect(question.answerSide).toBe('definition');
      }
    }
    const forced = play(cards, () => true, { answerWith: 'definition' }).log;
    expect(forced.every((l) => l.question.answerSide === 'definition')).toBe(true);
  });

  it('prefers supplied wrong answers when they are available', () => {
    const cards = deck(5);
    const state = createLearn(cards, {}, { ...DEFAULT_LEARN_OPTIONS, types: { mc: true, tf: false, written: false } }, 2);
    const step = nextQuestion(state, cards, { c1: { definition: ['plausible wrong A', 'plausible wrong B', 'plausible wrong C'] } })!;
    const q = step.question;
    expect(q.cardId).toBe('c1');
    if (q.kind !== 'mc') throw new Error('expected multiple choice');
    expect(q.options.filter((o) => o.cardId === null).map((o) => o.text).sort()).toEqual(['plausible wrong A', 'plausible wrong B', 'plausible wrong C']);
  });

  it('is repeatable for a given seed and differs between seeds', () => {
    const cards = deck(9);
    const kinds = (seed: number) => play(cards, () => true, {}, {}, seed).log.map((l) => `${l.question.cardId}:${l.question.kind}:${l.question.kind === 'mc' ? l.question.correctIndex : ''}`);
    expect(kinds(11)).toEqual(kinds(11));
    expect(kinds(11)).not.toEqual(kinds(12));
  });

  it('reports who is struggling and how the session is going', () => {
    const cards = deck(6);
    const { state } = play(cards, (q, askedBefore) => !(q.cardId === 'c4' && askedBefore < 3) && !(q.cardId === 'c2' && askedBefore < 1));
    const summary = summarize(state);
    expect(summary.struggling).toEqual(['c4', 'c2']);
    expect(summary.accuracy).toBeLessThan(100);
    expect(summary.byStage.mastered).toBe(6);
  });

  it('handles an empty set', () => {
    const state = createLearn([], {}, DEFAULT_LEARN_OPTIONS, 1);
    expect(isFinished(state)).toBe(true);
    expect(nextQuestion(state, [])).toBeNull();
  });
});
