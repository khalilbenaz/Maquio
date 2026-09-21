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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function creerFenetrePrincipale(): BrowserWindow {
  const fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // En developpement, Vite sert le renderer sur un serveur local dont
  // l'URL est passee par la variable d'environnement VITE_DEV_SERVER_URL
  // (voir le script "dev"). En production, le renderer construit par Vite
  // est charge directement depuis le disque.
  const urlDev = process.env['VITE_DEV_SERVER_URL']
  if (urlDev !== undefined) {
    void fenetre.loadURL(urlDev)
  } else {
    void fenetre.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return fenetre
}
