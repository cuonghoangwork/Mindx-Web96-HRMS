import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Matches hrms-backend/vitest.config.js — this sandbox's worker-pool
    // threading is unreliable (same root cause as the backend's documented
    // isolate/maxWorkers findings), so pin to a single fork. Vitest 4 removed
    // poolOptions.forks.singleFork in favor of maxWorkers (isolate stays on —
    // it's a separate setting that would break cross-test module isolation).
    pool: 'forks',
    maxWorkers: 1,
  },
})
