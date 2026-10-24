import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: [
      ...configDefaults.exclude,
      '**/e2e/**',
      '**/*.spec.ts',
    ],
    // The suite creates a JSDOM environment per file; allow for CI contention.
    testTimeout: 10_000,
  },
})
