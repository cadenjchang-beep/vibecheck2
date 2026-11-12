/** Delimited-text parsing and CSV writing (RFC 4180), with no dependencies. */

/**
 * Parses delimited text. A field is treated as quoted only when it starts with
 * a double quote, in which case it may contain the delimiter, line breaks and
 * doubled quotes. Blank rows are skipped.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;
  const input = text.replace(/^\ufeff/, '');

  const endField = () => {
    row.push(field);
    field = '';
    atFieldStart = true;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (input.startsWith(delimiter, i)) {
      endField();
      i += delimiter.length - 1;
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (input[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Spreadsheet programs run cells that start with = + - or @ as formulas. An
 * exported set can contain other people's text, so such cells get a leading
 * apostrophe, which spreadsheets show as plain text.
 */
export function guardCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Undoes `guardCell` so an exported file imports back unchanged. */
export function unguardCell(value: string): string {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => quote(guardCell(cell))).join(',')).join('\r\n') + '\r\n';
}

/** Picks the delimiter that splits the first lines most consistently. */
export function detectDelimiter(text: string): ',' | '\t' | ';' {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20);
  if (lines.length === 0) return ',';
  let best: ',' | '\t' | ';' = ',';
  let bestScore = 0;
  for (const candidate of ['\t', ',', ';'] as const) {
    const withIt = lines.filter((l) => l.includes(candidate)).length;
    // Tabs almost never occur by accident, so they win ties.
    const score = withIt / lines.length + (candidate === '\t' ? 0.01 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
