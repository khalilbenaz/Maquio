// Rendu d'un ecran en PNG pour la critique visuelle (ScreenRenderer de
// @maquio/ai) : une fenetre CACHEE charge le renderer avec l'ancre #render
// (voir renderer/render/RenderHarness.tsx), y dessine l'ecran a l'echelle
// SCALE, puis le main en capture l'image.
//
// Une seule fenetre, creee a la premiere demande et reutilisee ; les rendus
// passent un par un (file d'attente), la fenetre ne montrant qu'un ecran a
// la fois. `dispose` la ferme (fin de l'application).
import { BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { serializeDocument } from '@maquio/core'
import type { ScreenRenderer } from '@maquio/ai'
import { installNavigationGuards } from '../security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Echelle 2 : une capture nette, ou les petits textes restent lisibles pour
// la critique.
const SCALE = 2

export function createScreenRenderer(): { render: ScreenRenderer; dispose: () => void; owns: (win: BrowserWindow) => boolean } {
  let fenetre: Promise<BrowserWindow> | null = null
  let creee: BrowserWindow | null = null
  let file: Promise<unknown> = Promise.resolve()

  function ouvrir(): Promise<BrowserWindow> {
    if (fenetre === null) {
      fenetre = (async () => {
        const win = new BrowserWindow({
          show: false,
          width: 400,
          height: 900,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true, backgroundThrottling: false },
        })
        const urlDev = process.env['VITE_DEV_SERVER_URL']
        creee = win
        installNavigationGuards(win.webContents, urlDev ?? null)
        win.on('closed', () => {
          fenetre = null
          creee = null
        })
        if (urlDev !== undefined) await win.loadURL(`${urlDev}#render`)
        else await win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'render' })
        win.webContents.setZoomFactor(SCALE)
        return win
      })()
    }
    return fenetre
  }

  async function rendreUn(document: Parameters<ScreenRenderer>[0], pageId: string, screenId: string): Promise<string> {
    const win = await ouvrir()
    // Le document passe comme litteral de chaine JSON, relu par parseDocument
    // dans le banc : jamais interprete comme du code.
    const appel = `window.__maquioRender(${JSON.stringify(serializeDocument(document))}, ${JSON.stringify(pageId)}, ${JSON.stringify(screenId)})`
    const taille = (await win.webContents.executeJavaScript(appel)) as { w: number; h: number }
    if (taille.w <= 0 || taille.h <= 0) throw new Error(`Écran introuvable pour le rendu : ${screenId}`)
    const largeur = Math.ceil(taille.w * SCALE)
    const hauteur = Math.ceil(taille.h * SCALE)
    win.setContentSize(largeur, hauteur)
    // Laisse le compositeur repeindre a la nouvelle taille.
    await new Promise((r) => setTimeout(r, 150))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: largeur, height: hauteur })
    return image.toPNG().toString('base64')
  }

  const render: ScreenRenderer = (document, pageId, screenId) => {
    const resultat = file.then(() => rendreUn(document, pageId, screenId))
    file = resultat.catch(() => undefined)
    return resultat
  }

  return {
    render,
    // La fenetre de rendu ne compte pas comme une fenetre de l'application
    // (quitter, reactiver) : voir main.ts.
    owns: (win) => win === creee,
    dispose: () => {
      void fenetre?.then((w) => {
        if (!w.isDestroyed()) w.destroy()
      })
      fenetre = null
    },
  }
}
