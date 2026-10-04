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
import { access, constants, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, safeStorage } from 'electron'
import { AiService, ProcessClaudeRunner } from '@maquio/ai'
import { FigmaClient } from '@maquio/figma'
import { listExporters } from '@maquio/codegen'
import { cheminIcone, creerFenetrePrincipale } from './window'
import { isDocumentPath } from '../shared/documentFile'
import { isTrustedSender, UntrustedSenderError } from './security'
import { nodeSpawn } from './adapters/nodeSpawn'
import { nodeFetch } from './adapters/nodeFetch'
import { figmaApiBase } from './adapters/figmaApiBase'
import { createSecretStore } from './adapters/secretStore'
import { createClaudeSettingsStore } from './adapters/claudeSettingsStore'
import { createClaudeWhich, validateClaudeBinaryPath } from './adapters/claudeDetection'
import type { ClaudePathFs } from './adapters/claudeDetection'
import { createNeutralClaudeWorkingDirectory } from './adapters/claudeWorkingDirectory'
import {
  chooseDirectory,
  chooseFigmaJsonFile,
  chooseImageFile,
  chooseLegacyExtension,
  chooseOpenDocumentPath,
  chooseSaveDocumentPath,
  confirmOverwrite,
} from './adapters/electronDialogs'
import { createDocumentHandler } from './handlers/documentHandlers'
import { createExportHandler } from './handlers/exportHandlers'
import { createFigmaHandler, createGetSettingsHandler, createSetFigmaTokenHandler } from './handlers/figmaHandlers'
import { createGetClaudeSettingsHandler, createSetClaudeCustomPathHandler } from './handlers/claudeSettingsHandlers'
import { ClaudeRequestTracker, createClaudeCancelHandler, createClaudeHandler } from './handlers/claudeHandlers'

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

// Verification reelle qu'un chemin designe un executable (X_OK), utilisee
// par validateClaudeBinaryPath pour distinguer "non executable" d'un
// dossier (X_OK reussit sur un dossier POSIX -- traversable -- ce qui
// justifie a lui seul le test isDirectory() prealable dans
// validateClaudeBinaryPath).
async function estExecutable(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const claudePathFs: ClaudePathFs = { stat, isExecutable: estExecutable }

// Reglages Claude Code (chemin personnalise, JSON ordinaire -- PAS un
// secret, voir claudeSettingsStore.ts). Comme magasinSecrets : le chemin du
// fichier depend du dossier de donnees utilisateur, connu seulement une
// fois l'application prete, donc construit dans demarrer(). Les fonctions
// ci-dessous le referencent en le lisant a CHAQUE appel (jamais capture par
// valeur) : c'est ce qui fait qu'un reglage enregistre depuis le dialogue
// des reglages est immediatement pris en compte, sans redemarrer
// l'application ni reconstruire lanceurClaude.
let magasinReglagesClaude: ReturnType<typeof createClaudeSettingsStore> | undefined

// `which` reellement injecte dans ProcessClaudeRunner : donne la priorite
// au chemin personnalise des reglages quand il pointe vers un executable
// valide, retombe sur la recherche dans le PATH sinon (decision du brief :
// @maquio/ai ne connait jamais la notion de reglages, toute la composition
// vit ici). resolveClaudeStatus() (utilise par les gestionnaires de
// reglages ci-dessous) appelle ce MEME `which` : l'etat affiche dans les
// reglages est donc exactement celui qui determine ce que `claude -p ...`
// lancera reellement.
const whichClaude = createClaudeWhich({
  getCustomPath: async () => (magasinReglagesClaude ? magasinReglagesClaude.getCustomPath() : null),
  fallback: chercherDansLePath,
  validate: (p) => validateClaudeBinaryPath(p, claudePathFs),
})

async function resolveClaudeStatus(): Promise<{ available: boolean; path: string | null }> {
  const p = await whichClaude('claude')
  return { available: p !== null, path: p }
}

// Defaut A (reparation du pont) : `workingDirectory` fournit a chaque appel
// un repertoire temporaire vide, cree et nettoye par l'application (voir
// claudeWorkingDirectory.ts) -- jamais le dossier de l'utilisateur ni celui
// du document ouvert. Sans lui, `claude -p` herite du cwd d'Electron et,
// dans un dossier de projet, part l'explorer au lieu de repondre (verifie
// en conditions reelles : le meme appel termine en 13s depuis /tmp, jamais
// termine apres 10 minutes depuis un dossier de projet). Le delai par
// defaut (DEFAULT_CLAUDE_TIMEOUT_MS, 2 minutes) et l'annulation (point 2)
// sont geres par ProcessClaudeRunner lui-meme (packages/ai/src/runner.ts) ;
// claudeRequests (ci-dessous) fournit le signal d'annulation transmis a
// chaque appel, declenche par le canal cancelClaude.
const lanceurClaude = new ProcessClaudeRunner({
  spawn: nodeSpawn,
  which: whichClaude,
  workingDirectory: createNeutralClaudeWorkingDirectory,
  // Delai personnalisable (tests de bout en bout) ; absent ou invalide : 2 minutes.
  ...(Number.isFinite(Number(process.env['MAQUIO_CLAUDE_TIMEOUT_MS'])) && Number(process.env['MAQUIO_CLAUDE_TIMEOUT_MS']) > 0
    ? { timeoutMs: Number(process.env['MAQUIO_CLAUDE_TIMEOUT_MS']) }
    : {}),
})
const serviceClaude = new AiService(lanceurClaude)
const claudeRequests = new ClaudeRequestTracker()

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

// Chemins d'images choisis par l'utilisateur avec le selecteur natif
// pendant cette session : seuls ceux-la peuvent etre copies a cote du
// document a l'enregistrement (voir documentHandlers.ts, audit P0 : un
// document tiers ne doit pas pouvoir faire copier ~/.ssh/id_rsa).
const cheminsImagesApprouves = new Set<string>()

function fenetreDepuisEvenement(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

// Tous les canaux passent par ici : l'appelant (cadre principal charge depuis
// l'application) est controle avant d'executer quoi que ce soit.
function handle(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: never[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, process.env['VITE_DEV_SERVER_URL'] ?? null)) throw new UntrustedSenderError(channel)
    return (listener as (e: Electron.IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args)
  })
}

