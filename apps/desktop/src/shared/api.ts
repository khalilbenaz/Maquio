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
  askClaude(input: {
    instruction: string
    json: string
    selectionIds: string[]
    pageId: string
  }): Promise<{ patchJson: string }>
  claudeAvailable(): Promise<boolean>
  getSettings(): Promise<{ hasFigmaToken: boolean }>
  setFigmaToken(token: string): Promise<void>
}

export const API_CHANNELS = [
  'openDocument',
  'saveDocument',
  'importFigma',
  'exportProject',
  'askClaude',
  'claudeAvailable',
  'getSettings',
  'setFigmaToken',
] as const
