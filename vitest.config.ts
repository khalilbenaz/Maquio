import { defineConfig } from 'vitest/config'

// Deux projets : les paquets du coeur (packages/**) et les tests
// transverses (test/**) restent testes sous Node, ce qui prouve qu'ils n'ont
// pas besoin d'un DOM (Tache 15, decision du brief) ; seuls les tests de
// apps/** (le renderer Electron, qui a reellement besoin du DOM pour son
// canevas React) tournent sous jsdom. Un environnement jsdom global aurait
// masque cette garantie.
//
// Remplace `environmentMatchGlobs`, supprime de Vitest 3+ (mise a jour de
// securite vers Vitest 5 : la 2.x portait une CVE critique).
const setupFiles = ['apps/desktop/test/setup.ts']

export default defineConfig({
  test: {
    // Couverture (`npm run test:coverage`) : le seuil est un PLANCHER de non-
    // regression, releve par paliers quand la couverture progresse.
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/desktop/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', 'apps/desktop/src/main/main.ts', 'apps/desktop/src/preload/preload.ts', 'apps/desktop/src/main/window.ts', 'apps/desktop/src/renderer/main.tsx'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      thresholds: { lines: 88, statements: 86, functions: 84, branches: 76 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'noyau',
          environment: 'node',
          include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'test/**/*.test.ts'],
          setupFiles,
        },
      },
      {
        extends: true,
        test: {
          name: 'desktop',
          environment: 'jsdom',
          include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx'],
          setupFiles,
        },
      },
    ],
  },
})
