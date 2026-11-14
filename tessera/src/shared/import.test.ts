import { describe, expect, it } from 'vitest';
import { guardCell, parseDelimited, toCsv, unguardCell } from './csv';
import { detectSeparators, parseBulk, unescapeSeparator } from './import';

describe('parseBulk', () => {
  it('reads tab-separated rows pasted from a spreadsheet', () => {
    const text = 'hola\thello\nadiós\tgoodbye\r\ngracias\tthank you\n';
    expect(parseBulk(text, { termSeparator: '\t', cardSeparator: '\n' }).cards).toEqual([
      { term: 'hola', definition: 'hello' },
      { term: 'adiós', definition: 'goodbye' },
      { term: 'gracias', definition: 'thank you' },
    ]);
  });

  it('splits at the first separator only, so definitions may contain it', () => {
    const { cards } = parseBulk('mitosis, division into two, identical cells', { termSeparator: ',', cardSeparator: '\n' });
    expect(cards).toEqual([{ term: 'mitosis', definition: 'division into two, identical cells' }]);
  });

  it('supports custom separators', () => {
    const { cards } = parseBulk('a - 1;b - 2 ; c - 3', { termSeparator: ' - ', cardSeparator: ';' });
    expect(cards).toEqual([
      { term: 'a', definition: '1' },
      { term: 'b', definition: '2' },
      { term: 'c', definition: '3' },
    ]);
  });

  it('understands quoted multi-line cells from spreadsheets', () => {
    const text = 'term\t"line one\nline two"\n"say ""hi"""\tgreeting';
    expect(parseBulk(text, { termSeparator: '\t', cardSeparator: '\n' }).cards).toEqual([
      { term: 'term', definition: 'line one\nline two' },
      { term: 'say "hi"', definition: 'greeting' },
    ]);
  });

  it('skips blank lines and counts cards with a missing side', () => {
    const result = parseBulk('one\t1\n\n   \nlonely\n\tno term', { termSeparator: '\t', cardSeparator: '\n' });
    expect(result.cards).toHaveLength(3);
    expect(result.incomplete).toBe(2);
  });

  it('imports twenty pasted terms', () => {
    const text = Array.from({ length: 20 }, (_, i) => `term ${i + 1}\tdefinition ${i + 1}`).join('\n');
    const result = parseBulk(text, detectSeparators(text));
    expect(result.cards).toHaveLength(20);
    expect(result.incomplete).toBe(0);
    expect(result.cards[19]).toEqual({ term: 'term 20', definition: 'definition 20' });
  });

  it('stops at the per-set limit and says so', () => {
    const text = Array.from({ length: 12 }, (_, i) => `t${i}\td${i}`).join('\n');
    const result = parseBulk(text, { termSeparator: '\t', cardSeparator: '\n' }, 10);
    expect(result.cards).toHaveLength(10);
    expect(result.truncated).toBe(true);
  });

  it('keeps Unicode intact', () => {
    const { cards } = parseBulk('こんにちは\thello\nمرحبا\thello', { termSeparator: '\t', cardSeparator: '\n' });
    expect(cards.map((c) => c.term)).toEqual(['こんにちは', 'مرحبا']);
  });
});

describe('detectSeparators', () => {
  it('assumes a spreadsheet layout when there is no text yet', () => {
    expect(detectSeparators('')).toEqual({ termSeparator: '\t', cardSeparator: '\n' });
    expect(detectSeparators('  \n ')).toEqual({ termSeparator: '\t', cardSeparator: '\n' });
  });
  it('prefers tabs when present', () => {
    expect(detectSeparators('a\tb, c\nd\te')).toEqual({ termSeparator: '\t', cardSeparator: '\n' });
  });
  it('falls back to commas', () => {
    expect(detectSeparators('a,b\nc,d')).toEqual({ termSeparator: ',', cardSeparator: '\n' });
  });
  it('recognises a single line of semicolon-separated cards', () => {
    expect(detectSeparators('a,1;b,2;c,3')).toEqual({ termSeparator: ',', cardSeparator: ';' });
  });
  it('recognises semicolon-delimited files', () => {
    expect(detectSeparators('a;1\nb;2')).toEqual({ termSeparator: ';', cardSeparator: '\n' });
  });
});

describe('csv', () => {
  it('round-trips awkward values', () => {
    const rows = [
      ['plain', 'with, comma'],
      ['with "quotes"', 'multi\nline'],
      ['  padded  ', 'ünïcödé 日本'],
    ];
    expect(parseDelimited(toCsv(rows), ',')).toEqual(rows);
  });

  it('neutralises spreadsheet formulas on export and restores them on import', () => {
    expect(guardCell('=HYPERLINK("http://evil","x")')).toBe(`'=HYPERLINK("http://evil","x")`);
    expect(guardCell('+1')).toBe("'+1");
    expect(guardCell('ordinary')).toBe('ordinary');
    for (const value of ['=1+1', '-b ± √(b²-4ac)', '@home', '+1']) expect(unguardCell(guardCell(value))).toBe(value);
    const csv = toCsv([['=cmd()', '-5']]);
    expect(parseBulk(csv, { termSeparator: ',', cardSeparator: '\n' }).cards).toEqual([{ term: '=cmd()', definition: '-5' }]);
  });

  it('ignores a byte-order mark and blank rows', () => {
    expect(parseDelimited('\ufeffa,b\r\n\r\nc,d\r\n', ',')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('lets people type escapes for custom separators', () => {
    expect(unescapeSeparator('\\t')).toBe('\t');
    expect(unescapeSeparator(' :: ')).toBe(' :: ');
  });
});
