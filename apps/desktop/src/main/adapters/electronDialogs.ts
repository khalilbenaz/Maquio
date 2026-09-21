// Adaptateurs reels de dialogues natifs (Tache 17, decision 2 du brief) :
// enveloppent `dialog` d'Electron pour le choix de dossier/fichier et la
// confirmation d'ecrasement, injectes dans createExportHandler /
// createFigmaHandler / createDocumentHandler plutot qu'importes par eux --
// c'est ce qui les rend testables sans Electron (voir exportHandlers.ts,
// figmaHandlers.ts, documentHandlers.ts et leurs tests).
import { dialog, type BrowserWindow } from 'electron'

export function chooseDirectory(win: BrowserWindow | null): () => Promise<string | null> {
  return async () => {
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }
}

export function confirmOverwrite(win: BrowserWindow | null): (existingFiles: string[]) => Promise<boolean> {
  return async (existingFiles) => {
    const options = {
      type: 'warning' as const,
      buttons: ['Annuler', 'Écraser'],
      defaultId: 0,
      cancelId: 0,
      message: `${existingFiles.length} fichier(s) existent déjà à cet emplacement`,
      detail: existingFiles.join('\n'),
    }
    const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return result.response === 1
  }
}

export function chooseOpenDocumentPath(win: BrowserWindow | null): () => Promise<string | null> {
  return async () => {
    const options = { properties: ['openFile' as const], filters: [{ name: 'Document Calque', extensions: ['calque'] }] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }
}

export function chooseSaveDocumentPath(win: BrowserWindow | null): () => Promise<string | null> {
  return async () => {
    const options = { filters: [{ name: 'Document Calque', extensions: ['calque'] }] }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || result.filePath === undefined || result.filePath === '') return null
    return result.filePath
  }
}

export function chooseFigmaJsonFile(win: BrowserWindow | null): () => Promise<string | null> {
  return async () => {
    const options = { properties: ['openFile' as const], filters: [{ name: 'Export JSON Figma', extensions: ['json'] }] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }
}

// Défaut n3 (« comment mettre l'image ? ») : sélecteur de fichier natif
// pour choisir une image, au tracé d'un nœud Image et depuis l'inspecteur
// (voir shared/api.ts, chooseImage). Même forme que chooseFigmaJsonFile
// ci-dessus, filtree sur les formats d'image courants.
export function chooseImageFile(win: BrowserWindow | null): () => Promise<string | null> {
  return async () => {
    const options = {
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }
}
