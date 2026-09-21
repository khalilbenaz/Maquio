// Pont preload (Tache 14) : seul endroit ou le renderer et Electron se
// touchent. L'objet expose est type par CalqueApi (toute cle manquante ou
// en trop est une erreur de compilation), et une verification a
// l'execution recoupe ces cles avec API_CHANNELS, la source de verite
// unique des noms de canaux (decision 3 du brief).
import { contextBridge, ipcRenderer } from 'electron'
import { API_CHANNELS, type CalqueApi } from '../shared/api'

const api: CalqueApi = {
  openDocument: () => ipcRenderer.invoke('openDocument'),
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
  chooseImage: () => ipcRenderer.invoke('chooseImage'),
}

const clesExposees = Object.keys(api).sort()
const clesDeclarees = [...API_CHANNELS].sort()
const memesCles =
  clesExposees.length === clesDeclarees.length && clesExposees.every((cle, i) => cle === clesDeclarees[i])
if (!memesCles) {
  throw new Error('Le preload expose des canaux differents de API_CHANNELS')
}

contextBridge.exposeInMainWorld('calque', api)

// Second pont, distinct de `api` ci-dessus (Tache 17, decision 10 du
// brief) : le menu natif "Fichier" (Ouvrir/Enregistrer/Enregistrer sous)
// vit cote main et doit pouvoir demander au renderer d'agir -- un simple
// signal (aucune donnee sensible), jamais l'inverse d'un canal
// ipcMain.handle. Reste hors de `api`/API_CHANNELS a dessein : ce ne sont
// pas des canaux invoke/handle, et les meler aurait fait echouer la
// verification de coherence ci-dessus.
contextBridge.exposeInMainWorld('calqueMenu', {
  // "Nouveau" (finition v1) : aucune logique metier cote main (contrairement
  // a Ouvrir/Enregistrer, qui touchent le disque) -- un document vierge se
  // construit entierement dans le renderer via createDocument() de
  // @calque/core (deja importable la-bas). Ce canal reste donc un simple
  // signal, du meme type que les trois suivants, plutot que d'elargir
  // CalqueApi/API_CHANNELS avec un canal invoke qui n'aurait rien a faire
  // cote main.
  onNewRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('calque:menu-new', listener)
    return () => ipcRenderer.removeListener('calque:menu-new', listener)
  },
  onOpenRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('calque:menu-open', listener)
    return () => ipcRenderer.removeListener('calque:menu-open', listener)
  },
  onSaveRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('calque:menu-save', listener)
    return () => ipcRenderer.removeListener('calque:menu-save', listener)
  },
  onSaveAsRequested: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('calque:menu-save-as', listener)
    return () => ipcRenderer.removeListener('calque:menu-save-as', listener)
  },
})