function enregistrerLesGestionnaires(): void {
  handle('openDocument', (event) => {
    const win = fenetreDepuisEvenement(event)
    return createDocumentHandler({
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, contents) => writeFile(p, contents, 'utf8'),
      chooseOpenPath: chooseOpenDocumentPath(win),
      chooseSavePath: chooseSaveDocumentPath(win),
    }).openDocument()
  })

  handle('openDocumentAt', (event, path: string) => {
    const win = fenetreDepuisEvenement(event)
    return createDocumentHandler({
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, contents) => writeFile(p, contents, 'utf8'),
      chooseOpenPath: chooseOpenDocumentPath(win),
      chooseSavePath: chooseSaveDocumentPath(win),
    }).openDocumentAt(path)
  })

  handle('saveDocument', (event, input) => {
    const win = fenetreDepuisEvenement(event)
    return createDocumentHandler({
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, contents) => writeFile(p, contents, 'utf8'),
      chooseOpenPath: chooseOpenDocumentPath(win),
      chooseSavePath: chooseSaveDocumentPath(win),
      chooseLegacyExtension: chooseLegacyExtension(win),
      pathExists,
      copyImageFile: (source, dest) => copyFile(source, dest),
      ensureDir: async (dirPath) => {
        await mkdir(dirPath, { recursive: true })
      },
      isApprovedImagePath: (p) => cheminsImagesApprouves.has(p),
    }).saveDocument(input)
  })

  handle('chooseImage', async (event) => {
    const chemin = await chooseImageFile(fenetreDepuisEvenement(event))()
    if (chemin !== null) cheminsImagesApprouves.add(chemin)
    return chemin
  })

  handle('importFigma', async (event, input) => {
    const win = fenetreDepuisEvenement(event)
    const jeton = magasinSecrets ? await magasinSecrets.getToken() : null
    const client = jeton !== null ? new FigmaClient({ token: jeton, fetch: nodeFetch, baseUrl: figmaApiBase(process.env) }) : null
    return createFigmaHandler({
      client,
      chooseFile: chooseFigmaJsonFile(win),
      readFile: (p) => readFile(p, 'utf8'),
    })(input)
  })

  handle('exportProject', (event, input) => {
    const win = fenetreDepuisEvenement(event)
    return createExportHandler({
      writeFile: (p, contents, encoding) => writeFile(p, contents, encoding),
      mkdir: async (p) => {
        await mkdir(p, { recursive: true })
      },
      chooseDirectory: chooseDirectory(win),
      pathExists,
      confirmOverwrite: confirmOverwrite(win),
      copyFile: (source, dest) => copyFile(source, dest),
      readBinary: (p) => readFile(p),
      isApprovedImagePath: (p) => cheminsImagesApprouves.has(p),
    })(input)
  })

  handle('listExporters', () => listExporters().map(({ id, label, maturity }) => ({ id, label, maturity })))

  handle('askClaude', (_event, input) =>
    createClaudeHandler({ service: serviceClaude, requests: claudeRequests })(input),
  )

  handle('cancelClaude', () => createClaudeCancelHandler({ requests: claudeRequests })())

  handle('claudeAvailable', () => lanceurClaude.isAvailable())

  handle('getSettings', async () => {
    const figma = magasinSecrets ? await createGetSettingsHandler({ secretStore: magasinSecrets })() : { hasFigmaToken: false }
    const claude = magasinReglagesClaude
      ? await createGetClaudeSettingsHandler({ store: magasinReglagesClaude, resolveStatus: resolveClaudeStatus })()
      : { claudeAvailable: false, claudePath: null, claudeCustomPath: null }
    return { ...figma, ...claude }
  })

  handle('setFigmaToken', async (_event, token: string) => {
    if (!magasinSecrets) throw new Error("Le stockage des reglages n'est pas encore initialise")
    return createSetFigmaTokenHandler({ secretStore: magasinSecrets })(token)
  })

  handle('setClaudeCustomPath', async (_event, rawPath: string) => {
    if (!magasinReglagesClaude) throw new Error("Le stockage des reglages n'est pas encore initialise")
    return createSetClaudeCustomPathHandler({
      store: magasinReglagesClaude,
      validate: (p) => validateClaudeBinaryPath(p, claudePathFs),
      resolveStatus: resolveClaudeStatus,
    })(rawPath)
  })
}

