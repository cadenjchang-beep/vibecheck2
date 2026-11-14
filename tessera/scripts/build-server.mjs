// Bundles the API server into dist/server/main.js. Dependencies stay external
// and are loaded from node_modules at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server/main.ts', 'src/server/db/migrate.ts', 'src/server/db/seed.ts'],
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
