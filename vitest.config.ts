import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Tests run in plain node by default; renderer tests that need a DOM opt in
// with a `// @vitest-environment jsdom` header.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
})
