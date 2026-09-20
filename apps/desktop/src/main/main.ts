// Processus principal (Tache 14) : cree la fenetre, le menu, et enregistre
// un ipcMain.handle par canal declare dans API_CHANNELS (source de verite
// unique, voir src/shared/api.ts). A ce stade, sept des huit gestionnaires
// sont des souches honnetes qui levent 'pas encore branche' (decision 5 du
// brief) : cabler openDocument/saveDocument sur le vrai systeme de
// fichiers, importFigma sur @calque/figma, exportProject sur
// @calque/codegen et askClaude sur @calque/ai est le travail de la
// Tache 17. claudeAvailable et getSettings font exception :
// - claudeAvailable rend un vrai booleen, obtenu via ProcessClaudeRunner
//   (paquet @calque/ai) branche sur une recherche reelle du binaire
//   'claude' dans le PATH (aucun sous-processus n'est lance pour cette
//   seule verification) ;
// - getSettings rend un etat plausible mais fixe ({ hasFigmaToken: false })
//   car il n'y a pas encore de stockage de reglages (Tache 17 egalement).
import { spawn } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { ProcessClaudeRunner, type SpawnLike } from '@calque/ai'
import { creerFenetrePrincipale } from './window'

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

// Adaptateur reel de sous-processus pour ProcessClaudeRunner. Non utilise
// par claudeAvailable() (qui ne fait qu'une recherche dans le PATH), mais
// requis par le constructeur de ProcessClaudeRunner ; il sera reellement
// invoque quand askClaude sera cable (Tache 17).
const lancerProcessusReel: SpawnLike = (cmd, args, opts) => {
  const enfant = spawn(cmd, args, opts.signal !== undefined ? { signal: opts.signal } : {})

  const versLignes = (flux: NodeJS.ReadableStream): AsyncIterable<string> => {
    return (async function* () {
      for await (const morceau of flux) {
        yield morceau.toString()
      }
    })()
  }

  const codeSortie = new Promise<number>((resolve, reject) => {
    enfant.on('error', reject)
    enfant.on('close', (code) => resolve(code ?? 1))
  })

  return { stdout: versLignes(enfant.stdout), stderr: versLignes(enfant.stderr), exitCode: codeSortie }
}

const lanceurClaude = new ProcessClaudeRunner({ spawn: lancerProcessusReel, which: chercherDansLePath })

function enregistrerLesGestionnaires(): void {
  ipcMain.handle('openDocument', () => {
    throw new Error('pas encore branche')
  })

  ipcMain.handle('saveDocument', () => {
    throw new Error('pas encore branche')
  })

  ipcMain.handle('importFigma', () => {
    throw new Error('pas encore branche')
  })

  ipcMain.handle('exportProject', () => {
    throw new Error('pas encore branche')
  })

  ipcMain.handle('askClaude', () => {
    throw new Error('pas encore branche')
  })

  ipcMain.handle('claudeAvailable', () => lanceurClaude.isAvailable())

  ipcMain.handle('getSettings', () => ({ hasFigmaToken: false }))

  ipcMain.handle('setFigmaToken', () => {
    throw new Error('pas encore branche')
  })
}

function construireLeMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Fichier',
      submenu: [{ role: 'quit', label: 'Quitter' }],
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
    {
      label: 'Export',
      // Pas encore branche (Tache 17) : element desactive plutot que
      // simule, pour rester honnete sur ce qui fonctionne reellement.
      submenu: [{ label: 'Exporter le projet...', enabled: false }],
    },
  ])
}

async function demarrer(): Promise<void> {
  await app.whenReady()

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
