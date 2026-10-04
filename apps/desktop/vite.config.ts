import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildContentSecurityPolicy } from './src/shared/csp'

// Mode dev uniquement : la CSP stricte d'index.html bloquerait le preambule
// inline de React Refresh et la websocket HMR de Vite.
const cspDev = {
  name: 'maquio-csp-dev',
  apply: 'serve' as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      buildContentSecurityPolicy({ dev: false }),
      buildContentSecurityPolicy({ dev: true }),
    ),
}

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
  plugins: [react(), cspDev],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
})
