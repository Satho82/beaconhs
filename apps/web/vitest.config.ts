import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Next preserves JSX for its own compiler; component tests need executable JSX.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
})
