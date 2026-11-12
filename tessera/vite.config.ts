import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API = process.env.API_URL ?? 'http://localhost:8787';

export default defineConfig({
  // The client takes no build-time configuration: everything it needs comes
  // from /api/me. Keeping Vite away from .env also stops a server-side
  // NODE_ENV=development from producing a development build of React.
  envDir: false,
  plugins: [react(), tailwindcss()],
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
