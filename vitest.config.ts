import { defineConfig } from 'vitest/config'

// Un seul glob par extension couvre a la fois les tests co-localises avec les
// sources (packages/core/src/**) et ceux places dans des dossiers test/ dedies
// (packages/codegen/test/**), car ** traverse tous les sous-dossiers.
// `test/**/*.test.ts` (Tache 18) couvre le test d'architecture, a la racine
// du depot -- sans ce glob il ne tournerait jamais et ne garantirait rien.
export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'test/**/*.test.ts',
    ],
    // Les paquets du coeur (packages/**) restent testes sous Node : c'est ce
    // qui prouve qu'ils n'ont pas besoin d'un DOM (Tache 15, decision du
    // brief). Seuls les tests de apps/** (le renderer Electron, qui a
    // reellement besoin du DOM pour son canevas React) tournent sous jsdom.
    // Un environnement jsdom global aurait masque cette garantie.
    environmentMatchGlobs: [['apps/**', 'jsdom']],
    setupFiles: ['apps/desktop/test/setup.ts'],
  },
})
