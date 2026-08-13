import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url))

// Two apps share this repo: SwingLog (the coaching app) is the root entry, and
// the original Golf Journal keeps its own page at /journal.html.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: entry('./index.html'),
        journal: entry('./journal.html'),
      },
    },
  },
})