function envoyerAuxFenetres(canal: string): void {
  for (const fenetre of BrowserWindow.getAllWindows()) {
    fenetre.webContents.send(canal)
  }
}

function construireLeMenu(): Menu {
  return Menu.buildFromTemplate([
    // Menu application standard (finition v1, Critical) : sur macOS, le
    // system (Cocoa/NSMenu) affiche TOUJOURS le tout premier menu de la
    // barre avec le nom du processus ("Maquio"), quel que soit le `label`
    // qu'on lui donne -- c'est ce qui avalait silencieusement le menu
    // "Fichier" ci-dessous quand il occupait la premiere position : ses
    // elements (Nouveau/Ouvrir/Enregistrer/Enregistrer sous/Quitter)
    // fonctionnaient bel et bien, mais le menu qui les contenait
    // s'affichait sous le nom "Maquio", jamais sous "Fichier" -- d'ou le
    // defaut signale ("la barre de menus n'a que Maquio et Édition").
    // `role: 'appMenu'` cede cette premiere position au menu standard
    // (À propos, Services, Masquer, Quitter...), deja localise par le
    // systeme, et laisse "Fichier" apparaitre normalement en deuxieme
    // position, sous son propre nom.
    { role: 'appMenu' },
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouveau',
          accelerator: 'CmdOrCtrl+N',
          click: () => envoyerAuxFenetres('maquio:menu-new'),
        },
        {
          label: 'Ouvrir...',
          accelerator: 'CmdOrCtrl+O',
          click: () => envoyerAuxFenetres('maquio:menu-open'),
        },
        {
          label: 'Enregistrer',
          accelerator: 'CmdOrCtrl+S',
          click: () => envoyerAuxFenetres('maquio:menu-save'),
        },
        {
          label: 'Enregistrer sous...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => envoyerAuxFenetres('maquio:menu-save-as'),
        },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
  ])
}

// Ouverture demandee par le systeme (double-clic sur un .maquio / .calque dans
// le Finder, `open -a Maquio fichier`) : memorisee jusqu'a ce que la fenetre
// soit prete, puis envoyee au renderer.
let cheminsEnAttente: string[] = []
function demanderOuverture(chemin: string): void {
  if (!isDocumentPath(chemin)) return
  const fenetre = BrowserWindow.getAllWindows()[0]
  if (fenetre && !fenetre.webContents.isLoading()) fenetre.webContents.send('maquio:open-path', chemin)
  else cheminsEnAttente.push(chemin)
}
app.on('open-file', (event, chemin) => {
  event.preventDefault()
  demanderOuverture(chemin)
})

async function demarrer(): Promise<void> {
  app.setName('Maquio')
  app.setAboutPanelOptions({
    applicationName: 'Maquio',
    applicationVersion: app.getVersion(),
    credits: 'De la maquette au code natif.',
    iconPath: cheminIcone(),
  })
  await app.whenReady()
  // Windows / Linux : fichier passe en argument (`maquio mon.maquio`).
  for (const argument of process.argv.slice(1)) demanderOuverture(argument)

  magasinSecrets = createSecretStore({
    safeStorage,
    filePath: path.join(app.getPath('userData'), 'figma-token.enc'),
    fs: {
      readFile: (p) => readFile(p),
      writeFile: (p, data) => writeFile(p, data),
      pathExists,
    },
  })

  // JSON ordinaire, jamais chiffre (voir claudeSettingsStore.ts) : un
  // chemin de binaire n'est pas un secret.
  magasinReglagesClaude = createClaudeSettingsStore({
    filePath: path.join(app.getPath('userData'), 'claude-settings.json'),
    fs: {
      readFile: (p) => readFile(p, 'utf8'),
      writeFile: (p, data) => writeFile(p, data, 'utf8'),
      pathExists,
    },
  })

  // Dock macOS (en developpement, l'application n'a pas d'icone d'empaquetage).
  if (process.platform === 'darwin') app.dock?.setIcon(cheminIcone())

  enregistrerLesGestionnaires()
  Menu.setApplicationMenu(construireLeMenu())
  const fenetre = creerFenetrePrincipale()
  fenetre.webContents.on('did-finish-load', () => {
    for (const chemin of cheminsEnAttente) fenetre.webContents.send('maquio:open-path', chemin)
    cheminsEnAttente = []
  })

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
