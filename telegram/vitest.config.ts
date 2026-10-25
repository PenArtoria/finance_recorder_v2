import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(import.meta.dirname, '../windows/src/shared') } },
  server: { fs: { allow: [resolve(import.meta.dirname, '..')] } },
  test: { include: ['test/**/*.test.ts'] }
})
