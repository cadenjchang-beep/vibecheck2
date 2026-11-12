// Rough per-package breakdown of the built client chunks, from their source maps.
// Sizes are pre-minification source bytes: good for spotting what dominates.
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'dist/client/assets';
const filter = process.argv[2];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.js.map') && (!filter || f.includes(filter)))) {
  const map = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
  const totals = new Map();
  map.sources.forEach((source, i) => {
    const size = map.sourcesContent?.[i]?.length ?? 0;
    const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source);
    const key = m ? m[1] : 'app';
    totals.set(key, (totals.get(key) ?? 0) + size);
  });
  const rows = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  if (total < 60_000 && !filter) continue;
  console.log(`\n${file.replace('.map', '')} (${(total / 1024).toFixed(0)} kB source)`);
  for (const [name, size] of rows) console.log(`  ${(size / 1024).toFixed(0).padStart(6)} kB  ${name}`);
}
