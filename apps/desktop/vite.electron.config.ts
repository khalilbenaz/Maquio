import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Construit le main et le preload avec Vite (decision 7 du brief : "une
// seconde configuration Vite") plutot qu'avec tsc directement. Ce choix
// evite l'exigence d'extensions .js explicites sur chaque import relatif
// qu'imposerait tsc en resolution NodeNext, et garde un style d'import
// uniforme avec le reste du monorepo (imports relatifs sans extension,
// resolution "Bundler"). electron et les modules integres de Node restent
// externes : ils sont fournis par le runtime Electron, jamais empaquetes.
const modulesExternes = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false, // dist/renderer est ecrit par l'autre configuration (vite.config.ts)
    target: 'node22',
    minify: false,
    lib: {
      entry: {
        'main/main': 'src/main/main.ts',
        'preload/preload': 'src/preload/preload.ts',
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
