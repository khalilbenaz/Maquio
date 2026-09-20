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
  askClaude: (input) => ipcRenderer.invoke('askClaude', input),
  claudeAvailable: () => ipcRenderer.invoke('claudeAvailable'),
  getSettings: () => ipcRenderer.invoke('getSettings'),
  setFigmaToken: (token) => ipcRenderer.invoke('setFigmaToken', token),
}

const clesExposees = Object.keys(api).sort()
const clesDeclarees = [...API_CHANNELS].sort()
const memesCles =
  clesExposees.length === clesDeclarees.length && clesExposees.every((cle, i) => cle === clesDeclarees[i])
if (!memesCles) {
  throw new Error('Le preload expose des canaux differents de API_CHANNELS')
}

contextBridge.exposeInMainWorld('calque', api)
