// Creation de la fenetre principale (Tache 14).
//
// Les trois options de webPreferences ci-dessous sont non negociables
// (decision 4 du brief) et verifiees telles quelles par un test qui lit ce
// fichier comme du texte : contextIsolation isole le contexte JS du
// renderer de celui du preload/main, nodeIntegration:false empeche le
// renderer d'acceder directement aux modules Node, et sandbox:true active
// le bac a sable du processus renderer d'Electron.
import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { installNavigationGuards } from './security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Icone de l'application (copiee depuis public/ dans dist/renderer par Vite).
export function cheminIcone(): string {
  return path.join(__dirname, '../renderer/icon.png')
}

export function creerFenetrePrincipale(backgroundColor: string): BrowserWindow {
  // Parcours de bout en bout (MAQUIO_E2E_HIDDEN=1) : la fenetre ne s'affiche
  // pas et ne prend jamais le focus pendant que l'utilisateur travaille ; le
  // rendu continue (pas de ralentissement en arriere-plan).
  const cachee = process.env['MAQUIO_E2E_HIDDEN'] === '1'
  const fenetre = new BrowserWindow({
    show: !cachee,
    width: 1280,
    height: 800,
    // Aligne sur le theme (--maquio-chrome-bg) : aucun flash avant le premier rendu.
    backgroundColor,
    // Windows / Linux : icone de fenetre (macOS : icone du Dock, voir main.ts).
    icon: cheminIcone(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !cachee,
    },
  })

  // En developpement, Vite sert le renderer sur un serveur local dont
  // l'URL est passee par la variable d'environnement VITE_DEV_SERVER_URL
  // (voir le script "dev"). En production, le renderer construit par Vite
  // est charge directement depuis le disque.
  const urlDev = process.env['VITE_DEV_SERVER_URL']
  installNavigationGuards(fenetre.webContents, urlDev ?? null)
  if (urlDev !== undefined) {
    void fenetre.loadURL(urlDev)
  } else {
    void fenetre.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return fenetre
}
