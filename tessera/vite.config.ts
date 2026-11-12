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
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
  },
});
