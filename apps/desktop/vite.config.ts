import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Construit uniquement le renderer (decision 7 du brief) : le main et le
// preload sont compiles a part par deux autres configurations Vite (voir
// vite.electron.main.config.ts, vite.electron.preload.config.ts, et les
// scripts build:electron / build de package.json) -- deux fichiers,
// scindes depuis une seule configuration d'origine, car le main (ESM) et
// le preload (CommonJS, exige par le chargeur de preload en bac a sable
// d'Electron) n'ont pas le meme format de sortie. base: './' pour que les
// chemins d'actifs generes restent
// relatifs, necessaire quand BrowserWindow.loadFile() charge index.html via
// file://.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
})
