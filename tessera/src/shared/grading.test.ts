import { describe, expect, it } from 'vitest';
import { acceptedAnswers, editDistance, gradeWritten, normalizeAnswer } from './grading';

const result = (given: string, expected: string, lenient = true) => gradeWritten(given, expected, { lenient });

describe('grading typed answers', () => {
  it('ignores case, spacing and stray punctuation', () => {
    expect(result('  Mitochondrion ', 'mitochondrion').result).toBe('correct');
    expect(result('to speak!', 'To speak').result).toBe('correct');
    expect(result('Golgi   apparatus.', 'Golgi apparatus').result).toBe('correct');
  });

  it('accepts any one of several listed alternatives', () => {
    expect(result('to do', 'to do, to make').result).toBe('correct');
    expect(result('to make', 'to do, to make').result).toBe('correct');
    expect(result('color', 'colour/color').result).toBe('correct');
    expect(result('to owe', 'must, should; to owe').result).toBe('correct');
    expect(result('should', 'must, should; to owe').result).toBe('correct');
  });

  it('accepts all the alternatives together, in any order', () => {
    expect(result('to make, to do', 'to do, to make').result).toBe('correct');
    expect(result('to do; to make', 'to do, to make').result).toBe('correct');
    // …but not a mix of a right and a wrong answer.
    expect(result('to do, to eat', 'to do, to make').correct).toBe(false);
  });

  it('treats bracketed detail as optional', () => {
    expect(result('to be', 'to be (identity, origin, lasting traits)').result).toBe('correct');
    expect(result('to be (identity, origin, lasting traits)', 'to be (identity, origin, lasting traits)').result).toBe('correct');
    expect(result('to know', 'to know (facts, how to do something)').result).toBe('correct');
  });

  it('does not split a sentence at its commas', () => {
    const definition = 'Rigid outer layer of plant, fungal and bacterial cells that provides support and protection';
    expect(result('Rigid outer layer of plant', definition).correct).toBe(false);
    expect(result(definition, definition).result).toBe('correct');
  });

  it('forgives a small typo in a longer answer', () => {
    expect(result('mitocondrion', 'mitochondrion')).toEqual({ result: 'almost', correct: true });
    expect(result('ribosmoe', 'ribosome')).toEqual({ result: 'almost', correct: true }); // two letters swapped
    expect(result('chloroplast', 'chloroplasts')).toEqual({ result: 'almost', correct: true });
  });

  it('requires short answers to be exact', () => {
    expect(result('ir', 'ver').correct).toBe(false);
    expect(result('dar', 'dir').correct).toBe(false);
    expect(result('ser', 'ver').correct).toBe(false);
  });

  it('never treats a different number as a typo', () => {
    expect(result('1946', '1945').correct).toBe(false);
    expect(result('World War 1', 'World War 2').correct).toBe(false);
    expect(result('carbon-14', 'carbon-12').correct).toBe(false);
  });

  it('flags missing accents as almost right', () => {
    expect(result('esta', 'está')).toEqual({ result: 'almost', correct: true });
    expect(result('adios', 'adiós').result).toBe('almost');
    expect(result('está', 'está').result).toBe('correct');
  });

  it('can be strict: typos and missing accents are then wrong, but are still reported as close', () => {
    expect(result('esta', 'está', false)).toEqual({ result: 'almost', correct: false });
    expect(result('mitocondrion', 'mitochondrion', false)).toEqual({ result: 'almost', correct: false });
    expect(result('está', 'está', false).correct).toBe(true);
  });

  it('marks wrong and empty answers wrong', () => {
    expect(result('nucleus', 'ribosome')).toEqual({ result: 'incorrect', correct: false });
    expect(result('', 'ribosome').correct).toBe(false);
    expect(result('   ', 'ribosome').correct).toBe(false);
    expect(result('?', 'ribosome').correct).toBe(false);
  });

  it('works for any script', () => {
    expect(result('こんにちは', 'こんにちは').result).toBe('correct');
    expect(result('مرحبا', 'مرحبا').result).toBe('correct');
    expect(result('Привет', 'привет').result).toBe('correct');
    expect(result('안녕하세요', '안녕히 가세요').correct).toBe(false);
    // Full-width forms typed with an input method count as the same characters.
    expect(result('ＡＢＣ', 'abc').result).toBe('correct');
  });

  it('treats typographic and plain quotes and dashes alike', () => {
    expect(result("don't", 'don’t').result).toBe('correct');
    expect(result('well-known', 'well–known').result).toBe('correct');
  });
});

describe('helpers', () => {
  it('lists every acceptable form of an answer', () => {
    expect(acceptedAnswers('to do, to make')).toEqual(expect.arrayContaining(['to do to make', 'to do', 'to make']));
    expect(acceptedAnswers('IaaS (Infrastructure as a Service)')).toEqual(expect.arrayContaining(['iaas', 'iaas infrastructure as a service']));
  });

  it('normalises text without dropping letters', () => {
    expect(normalizeAnswer('  Hello,   World! ')).toBe('hello world');
    expect(normalizeAnswer('Ünïcödé')).toBe('ünïcödé');
  });

  it('computes edit distance, counting a swap as one edit', () => {
    expect(editDistance('kitten', 'sitting', 5)).toBe(3);
    expect(editDistance('abcd', 'abdc', 2)).toBe(1);
    expect(editDistance('same', 'same', 2)).toBe(0);
    expect(editDistance('a', 'abcdefgh', 2)).toBe(3); // gives up once past the limit
  });
});
