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
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
import { getExporter, localImageSources } from '@calque/codegen'
import type { ExporterId, ExportResult } from '@calque/codegen'
import { DocumentVersionError, parseDocument } from '@calque/core'
import { translateUnknownError } from '../../shared/errors'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

// Source reelle d'une image a copier, ou la raison du refus. Le `src` vient
// du document (donc possiblement d'un tiers) : un chemin relatif ne sort
// jamais de `<document>.ressources/`, un chemin absolu n'est copie que s'il
// a ete choisi avec le selecteur d'image de cette session ; dans tous les
// cas c'est une image (extension).
export function resolveAssetSource(
  src: string,
  documentPath: string | null,
  isApproved: (p: string) => boolean,
): { path: string } | { reason: string } {
  if (!IMAGE_EXTENSIONS.has(extname(src).toLowerCase())) return { reason: "ce n'est pas une image" }
  if (isAbsolute(src)) {
    return isApproved(src) ? { path: src } : { reason: "fichier local non choisi avec le sélecteur d'image" }
  }
  if (documentPath === null) return { reason: "le document n'est pas enregistré, ses ressources sont introuvables" }
  const resources = join(dirname(documentPath), `${basename(documentPath, '.calque')}.ressources`)
  const full = join(resources, src)
  const rel = relative(resources, full)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) return { reason: 'chemin hors du dossier de ressources' }
  return { path: full }
}

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
  // Copie des images locales dans le projet exporte.
  copyFile?: (source: string, dest: string) => Promise<void>
  // Lecture binaire (SVG et Figma embarquent le contenu des images).
  readBinary?: (path: string) => Promise<Uint8Array>
  isApprovedImagePath?: (path: string) => boolean
}) {
  return async (input: {
    exporterId: ExporterId
    json: string
    projectName: string
    activeScreenId?: string
    documentPath?: string | null
  }): Promise<ExportOutcome> => {
    const exporter = getExporter(input.exporterId)

    let document: ReturnType<typeof parseDocument>
    try {
      document = parseDocument(input.json)
    } catch (err) {
      throw translateExportError(err)
    }

    // Sorties autonomes (SVG, Figma) : le contenu des images est lu ICI, avec
    // les memes regles de securite que la copie (jamais hors des ressources).
    const preloaded = new Map<string, Uint8Array>()
    if ((input.exporterId === 'svg' || input.exporterId === 'figma') && deps.readBinary !== undefined) {
      for (const src of localImageSources(document)) {
        const resolved = resolveAssetSource(src, input.documentPath ?? null, deps.isApprovedImagePath ?? (() => false))
        if ('reason' in resolved || !(await deps.pathExists(resolved.path))) {
          continue
        }
        try {
          preloaded.set(src, await deps.readBinary(resolved.path))
        } catch {
          // illisible : l'exportateur le signalera (image introuvable)
        }
      }
    }

    let result: ExportResult
    try {
      // L'ecran actif choisit l'ecran de DEPART de la navigation generee
      // (tous les ecrans sont exportes) -- sans effet sur un document sans
      // ecran (v1 non migre).
      result = exporter.export(document, {
        projectName: input.projectName,
        activeScreenId: input.activeScreenId,
        loadImage: (src) => preloaded.get(src) ?? null,
      })
    } catch (err) {
      throw translateExportError(err)
    }

    const directory = await deps.chooseDirectory()
    if (directory === null) return null

    const targets = result.files.map((f) => ({ path: f.path, contents: f.contents, fullPath: join(directory, f.path) }))

    // Images : sources verifiees AVANT toute ecriture ; une image refusee ou
    // introuvable n'arrete pas l'export, elle est signalee.
    const warnings = [...result.warnings]
    const copies: { path: string; from: string; fullPath: string }[] = []
    for (const asset of result.assets ?? []) {
      const resolved = resolveAssetSource(asset.source, input.documentPath ?? null, deps.isApprovedImagePath ?? (() => false))
      if ('reason' in resolved) {
        warnings.push(`image « ${asset.source} » non copiée : ${resolved.reason}`)
        continue
      }
      if (!(await deps.pathExists(resolved.path)) || deps.copyFile === undefined) {
        warnings.push(`image « ${asset.source} » non copiée : fichier introuvable (${resolved.path})`)
        continue
      }
      copies.push({ path: asset.path, from: resolved.path, fullPath: join(directory, asset.path) })
    }

    const existing: string[] = []
    for (const target of [...targets, ...copies]) {
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
    for (const copy of copies) {
      const dir = dirname(copy.fullPath)
      if (!dirsCreated.has(dir)) {
        await deps.mkdir(dir)
        dirsCreated.add(dir)
      }
      await deps.copyFile!(copy.from, copy.fullPath)
    }

    return { directory, files: [...targets.map((t) => t.path), ...copies.map((c) => c.path)], warnings }
  }
}
