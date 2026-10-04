// Pont preload (Tache 14) : seul endroit ou le renderer et Electron se
// touchent. L'objet expose est type par MaquioApi (toute cle manquante ou
// en trop est une erreur de compilation), et une verification a
// l'execution recoupe ces cles avec API_CHANNELS, la source de verite
// unique des noms de canaux (decision 3 du brief).
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { API_CHANNELS, type MaquioApi } from '../shared/api'

const api: MaquioApi = {
  openDocument: () => ipcRenderer.invoke('openDocument'),
  openDocumentAt: (path) => ipcRenderer.invoke('openDocumentAt', path),
  saveDocument: (input) => ipcRenderer.invoke('saveDocument', input),
  importFigma: (input) => ipcRenderer.invoke('importFigma', input),
  exportProject: (input) => ipcRenderer.invoke('exportProject', input),
  listExporters: () => ipcRenderer.invoke('listExporters'),
  askClaude: (input) => ipcRenderer.invoke('askClaude', input),
  cancelClaude: () => ipcRenderer.invoke('cancelClaude'),
  claudeAvailable: () => ipcRenderer.invoke('claudeAvailable'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setFigmaToken: (token) => ipcRenderer.invoke('setFigmaToken', token),
  setClaudeCustomPath: (path) => ipcRenderer.invoke('setClaudeCustomPath', path),
  redetectClaude: () => ipcRenderer.invoke('redetectClaude'),
  chooseClaudeBinary: () => ipcRenderer.invoke('chooseClaudeBinary'),
  chooseImage: () => ipcRenderer.invoke('chooseImage'),
  getThemePreference: () => ipcRenderer.invoke('getThemePreference'),
  setThemePreference: (preference) => ipcRenderer.invoke('setThemePreference', preference),
}

const clesExposees = Object.keys(api).sort()
const clesDeclarees = [...API_CHANNELS].sort()
const memesCles =
  clesExposees.length === clesDeclarees.length && clesExposees.every((cle, i) => cle === clesDeclarees[i])
if (!memesCles) {
  throw new Error('Le preload expose des canaux differents de API_CHANNELS')
}

contextBridge.exposeInMainWorld('maquio', api)

// Second pont, distinct de `api` ci-dessus (Tache 17, decision 10 du
// brief) : le menu natif "Fichier" (Ouvrir/Enregistrer/Enregistrer sous)
// vit cote main et doit pouvoir demander au renderer d'agir -- un simple
// signal (aucune donnee sensible), jamais l'inverse d'un canal
// ipcMain.handle. Reste hors de `api`/API_CHANNELS a dessein : ce ne sont
// pas des canaux invoke/handle, et les meler aurait fait echouer la
// verification de coherence ci-dessus.
contextBridge.exposeInMainWorld('maquioMenu', {
  // Commandes du menu Affichage (panneaux, mode focus, theme...).
  onViewRequested: (callback: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => callback(action)
    ipcRenderer.on('maquio:menu-view', listener)
    return () => ipcRenderer.removeListener('maquio:menu-view', listener)
  },
  // Le theme a change (menu Affichage) : le renderer met son etat a jour.
  onThemeChanged: (callback: (preference: string) => void) => {
    const listener = (_event: unknown, preference: string) => callback(preference)
    ipcRenderer.on('maquio:theme-changed', listener)
    return () => ipcRenderer.removeListener('maquio:theme-changed', listener)
  },
  // Chemin reel d'un fichier depose sur la fenetre (le renderer n'a plus acces a `File.path`).
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  // Ouverture demandee par le systeme (double-clic dans le Finder, `open -a`).
  onOpenPathRequested: (callback: (path: string) => void) => {
    const listener = (_event: unknown, path: string) => callback(path)
    ipcRenderer.on('maquio:open-path', listener)
    return () => ipcRenderer.removeListener('maquio:open-path', listener)
  },
  // "Nouveau" (finition v1) : aucune logique metier cote main (contrairement
  // a Ouvrir/Enregistrer, qui touchent le disque) -- un document vierge se
  // construit entierement dans le renderer via createDocument() de
  // @maquio/core (deja importable la-bas). Ce canal reste donc un simple
  // signal, du meme type que les trois suivants, plutot que d'elargir
  // MaquioApi/API_CHANNELS avec un canal invoke qui n'aurait rien a faire
  // cote main.
  onNewRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('maquio:menu-new', listener)
    return () => ipcRenderer.removeListener('maquio:menu-new', listener)
  },
  onOpenRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('maquio:menu-open', listener)
    return () => ipcRenderer.removeListener('maquio:menu-open', listener)
  },
  onSaveRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('maquio:menu-save', listener)
    return () => ipcRenderer.removeListener('maquio:menu-save', listener)
  },
  onSaveAsRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('maquio:menu-save-as', listener)
    return () => ipcRenderer.removeListener('maquio:menu-save-as', listener)
  },
})
