// Processus principal (Tache 14, branchement Tache 17) : cree la fenetre,
// le menu, et enregistre un ipcMain.handle par canal declare dans
// API_CHANNELS (source de verite unique, voir src/shared/api.ts).
//
// Les huit gestionnaires "metier" (openDocument, saveDocument,
// importFigma, exportProject, askClaude, listExporters) sont des
// fonctions pures d'injection definies dans src/main/handlers/*.ts,
// testables sans Electron : ce fichier se contente de les cabler avec les
// vraies dependances (node:fs/promises, dialog, safeStorage, fetch,
// child_process), toutes elles-memes enveloppees dans de petits
// adaptateurs sous src/main/adapters/*.ts.
import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, safeStorage } from 'electron'
import { AiService, ProcessClaudeRunner } from '@calque/ai'
import { FigmaClient } from '@calque/figma'
import { listExporters } from '@calque/codegen'
import { creerFenetrePrincipale } from './window'
import { nodeSpawn } from './adapters/nodeSpawn'
import { nodeFetch } from './adapters/nodeFetch'
import { createSecretStore } from './adapters/secretStore'
import {
  chooseDirectory,
  chooseFigmaJsonFile,
  chooseOpenDocumentPath,
  chooseSaveDocumentPath,
  confirmOverwrite,
} from './adapters/electronDialogs'
import { createDocumentHandler } from './handlers/documentHandlers'
import { createExportHandler } from './handlers/exportHandlers'
import { createFigmaHandler, createGetSettingsHandler, createSetFigmaTokenHandler } from './handlers/figmaHandlers'
import { createClaudeHandler } from './handlers/claudeHandlers'

// Recherche reelle d'un executable dans le PATH courant, sans lancer de
// sous-processus (pas de dependance a la commande 'which' du systeme).
async function chercherDansLePath(binaire: string): Promise<string | null> {
  const pathEnv = process.env['PATH'] ?? ''
  const dossiers = pathEnv.split(path.delimiter).filter((d) => d.length > 0)
  const extensions = process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']

  for (const dossier of dossiers) {
    for (const extension of extensions) {
      const candidat = path.join(dossier, binaire + extension)
      try {
        await access(candidat, constants.X_OK)
        return candidat
      } catch {
        // Ce dossier ne contient pas le binaire : on essaie le suivant.
      }
    }
  }
  return null
}

const lanceurClaude = new ProcessClaudeRunner({ spawn: nodeSpawn, which: chercherDansLePath })
const serviceClaude = new AiService(lanceurClaude)

// Jeton Figma chiffre (decision 3 du brief) : jamais en clair sur disque.
// Le chemin depend du dossier de donnees utilisateur, connu seulement une
// fois l'application prete -- le magasin est donc construit dans
// demarrer(), pas au chargement du module.
let magasinSecrets: ReturnType<typeof createSecretStore> | undefined

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function fenetreDepuisEvenement(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function enregistrerLesGestionnaires(): void {
  ipcMain.handle('openDocument', (event) => {
    const win = fenetreDepuisEvenement(event)
    return createDocumentHandler({
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, contents) => writeFile(p, contents, 'utf8'),
      chooseOpenPath: chooseOpenDocumentPath(win),
      chooseSavePath: chooseSaveDocumentPath(win),
    }).openDocument()
  })

  ipcMain.handle('saveDocument', (event, input) => {
    const win = fenetreDepuisEvenement(event)
    return createDocumentHandler({
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, contents) => writeFile(p, contents, 'utf8'),
      chooseOpenPath: chooseOpenDocumentPath(win),
      chooseSavePath: chooseSaveDocumentPath(win),
    }).saveDocument(input)
  })

  ipcMain.handle('importFigma', async (event, input) => {
    const win = fenetreDepuisEvenement(event)
    const jeton = magasinSecrets ? await magasinSecrets.getToken() : null
    const client = jeton !== null ? new FigmaClient({ token: jeton, fetch: nodeFetch }) : null
    return createFigmaHandler({
      client,
      chooseFile: chooseFigmaJsonFile(win),
      readFile: (p) => readFile(p, 'utf8'),
    })(input)
  })

  ipcMain.handle('exportProject', (event, input) => {
    const win = fenetreDepuisEvenement(event)
    return createExportHandler({
      writeFile: (p, contents, encoding) => writeFile(p, contents, encoding),
      mkdir: async (p) => {
        await mkdir(p, { recursive: true })
      },
      chooseDirectory: chooseDirectory(win),
      pathExists,
      confirmOverwrite: confirmOverwrite(win),
    })(input)
  })

  ipcMain.handle('listExporters', () => listExporters().map(({ id, label, maturity }) => ({ id, label, maturity })))

  ipcMain.handle('askClaude', (_event, input) => createClaudeHandler({ service: serviceClaude })(input))

  ipcMain.handle('claudeAvailable', () => lanceurClaude.isAvailable())

  ipcMain.handle('getSettings', async () => {
    if (!magasinSecrets) return { hasFigmaToken: false }
    return createGetSettingsHandler({ secretStore: magasinSecrets })()
  })

  ipcMain.handle('setFigmaToken', async (_event, token: string) => {
    if (!magasinSecrets) throw new Error("Le stockage des reglages n'est pas encore initialise")
    return createSetFigmaTokenHandler({ secretStore: magasinSecrets })(token)
  })
}

function envoyerAuxFenetres(canal: string): void {
  for (const fenetre of BrowserWindow.getAllWindows()) {
    fenetre.webContents.send(canal)
  }
}

function construireLeMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ouvrir...',
          accelerator: 'CmdOrCtrl+O',
          click: () => envoyerAuxFenetres('calque:menu-open'),
        },
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          click: () => envoyerAuxFenetres('calque:menu-save'),
        },
        {
          label: 'Enregistrer sous...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => envoyerAuxFenetres('calque:menu-save-as'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Edition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Retablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout selectionner' },
      ],
    },
  ])
}

async function demarrer(): Promise<void> {
  await app.whenReady()

  magasinSecrets = createSecretStore({
    safeStorage,
    filePath: path.join(app.getPath('userData'), 'figma-token.enc'),
    fs: {
      readFile: (p) => readFile(p),
      writeFile: (p, data) => writeFile(p, data),
      pathExists,
    },
  })

  enregistrerLesGestionnaires()
  Menu.setApplicationMenu(construireLeMenu())
  creerFenetrePrincipale()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      creerFenetrePrincipale()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void demarrer()
