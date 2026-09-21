import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Construit UNIQUEMENT le preload, en CommonJS (correction du defaut n1 du
// rapport packaged-app : "Unable to load preload script" /
// "Cannot use import statement outside a module"). Un script de preload
// Electron en bac a sable (sandbox: true, voir src/main/window.ts) est
// charge par un mecanisme qui execute le fichier comme un script
// CommonJS classique -- il ne comprend pas `import`/`export`. Voir
// vite.electron.main.config.ts pour le pourquoi du format 'es' du main
// (charge differemment, comme point d'entree ESM, par Electron).
//
// Le fichier de sortie porte l'extension .cjs (et non .js) parce que
// apps/desktop/package.json declare "type": "module" : sans cette
// extension explicite, Node/Electron interpreterait un .js du CommonJS
// genere comme un module ES malgre le format effectif du contenu -- c'est
// exactement ce qui causait le defaut. src/main/window.ts pointe
// `webPreferences.preload` vers ce meme chemin `preload/preload.cjs`.
const modulesExternes = [
  'electron',
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

export default defineConfig({
  build: {
    // outDir scope a dist/preload (et non dist) expres, meme raison que
    // dist/main dans vite.electron.main.config.ts : emptyOutDir: true ne
    // nettoie ainsi QUE ce sous-dossier. Sans ce scope, un preload.js en
    // module ES issu d'une construction precedente (avant la scission de
    // cette configuration en deux fichiers) restait a cote du nouveau
    // preload.cjs -- un fichier fantome inoffensif tant que
    // webPreferences.preload et `files` d'electron-builder pointent sur le
    // bon chemin, mais qui fait diverger une construction propre d'une
    // construction incrementale, et qu'un futur changement pourrait
    // recharger par erreur.
    outDir: 'dist/preload',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    lib: {
      entry: {
        preload: 'src/preload/preload.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: modulesExternes,
      output: {
        entryFileNames: '[name].cjs',
      },
    },
  },
})
