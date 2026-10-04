import { defineConfig } from 'vite'

// Le thread principal d'un plugin Figma est UN fichier JavaScript sans module :
// on empaquete src/code.ts (et @calque/core, pour valider le document) en IIFE.
export default defineConfig({
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    lib: { entry: 'src/code.ts', formats: ['iife'], name: 'calquePlugin', fileName: () => 'code.js' },
  },
})
