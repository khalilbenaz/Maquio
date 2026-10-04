// Export « pour Figma » : un seul fichier JSON (`<projet>.figma.json`) que le
// plugin « Import Calque » lit pour recreer ecrans, textes, formes, images,
// auto-layout et composants. Le document est embarque tel quel (apres mise en
// page automatique) avec le contenu des images locales en base64 : le
// plugin n'a besoin d'aucun autre fichier.
import { layoutPage } from '@calque/core'
import type { CalqueDocument } from '@calque/core'
import { localImageSources, mimeOf, toBase64 } from '../shared/image-data'
import { toSnakeCase } from '../shared/naming'
import type { Exporter, ExportOptions, ExportResult } from '../types'

export const FIGMA_BUNDLE_FORMAT = 'calque-figma'
export const FIGMA_BUNDLE_VERSION = 1

export type FigmaBundle = {
  format: typeof FIGMA_BUNDLE_FORMAT
  version: number
  projectName: string
  startScreenId: string | null
  document: CalqueDocument
  images: Record<string, { mime: string; data: string }>
}

export function buildFigmaBundle(doc: CalqueDocument, opts: ExportOptions): { bundle: FigmaBundle; warnings: string[] } {
  const warnings: string[] = []
  const images: FigmaBundle['images'] = {}
  for (const src of localImageSources(doc)) {
    const bytes = opts.loadImage?.(src) ?? null
    if (bytes === null) warnings.push(`image « ${src} » introuvable : elle ne sera pas dans le fichier Figma`)
    else images[src] = { mime: mimeOf(src), data: toBase64(bytes) }
  }
  const laidOut: CalqueDocument = { ...doc, pages: doc.pages.map((p) => layoutPage(p)) }
  const firstScreen = laidOut.pages.flatMap((p) => p.nodes).find((n) => n.type === 'frame' && n.device !== undefined)
  return {
    bundle: {
      format: FIGMA_BUNDLE_FORMAT,
      version: FIGMA_BUNDLE_VERSION,
      projectName: opts.projectName,
      startScreenId: opts.activeScreenId ?? firstScreen?.id ?? null,
      document: laidOut,
      images,
    },
    warnings,
  }
}

function exportFigma(doc: CalqueDocument, opts: ExportOptions): ExportResult {
  const { bundle, warnings } = buildFigmaBundle(doc, opts)
  const name = toSnakeCase(opts.projectName) || 'projet'
  return { files: [{ path: `${name}.figma.json`, contents: JSON.stringify(bundle) }], warnings }
}

export const figmaExporter: Exporter = { id: 'figma', label: 'Figma (plugin Import Calque)', maturity: 'complete', export: exportFigma }
