/**
 * Rich text for card terms and definitions.
 *
 * The stored format is a tiny, attribute-free subset of HTML: inline marks
 * (<b> <i> <u> <s> <sub> <sup> <mark> <code>) and <br>. Everything that reads
 * or writes card text goes through this module:
 *
 *   - `sanitizeRich` turns any input into the canonical form. It runs on the
 *     server for every write, so nothing else can reach the database.
 *   - `parseRich` produces a tree that the client renders as React elements;
 *     stored text is never injected as raw HTML.
 *
 * Because the output grammar has no attributes, URLs or unknown tags, there is
 * nothing in it that can execute.
 */

const RICH_TAGS = ['b', 'i', 'u', 's', 'sub', 'sup', 'mark', 'code'] as const;
export type RichTag = (typeof RICH_TAGS)[number];

export type RichNode =
  | { type: 'text'; text: string }
  | { type: 'br' }
  | { type: 'el'; tag: RichTag; children: RichNode[] };

type Mapped = RichTag | 'br' | 'block' | 'drop';

const TAG_MAP: Record<string, Mapped> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  u: 'u',
  ins: 'u',
  s: 's',
  strike: 's',
  del: 's',
  sub: 'sub',
  sup: 'sup',
  mark: 'mark',
  code: 'code',
  br: 'br',
  // Block-level elements become line breaks.
  div: 'block',
  p: 'block',
  li: 'block',
  tr: 'block',
  h1: 'block',
  h2: 'block',
  h3: 'block',
  h4: 'block',
  blockquote: 'block',
  // Elements whose content is never text for a reader.
  script: 'drop',
  style: 'drop',
  head: 'drop',
  title: 'drop',
  template: 'drop',
  noscript: 'drop',
  iframe: 'drop',
  object: 'drop',
  svg: 'drop',
  math: 'drop',
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Removes characters that have no business in card text and normalises the rest. */
function cleanText(text: string): string {
  return (
    text
      // C0/C1 controls except tab and newline, plus the BOM.
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f﻿]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .normalize('NFC')
  );
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

/** Parses any HTML-ish input into the restricted node tree. Never throws. */
export function parseRich(input: string): RichNode[] {
  const root: RichNode[] = [];
  const stack: Array<{ tag: RichTag; children: RichNode[] }> = [];
  const current = () => (stack.length ? stack[stack.length - 1]!.children : root);
  let dropUntil: string | null = null;

  const addBreak = () => current().push({ type: 'br' });
  const addText = (raw: string) => {
    if (!raw) return;
    const lines = cleanText(decodeEntities(raw)).split('\n');
    lines.forEach((line, i) => {
      if (i > 0) addBreak();
      if (!line) return;
      const list = current();
      const last = list[list.length - 1];
      if (last?.type === 'text') last.text += line;
      else list.push({ type: 'text', text: line });
    });
  };
  /** A block boundary: one line break, unless we are at the very start or just broke. */
  const addBlockBreak = () => {
    stack.length = 0;
    const last = root[root.length - 1];
    if (root.length > 0 && last?.type !== 'br') root.push({ type: 'br' });
  };

  let index = 0;
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(input); match; match = TOKEN.exec(input)) {
    const before = input.slice(index, match.index);
    index = match.index + match[0].length;
    const closing = match[1] === '/';
    const name = match[2]?.toLowerCase();

    if (dropUntil) {
      if (closing && name === dropUntil) dropUntil = null;
      continue;
    }
    addText(before);
    if (!name) continue; // a comment

    const mapped = TAG_MAP[name];
    if (!mapped) continue; // unknown tag: keep its text, lose the tag
    if (mapped === 'drop') {
      if (!closing && !match[0].endsWith('/>')) dropUntil = name;
    } else if (mapped === 'br') {
      if (!closing) addBreak();
    } else if (mapped === 'block') {
      addBlockBreak();
    } else if (closing) {
      const at = stack.map((s) => s.tag).lastIndexOf(mapped);
      if (at !== -1) stack.length = at;
    } else if (!stack.some((s) => s.tag === mapped)) {
      const el = { type: 'el' as const, tag: mapped, children: [] as RichNode[] };
      current().push(el);
      stack.push(el);
    }
  }
  if (!dropUntil) addText(input.slice(index));

  return tidy(root);
}

function isEmptyNode(node: RichNode): boolean {
  if (node.type === 'text') return node.text === '';
  if (node.type === 'el') return node.children.length === 0;
  return false;
}

/** Drops empty elements, trims surrounding breaks and whitespace, caps blank lines. */
function tidy(nodes: RichNode[], top = true): RichNode[] {
  let out: RichNode[] = [];
  for (const node of nodes) {
    const next = node.type === 'el' ? { ...node, children: tidy(node.children, false) } : node;
    if (isEmptyNode(next)) continue;
    if (next.type === 'br') {
      const a = out[out.length - 1];
      const b = out[out.length - 2];
      if (a?.type === 'br' && b?.type === 'br') continue; // at most one blank line
    }
    out.push(next);
  }
  if (!top) return out;
  while (out[0]?.type === 'br') out.shift();
  while (out[out.length - 1]?.type === 'br') out.pop();
  const first = out[0];
  if (first?.type === 'text') first.text = first.text.replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text = last.text.replace(/\s+$/, '');
  out = out.filter((n) => !isEmptyNode(n));
  return out;
}

function serializeRich(nodes: RichNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += escapeText(node.text);
    else if (node.type === 'br') out += '<br>';
    else out += `<${node.tag}>${serializeRich(node.children)}</${node.tag}>`;
  }
  return out;
}

/** Canonical, safe form of any input. Idempotent. */
export function sanitizeRich(input: string): string {
  return serializeRich(parseRich(input));
}

function nodesToPlain(nodes: RichNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.text;
    else if (node.type === 'br') out += '\n';
    else out += nodesToPlain(node.children);
  }
  return out;
}

/** Plain text for search, grading, speech and exports. */
export function richToPlain(input: string): string {
  return nodesToPlain(parseRich(input)).trim();
}

/** Wraps plain text (for example an imported cell) as rich text. */
export function plainToRich(text: string): string {
  return sanitizeRich(escapeText(text));
}

export function isRichEmpty(input: string): boolean {
  return richToPlain(input) === '';
}
