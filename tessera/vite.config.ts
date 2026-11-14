import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Files under public/, as site paths. */
function publicFiles(dir = 'public', base = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? publicFiles(full, `${base}/${name}`) : [`${base}/${name}`];
  });
}

/**
 * Emits sw.js with the list of files to precache and a version that changes
 * whenever any of them does, so browsers pick up each deploy.
 */
function serviceWorker(): Plugin {
  return {
    name: 'tessera-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => /\.(js|css)$/.test(file))
        .map((file) => `/${file}`);
      const statics = publicFiles().filter((file) => !/og-image|apple-touch/.test(file));
      const hash = createHash('sha256');
      for (const file of built.sort()) hash.update(file);
      for (const file of statics.sort()) hash.update(file).update(readFileSync(path.join('public', file)));
      const source = readFileSync('src/client/sw.js', 'utf8')
        .replace("'__BUILD_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace("'__PRECACHE_MANIFEST__'", JSON.stringify([...statics, ...built]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

const API = process.env.API_URL ?? 'http://localhost:8787';

/**
 * Writes Brotli and gzip copies next to each text file of the build. The Node
 * server sends them to browsers that accept them (serveStatic precompressed);
 * CDNs such as Netlify's compress on their own and ignore the copies.
 */
function precompress(): Plugin {
  return {
    name: 'tessera-precompress',
    apply: 'build',
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const full = path.join(dir, name);
          return statSync(full).isDirectory() ? walk(full) : [full];
        });
      for (const file of walk('dist/client')) {
        if (!/\.(js|css|svg|webmanifest|json|txt)$/.test(file)) continue;
        const data = readFileSync(file);
        if (data.length < 1024) continue;
        writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  // The client takes no build-time configuration: everything it needs comes
  // from /api/me. Keeping Vite away from .env also stops a server-side
  // NODE_ENV=development from producing a development build of React.
  envDir: false,
  plugins: [react(), tailwindcss(), serviceWorker(), precompress()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src/client'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      '@server': path.resolve(import.meta.dirname, 'src/server'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        // Pure logic shared by client and server: no database, no network.
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        // The HTTP API against a real PostgreSQL database (see tests/global-setup.ts).
        test: {
          name: 'api',
          include: ['tests/**/*.test.ts'],
          globalSetup: ['./tests/global-setup.ts'],
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://tessera:tessera@127.0.0.1:5432/tessera_vitest',
            APP_URL: 'http://localhost:5173',
            BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1',
            EMAIL_TRANSPORT: 'file',
            OUTBOX_DIR: '.data/test/outbox',
            STORAGE_DRIVER: 'local',
            STORAGE_LOCAL_DIR: '.data/test/uploads',
            AI_PROVIDER: 'mock',
            PAYMENTS_PROVIDER: 'mock',
            RUN_SCHEDULER: '0',
            CRON_SECRET: 'test-cron-secret',
            ANTHROPIC_API_KEY: '',
            STRIPE_SECRET_KEY: '',
          },
        },
      },
    ],
  },
});
