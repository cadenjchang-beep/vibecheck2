import { describe, expect, it } from 'vitest';
import { isRichEmpty, parseRich, plainToRich, richToPlain, sanitizeRich } from './richtext';

describe('sanitizeRich', () => {
  it('keeps the allowed inline marks and line breaks', () => {
    expect(sanitizeRich('H<sub>2</sub>O is <b>water</b><br>x<sup>2</sup>')).toBe('H<sub>2</sub>O is <b>water</b><br>x<sup>2</sup>');
  });

  it('maps equivalent tags onto the canonical ones', () => {
    expect(sanitizeRich('<strong>a</strong> <em>b</em> <del>c</del>')).toBe('<b>a</b> <i>b</i> <s>c</s>');
  });

  it('strips every attribute', () => {
    expect(sanitizeRich('<b onclick="alert(1)" style="x" class="y">hi</b>')).toBe('<b>hi</b>');
  });

  it.each([
    ['<script>alert(1)</script>safe', 'safe'],
    ['<img src=x onerror=alert(1)>text', 'text'],
    ['<a href="javascript:alert(1)">click</a>', 'click'],
    ['<svg onload=alert(1)><circle/></svg>ok', 'ok'],
    ['<iframe src="//evil"></iframe>ok', 'ok'],
    ['<style>*{display:none}</style>ok', 'ok'],
    ['<b><script>alert(1)</script>x</b>', '<b>x</b>'],
    ['<ScRiPt>alert(1)</sCrIpT>ok', 'ok'],
    ['<math><mtext></mtext></math>ok', 'ok'],
    ['<!-- <script>alert(1)</script> -->ok', 'ok'],
  ])('neutralises %s', (input, expected) => {
    expect(sanitizeRich(input)).toBe(expected);
  });

  it('never emits a tag outside the allow-list, whatever the input', () => {
    const hostile = [
      '<<b>script>alert(1)<</b>/script>',
      '<b <script>>x</b>',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
      '<img src="x" onerror="alert(1)"',
      '"><svg/onload=alert(1)>',
      '<b>unclosed <i>nesting',
      '</b></i></script>',
      '&#60;script&#62;alert(1)&#60;/script&#62;',
      '<object data="x"></object><embed src="x">',
    ];
    for (const input of hostile) {
      const out = sanitizeRich(input);
      const tags = out.match(/<[^>]*>/g) ?? [];
      for (const tag of tags) expect(tag).toMatch(/^<\/?(b|i|u|s|sub|sup|mark|code)>$|^<br>$/);
      expect(out).not.toMatch(/<[^>]*\s[^>]*>/); // no attributes at all
    }
  });

  it('keeps escaped markup as visible text rather than markup', () => {
    const out = sanitizeRich('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(richToPlain(out)).toBe('<script>alert(1)</script>');
  });

  it('closes unbalanced tags and ignores stray closers', () => {
    expect(sanitizeRich('<b>bold <i>both')).toBe('<b>bold <i>both</i></b>');
    expect(sanitizeRich('plain</b></i>')).toBe('plain');
  });

  it('turns block elements into line breaks, as a contentEditable produces them', () => {
    expect(sanitizeRich('<div>one</div><div>two</div>')).toBe('one<br>two');
    expect(sanitizeRich('<p>one</p><p><br></p><p>two</p>')).toBe('one<br><br>two');
  });

  it('trims surrounding whitespace and breaks and drops empty elements', () => {
    expect(sanitizeRich('<br>  hello  <br><br>')).toBe('hello');
    expect(sanitizeRich('<b></b>x<i><u></u></i>')).toBe('x');
  });

  it('is idempotent', () => {
    const samples = ['a &amp; b &lt; c', '<b>x</b><br><br><br><br>y', 'tab\there', '5 < 6 > 4', '&amp;lt;b&amp;gt;'];
    for (const sample of samples) {
      const once = sanitizeRich(sample);
      expect(sanitizeRich(once)).toBe(once);
    }
  });

  it('preserves text in any script, including right-to-left and combining characters', () => {
    for (const text of ['مرحبا بالعالم', '日本語のテキスト', 'नमस्ते', 'e\u0301cole → école', '👩‍🔬 science', 'שלום']) {
      expect(richToPlain(plainToRich(text))).toBe(text.normalize('NFC'));
    }
  });

  it('removes control characters but keeps tabs and newlines', () => {
    expect(richToPlain(sanitizeRich('a\u0000b\u0007c\td'))).toBe('abc\td');
    expect(sanitizeRich('line one\nline two')).toBe('line one<br>line two');
  });
});

describe('plain text conversion', () => {
  it('escapes plain text so it can never become markup', () => {
    expect(plainToRich('<b>not bold</b> & co')).toBe('&lt;b&gt;not bold&lt;/b&gt; &amp; co');
    expect(parseRich(plainToRich('<b>x</b>'))).toEqual([{ type: 'text', text: '<b>x</b>' }]);
  });

  it('round-trips multi-line text', () => {
    expect(richToPlain(plainToRich('first\nsecond'))).toBe('first\nsecond');
  });

  it('reads plain text out of marked-up text', () => {
    expect(richToPlain('H<sub>2</sub>O<br>is <b>water</b>')).toBe('H2O\nis water');
  });

  it('detects emptiness regardless of leftover markup', () => {
    expect(isRichEmpty('')).toBe(true);
    expect(isRichEmpty('<br>')).toBe(true);
    expect(isRichEmpty('<b> </b>')).toBe(true);
    expect(isRichEmpty('<b>x</b>')).toBe(false);
  });
});
