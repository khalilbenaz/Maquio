import { defineConfig } from 'vitest/config'

// Un seul glob par extension couvre a la fois les tests co-localises avec les
// sources (packages/core/src/**) et ceux places dans des dossiers test/ dedies
// (packages/codegen/test/**), car ** traverse tous les sous-dossiers.
export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
    ],
  },
})
