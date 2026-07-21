import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    // Scope to src/ — agent worktrees under .claude/ carry duplicate test files
    // that would otherwise be globbed in and reported as stale failures.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
