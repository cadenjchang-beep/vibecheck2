// Verifies the colour tokens in src/client/styles.css against WCAG 2.2 AA:
// 4.5:1 for text, 3:1 for control outlines and meaningful graphics.
// Run with `npm run check:contrast`; exits non-zero on any failure.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  const vars = {};
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return vars;
}

function toLinearRgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const luminance = (c) => {
  const [r, g, b] = toLinearRgb(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function toHex(c) {
  const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return '#' + toLinearRgb(c).map((v) => Math.round(enc(v) * 255).toString(16).padStart(2, '0')).join('');
}

const TEXT = 4.5;
const GRAPHIC = 3;

/** [foreground, background, minimum, what it is used for] */
const pairs = [
  ['foreground', 'background', TEXT, 'body text'],
  ['foreground', 'card', TEXT, 'text on cards'],
  ['foreground', 'muted', TEXT, 'text on muted surfaces'],
  ['foreground', 'secondary', TEXT, 'secondary button label'],
  ['foreground', 'secondary-hover', TEXT, 'secondary button label (hover)'],
  ['popover-foreground', 'popover', TEXT, 'menus and dialogs'],
  ['muted-foreground', 'background', TEXT, 'secondary text'],
  ['muted-foreground', 'card', TEXT, 'secondary text on cards'],
  ['muted-foreground', 'muted', TEXT, 'secondary text on muted surfaces'],
  ['muted-foreground', 'secondary', TEXT, 'secondary text on secondary surfaces'],
  ['primary-foreground', 'primary', TEXT, 'primary button label'],
  ['primary-foreground', 'primary-hover', TEXT, 'primary button label (hover)'],
  ['primary', 'background', TEXT, 'links'],
  ['primary', 'card', TEXT, 'links on cards'],
  ['primary', 'muted', TEXT, 'links on muted surfaces'],
  ['primary-soft-foreground', 'primary-soft', TEXT, 'tinted badge'],
  ['destructive-foreground', 'destructive', TEXT, 'destructive button label'],
  ['destructive', 'background', TEXT, 'error text'],
  ['destructive', 'card', TEXT, 'error text on cards'],
  ['destructive-soft-foreground', 'destructive-soft', TEXT, 'error banner'],
  ['success-foreground', 'success', TEXT, 'success button label'],
  ['success', 'card', TEXT, 'success text on cards'],
  ['success', 'background', TEXT, 'success text'],
  ['success-soft-foreground', 'success-soft', TEXT, 'success banner'],
  ['warning-foreground', 'warning', TEXT, 'warning label'],
  ['warning-soft-foreground', 'warning-soft', TEXT, 'warning banner'],
  ['info-foreground', 'info', TEXT, 'info label'],
  ['info', 'card', TEXT, 'info text on cards'],
  ['info-soft-foreground', 'info-soft', TEXT, 'info banner'],
  ['input', 'background', GRAPHIC, 'control outline on page'],
  ['input', 'card', GRAPHIC, 'control outline on cards'],
  ['ring', 'background', GRAPHIC, 'focus ring on page'],
  ['ring', 'card', GRAPHIC, 'focus ring on cards'],
  ['gold', 'card', GRAPHIC, 'star and streak icons'],
  ['gold', 'background', GRAPHIC, 'star and streak icons on page'],
  ['stage-new', 'card', GRAPHIC, 'stage tile: new'],
  ['stage-learning', 'card', GRAPHIC, 'stage tile: learning'],
  ['stage-familiar', 'card', GRAPHIC, 'stage tile: familiar'],
  ['stage-mastered', 'card', GRAPHIC, 'stage tile: mastered'],
  ['stage-learning', 'background', GRAPHIC, 'stage tile on page: learning'],
  ['stage-familiar', 'background', GRAPHIC, 'stage tile on page: familiar'],
  ['stage-mastered', 'background', GRAPHIC, 'stage tile on page: mastered'],
];

let failures = 0;
for (const [name, selector] of [
  ['light', ':root'],
  ['dark', '.dark'],
]) {
  const vars = block(selector);
  console.log(`\n${name} theme`);
  for (const [fg, bg, min, use] of pairs) {
    if (!vars[fg] || !vars[bg]) {
      console.log(`  ✗ missing token ${!vars[fg] ? fg : bg}`);
      failures++;
      continue;
    }
    const r = ratio(vars[fg], vars[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1 (min ${min}) ${fg} on ${bg} — ${use}`);
  }
  if (process.argv.includes('--hex')) {
    for (const k of ['background', 'card', 'primary', 'foreground', 'gold']) console.log(`    ${k}: ${toHex(vars[k])}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} pairing(s) below WCAG AA.`);
  process.exit(1);
}
console.log('\nAll pairings meet WCAG AA.');
