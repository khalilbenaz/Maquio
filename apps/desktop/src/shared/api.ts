// Frontiere figee entre les trois cotes de l'application (main, preload,
// renderer). Ce fichier ne contient QUE des types et la liste des canaux :
// il n'importe ni Electron, ni React, ni Node, ni meme les paquets du
// monorepo (@calque/core, @calque/codegen, @calque/figma, @calque/ai) --
// les quelques types qui en proviennent (ExporterId, ImportReport) sont
// dupliques ci-dessous a l'identique, pour que ce fichier reste sans
// aucune dependance et puisse etre importe tel quel par les trois cotes.
//
// API_CHANNELS est la source de verite unique des noms de canaux IPC : le
// main y enregistre un ipcMain.handle par entree, le preload expose
// exactement ces noms, et les tests verifient les deux contre cette liste.
// Aucun nom de canal ne doit etre ecrit en dur ailleurs dans le code.

// Duplique de @calque/codegen (ExporterId), voir la note ci-dessus.
export type ExporterId = 'flutter' | 'react-native' | 'swiftui' | 'compose'

// Duplique de @calque/codegen (Exporter, prive de sa methode export() qui
// ne traverserait pas l'IPC) : ce que listExporters() rend au renderer
// pour peupler le menu d'export sans jamais importer @calque/codegen
// (Tache 17, decision du brief sur la barre d'outils).
export type ExportTargetInfo = { id: ExporterId; label: string; maturity: 'complete' | 'preview' }

// Duplique de @calque/figma (ImportWarning / ImportReport), voir la note
// ci-dessus.
export type ImportWarning = { nodeId: string; nodeName: string; reason: string }
export type ImportReport = { nodesImported: number; warnings: ImportWarning[] }

export type CalqueApi = {
  openDocument(): Promise<{ path: string; json: string } | null>
  saveDocument(input: { path: string | null; json: string }): Promise<{ path: string } | null>
  importFigma(
    input: { source: 'api'; fileKey: string } | { source: 'file' },
  ): Promise<{ json: string; report: ImportReport } | null>
  exportProject(input: {
    exporterId: ExporterId
    json: string
    projectName: string
  }): Promise<{ directory: string; files: string[]; warnings: string[] } | null>
  listExporters(): Promise<ExportTargetInfo[]>
  // Tache 17 : rend aussi documentJson (le document apres application de la
  // commande composite atomique, calculee cote main via @calque/ai) en plus
  // de patchJson (pour l'affichage du resume) -- le renderer ne peut pas
  // reconstruire la commande lui-meme sans importer @calque/ai (interdit),
  // il se contente de rejouer le remplacement de document (voir
  // ClaudePanel.tsx), ce qui reste annulable en un seul geste.
  askClaude(input: {
    instruction: string
    json: string
    selectionIds: string[]
    pageId: string
  }): Promise<{ patchJson: string; documentJson: string }>
  claudeAvailable(): Promise<boolean>
  getSettings(): Promise<{ hasFigmaToken: boolean }>
  setFigmaToken(token: string): Promise<void>
}

export const API_CHANNELS = [
  'openDocument',
  'saveDocument',
  'importFigma',
  'exportProject',
  'listExporters',
  'askClaude',
  'claudeAvailable',
  'getSettings',
  'setFigmaToken',
] as const
