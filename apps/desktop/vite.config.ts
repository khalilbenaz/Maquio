import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Construit uniquement le renderer (decision 7 du brief) : le main et le
// preload sont compiles a part par tsc (voir tsconfig.electron.json et les
// scripts build:main / build:preload de package.json). base: './' pour que
// les chemins d'actifs generes restent relatifs, necessaire quand
// BrowserWindow.loadFile() charge index.html via file://.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
})
