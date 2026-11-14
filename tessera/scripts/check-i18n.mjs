// Checks the translation catalogues against the code:
// - every key used in the code exists in English,
// - every English key is used somewhere (literally, or under a dynamic prefix
//   such as t(`stages.${stage}`)),
// - other languages only contain keys that English has.
// Usage: node scripts/check-i18n.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LOCALES = 'src/client/locales';
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

function catalogue(locale) {
  const dir = path.join(LOCALES, locale);
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => flatten(JSON.parse(readFileSync(path.join(dir, f), 'utf8')), `${f.replace(/\.json$/, '')}.`)),
  );
}

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'locales' ? [] : sources(full);
    return /\.(tsx?|mjs)$/.test(name) && !name.endsWith('.test.ts') ? [readFileSync(full, 'utf8')] : [];
  });
}

const english = catalogue('en');
const namespaces = new Set([...english].map((k) => k.split('.')[0]));
const code = sources('src/client').join('\n');

const literal = new Set();
for (const match of code.matchAll(/['"`]([a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]+)['"`]/g)) {
  if (namespaces.has(match[1].split('.')[0])) literal.add(match[1]);
}
const prefixes = [...code.matchAll(/`([a-z][A-Za-z0-9]*\.[A-Za-z0-9_.]*)\$\{/g)].map((m) => m[1]).filter((p) => namespaces.has(p.split('.')[0]));

const problems = [];
for (const key of literal) if (!english.has(key)) problems.push(`used but missing from English: ${key}`);
for (const key of english) {
  if (!literal.has(key) && !prefixes.some((p) => key.startsWith(p))) problems.push(`unused: ${key}`);
}
for (const locale of readdirSync(LOCALES).filter((l) => l !== 'en' && statSync(path.join(LOCALES, l)).isDirectory())) {
  for (const key of catalogue(locale)) if (!english.has(key)) problems.push(`${locale} has a key English lacks: ${key}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`i18n: ${english.size} English keys, all used and consistent.`);
