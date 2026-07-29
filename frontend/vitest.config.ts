import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Points env loading at a directory with no .env.local, so a developer's local
  // dev override (e.g. VITE_AUTH_PROVIDER=devstub) never leaks into test defaults.
  envDir: path.resolve(__dirname, './src/test'),
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
