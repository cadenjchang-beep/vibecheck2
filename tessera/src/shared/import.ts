import { LIMITS } from './constants';
import { detectDelimiter, parseDelimited, unguardCell } from './csv';

export interface ImportOptions {
  /** Text between a term and its definition. */
  termSeparator: string;
  /** Text between one card and the next. */
  cardSeparator: string;
}

export interface ImportedCard {
  term: string;
  definition: string;
}

export interface ImportResult {
  cards: ImportedCard[];
  /** Cards that have a term but no definition (no separator was found). */
  incomplete: number;
  /** True when the input held more cards than a set may contain. */
  truncated: boolean;
}

/** Lets people type \t and \n in a "custom separator" box. */
export function unescapeSeparator(value: string): string {
  return value.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

/** Best guess at how pasted text is laid out; spreadsheets paste as tab + newline. */
export function detectSeparators(text: string): ImportOptions {
  // Nothing to go on yet: assume a spreadsheet paste, by far the commonest case.
  if (!text.trim()) return { termSeparator: '\t', cardSeparator: '\n' };
  const hasNewline = /\r?\n/.test(text.trim());
  if (!hasNewline && text.includes(';') && (text.includes('\t') || text.includes(','))) {
    return { termSeparator: text.includes('\t') ? '\t' : ',', cardSeparator: ';' };
  }
  const delimiter = detectDelimiter(text);
  if (delimiter === ';' && hasNewline) return { termSeparator: ';', cardSeparator: '\n' };
  return { termSeparator: delimiter === ';' ? ',' : delimiter, cardSeparator: '\n' };
}

/**
 * Turns pasted or uploaded text into cards.
 *
 * Each card is split at the first term separator only, so a definition may
 * itself contain the separator. With newline-separated cards, cells quoted the
 * way spreadsheets and CSV files quote them (including multi-line cells) are
 * understood.
 */
export function parseBulk(text: string, options: ImportOptions, max: number = LIMITS.cardsPerSet): ImportResult {
  const termSeparator = options.termSeparator || '\t';
  const cardSeparator = options.cardSeparator || '\n';
  const normalised = text.replace(/\r\n?/g, '\n');

  let pairs: Array<[string, string]>;
  if (cardSeparator === '\n' && normalised.includes('"')) {
    pairs = parseDelimited(normalised, termSeparator).map((row) => [row[0] ?? '', row.slice(1).join(termSeparator)]);
  } else {
    pairs = normalised.split(cardSeparator).map((chunk) => {
      const at = chunk.indexOf(termSeparator);
      return at === -1 ? [chunk, ''] : [chunk.slice(0, at), chunk.slice(at + termSeparator.length)];
    });
  }

  const cards: ImportedCard[] = [];
  let incomplete = 0;
  let truncated = false;
  for (const [rawTerm, rawDefinition] of pairs) {
    const term = unguardCell(rawTerm.trim());
    const definition = unguardCell(rawDefinition.trim());
    if (!term && !definition) continue;
    if (cards.length >= max) {
      truncated = true;
      break;
    }
    if (!term || !definition) incomplete++;
    cards.push({ term, definition });
  }
  return { cards, incomplete, truncated };
}
