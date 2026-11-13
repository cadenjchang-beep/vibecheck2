/**
 * Grading of typed answers.
 *
 * The aim is to mark someone right when they clearly knew the answer, without
 * accepting an answer that is merely nearby. Comparison ignores case, spacing,
 * most punctuation and the difference between look-alike characters. An
 * expected answer may list alternatives ("to do, to make" or "colour/color")
 * and optional detail in brackets ("to be (permanent)"); any one alternative
 * is enough.
 */

export type WrittenResult = 'correct' | 'almost' | 'incorrect';

export interface GradeOptions {
  /** Accept answers that differ only by a small typo or missing accents. Default true. */
  lenient?: boolean;
}

export interface Grade {
  result: WrittenResult;
  /** True when the answer should be counted as right. */
  correct: boolean;
}

/** Folds text to a comparable form without discarding letters from any script. */
export function normalizeAnswer(text: string): string {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      // Typographic quotes and dashes that keyboards produce differently.
      .replace(/[‘’ʼ`´]/g, "'")
      .replace(/[“”«»]/g, '"')
      .replace(/[‐-―−]/g, '-')
      // Punctuation that carries no meaning in a short answer.
      .replace(/[.,!?;:"¡¿…·]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Removes accents and other combining marks: "está" → "esta". */
export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Every form of `expected` that counts as a complete answer.
 * "to be (identity); to exist" → "to be (identity); to exist", "to be", "to exist", …
 */
export function acceptedAnswers(expected: string): string[] {
  const accepted = new Set<string>();
  const add = (value: string) => {
    const normal = normalizeAnswer(value);
    if (normal) accepted.add(normal);
  };

  add(expected);
  const withoutBrackets = expected.replace(/\([^()]*\)|\[[^[\]]*\]/g, ' ');
  add(withoutBrackets);
  // Brackets kept but as plain words: "to know (facts)" typed as "to know facts".
  add(expected.replace(/[()[\]]/g, ' '));

  for (const major of withoutBrackets.split(/[;/]|\n/)) {
    add(major);
    // A comma separates alternatives only in a list of short items; in a
    // sentence it is just punctuation.
    const minor = major.split(',');
    if (minor.length > 1 && minor.every((part) => wordCount(part) > 0 && wordCount(part) <= 3)) {
      for (const part of minor) add(part);
    }
  }
  return [...accepted];
}

/** Edit distance with early exit once it exceeds `max`. Counts a swap of neighbours as one edit. */
export function editDistance(a: string, b: string, max: number): number {
  const s = [...a];
  const t = [...b];
  if (Math.abs(s.length - t.length) > max) return max + 1;
  let previous2: number[] = [];
  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) value = Math.min(value, previous2[j - 2]! + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous2 = previous;
    previous = current;
  }
  return previous[t.length]!;
}

/** Typos forgiven for an answer of this length. Short answers must be exact. */
function typoAllowance(length: number): number {
  if (length < 5) return 0;
  if (length < 10) return 1;
  return 2;
}

export function gradeWritten(given: string, expected: string, options: GradeOptions = {}): Grade {
  const lenient = options.lenient ?? true;
  const answer = normalizeAnswer(given);
  if (!answer) return { result: 'incorrect', correct: false };
  const accepted = acceptedAnswers(expected);

  if (accepted.includes(answer)) return { result: 'correct', correct: true };

  // Several alternatives given at once, in any order: "to make, to do".
  const parts = given
    .split(/[,;/]/)
    .map(normalizeAnswer)
    .filter(Boolean);
  if (parts.length > 1 && parts.every((part) => accepted.includes(part))) return { result: 'correct', correct: true };

  const bare = stripDiacritics(answer);
  for (const candidate of accepted) {
    const candidateBare = stripDiacritics(candidate);
    const allowance = typoAllowance([...candidate].length);
    // Digits are never "typos": 1945 is not 1946.
    const digitsMatch = bare.replace(/\D/g, '') === candidateBare.replace(/\D/g, '');
    if (bare === candidateBare || (digitsMatch && allowance > 0 && editDistance(bare, candidateBare, allowance) <= allowance)) {
      return { result: 'almost', correct: lenient };
    }
  }
  return { result: 'incorrect', correct: false };
}
