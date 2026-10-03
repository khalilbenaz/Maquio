// Gestionnaire du canal exportProject (Tache 17) : fonction pure
// d'injection, testable sans Electron ni systeme de fichiers reel (voir
// test/exportHandlers.test.ts). main.ts se contente de la cabler avec
// node:fs/promises et les dialogues natifs (electronDialogs.ts).
//
// Decision 5 du brief : l'export n'ecrit rien tant que tout n'est pas
// decide -- choix du dossier, detection des fichiers existants,
// confirmation d'ecrasement, PUIS ecriture. Si l'utilisateur annule a
// n'importe quelle etape (dossier ou confirmation), aucun fichier n'est
// ecrit : chooseDirectory/confirmOverwrite sont toujours resolus avant le
// premier appel a writeFile.
import { dirname, join } from 'node:path'
import { getExporter } from '@calque/codegen'
import type { ExporterId, ExportResult } from '@calque/codegen'
import { DocumentVersionError, parseDocument } from '@calque/core'
import { translateUnknownError } from '../../shared/errors'

export type ExportOutcome = { directory: string; files: string[]; warnings: string[] } | null

// Round de correction 1 (Critical) : le repli generique passe desormais par
// la traduction partagee (src/shared/errors.ts), qui reconnait ZodError
// (schema du document invalide) et ne rend jamais son dump JSON brut.
function translateExportError(err: unknown): Error {
  if (err instanceof DocumentVersionError) return new Error(err.message)
  return translateUnknownError(err, 'Export impossible')
}

export function createExportHandler(deps: {
  writeFile: (path: string, contents: string, encoding: 'utf8') => Promise<void>
  mkdir: (path: string) => Promise<void>
  chooseDirectory: () => Promise<string | null>
  pathExists: (path: string) => Promise<boolean>
  // Optionnelle : quand des fichiers existent deja et qu'aucune fonction
  // de confirmation n'est fournie, le choix le plus sur est de refuser
  // l'ecrasement (jamais d'ecrasement silencieux par defaut).
  confirmOverwrite?: (existingFiles: string[]) => Promise<boolean>
}) {
  return async (input: {
    exporterId: ExporterId
    json: string
    projectName: string
    activeScreenId?: string
  }): Promise<ExportOutcome> => {
    const exporter = getExporter(input.exporterId)

    let document: ReturnType<typeof parseDocument>
    try {
      document = parseDocument(input.json)
    } catch (err) {
      throw translateExportError(err)
    }

    let result: ExportResult
    try {
      // L'ecran actif choisit l'ecran de DEPART de la navigation generee
      // (tous les ecrans sont exportes) -- sans effet sur un document sans
      // ecran (v1 non migre).
      result = exporter.export(document, { projectName: input.projectName, activeScreenId: input.activeScreenId })
    } catch (err) {
      throw translateExportError(err)
    }

    const directory = await deps.chooseDirectory()
    if (directory === null) return null

    const targets = result.files.map((f) => ({ path: f.path, contents: f.contents, fullPath: join(directory, f.path) }))

    const existing: string[] = []
    for (const target of targets) {
      if (await deps.pathExists(target.fullPath)) existing.push(target.path)
    }

    if (existing.length > 0) {
      const confirmed = deps.confirmOverwrite ? await deps.confirmOverwrite(existing) : false
      if (!confirmed) return null
    }

    const dirsCreated = new Set<string>()
    for (const target of targets) {
      const dir = dirname(target.fullPath)
      if (!dirsCreated.has(dir)) {
        await deps.mkdir(dir)
        dirsCreated.add(dir)
      }
      await deps.writeFile(target.fullPath, target.contents, 'utf8')
    }

    return { directory, files: targets.map((t) => t.path), warnings: result.warnings }
  }
}
