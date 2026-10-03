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
