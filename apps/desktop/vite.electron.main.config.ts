import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Construit le processus principal avec Vite (decision 7 du brief : "une
// seconde configuration Vite") plutot qu'avec tsc directement. Ce choix
// evite l'exigence d'extensions .js explicites sur chaque import relatif
// qu'imposerait tsc en resolution NodeNext, et garde un style d'import
// uniforme avec le reste du monorepo (imports relatifs sans extension,
// resolution "Bundler"). electron et les modules integres de Node restent
// externes : ils sont fournis par le runtime Electron, jamais empaquetes.
//
// Le preload est construit a part, par vite.electron.preload.config.ts
// (correction du defaut n1 du rapport packaged-app) : un script de
// preload Electron en bac a sable est charge par un loader qui ne
// comprend pas les modules ES (`import`/`export`) -- seul le format
// CommonJS y fonctionne. Le main, lui, est charge comme point d'entree
// ESM normal par Electron (qui sait le faire), donc reste en 'es' ici. Un
// seul format par configuration Vite pour tout le monorepo : les deux
// fichiers partagent la meme liste de modules externes et les memes
// options de build ci-dessous, mais chacun choisit le format qui
// correspond a la facon dont Electron le charge reellement.
const modulesExternes = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  build: {
    // outDir scope a dist/main (et non dist) expres : emptyOutDir: true ne
    // nettoie ainsi QUE ce sous-dossier, jamais dist/renderer ni
    // dist/preload ecrits par les autres configurations. Sans ce scope, un
    // fichier fantome d'une construction precedente (ex. un preload.js en
    // module ES d'avant la scission en deux configurations) peut survivre
    // a une construction ulterieure et faire diverger construction propre
    // et construction incrementale -- exactement le risque signale sur ce
    // depot le 21/09/2026.
    outDir: 'dist/main',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    lib: {
      entry: {
        main: 'src/main/main.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: modulesExternes,
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
})
