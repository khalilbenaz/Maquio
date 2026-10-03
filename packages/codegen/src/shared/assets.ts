// Images locales : copiees dans le projet exporte et referencees par un
// chemin propre a chaque cible. Les exportateurs restent purs (aucun acces
// disque) : ils DECLARENT les fichiers a copier (`ExportResult.assets`,
// `source` = le `src` du document) et l'application de bureau les copie.
//
// Principe : le document est reecrit AVANT le rendu, chaque `src` local
// devenant la reference propre a la cible ; le rendu existant n'a ainsi
// qu'a emettre `Image.asset(src)` / `require(src)` / `Image(src)`.
import type { CalqueDocument, Node } from '@calque/core'
import { isRemoteUrl } from './node-helpers'
import type { ExportAsset } from '../types'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'] as const

export function isLocalImageSrc(src: string): boolean {
  return src !== '' && !isRemoteUrl(src)
}

function splitName(src: string): { stem: string; ext: string } {
  const base = src.split(/[\\/]/).pop() ?? src
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? { stem: base, ext: '' } : { stem: base.slice(0, dot), ext: base.slice(dot).toLowerCase() }
}

// Retire accents et caracteres hors [A-Za-z0-9_-].
function cleanStem(stem: string): string {
  const s = stem.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return s === '' ? 'image' : s
}

export type AssetTarget = {
  // Nom de fichier de l'asset a partir du radical nettoye (ex. snake_case pour Android).
  fileName: (stem: string, ext: string) => string
  // Chemin du fichier dans le projet exporte.
  path: (fileName: string) => string
  // Cle d'unicite (defaut : le nom de fichier en minuscules).
  uniqueKey?: (fileName: string) => string
  // Valeur ecrite dans `src` pour le rendu.
  reference: (fileName: string) => string
  // Fichiers annexes (Contents.json d'un imageset...).
  extra?: (fileName: string) => { path: string; contents: string }[]
}

export type AssetPlan = { doc: CalqueDocument; assets: ExportAsset[]; extraFiles: { path: string; contents: string }[]; warnings: string[] }

export function planAssets(doc: CalqueDocument, target: AssetTarget, supported?: readonly string[]): AssetPlan {
  const bySrc = new Map<string, string>()
  const used = new Set<string>()
  const assets: ExportAsset[] = []
  const extraFiles: { path: string; contents: string }[] = []
  const warnings: string[] = []

  function register(src: string): string {
    const known = bySrc.get(src)
    if (known !== undefined) return known
    const { stem, ext } = splitName(src)
    if (supported !== undefined && !supported.includes(ext)) {
      warnings.push(`image « ${src} » : format ${ext === '' ? 'inconnu' : ext} non pris en charge par cette cible, copiée telle quelle`)
    }
    const clean = cleanStem(stem)
    let fileName = target.fileName(clean, ext)
    const key = (f: string) => (target.uniqueKey ?? ((x: string) => x.toLowerCase()))(f)
    for (let n = 2; used.has(key(fileName)); n += 1) fileName = target.fileName(`${clean}_${n}`, ext)
    used.add(key(fileName))
    bySrc.set(src, target.reference(fileName))
    assets.push({ source: src, path: target.path(fileName) })
    extraFiles.push(...(target.extra?.(fileName) ?? []))
    return bySrc.get(src)!
  }

  function visit(node: Node): Node {
    if (node.type === 'image' && isLocalImageSrc(node.src)) return { ...node, src: register(node.src) }
    if (node.type === 'component' && node.kind === 'avatar' && isLocalImageSrc(node.props.src)) {
      return { ...node, props: { ...node.props, src: register(node.props.src) } }
    }
    if (node.type === 'frame') return { ...node, children: node.children.map(visit) }
    return node
  }

  const next: CalqueDocument = { ...doc, pages: doc.pages.map((p) => ({ ...p, nodes: p.nodes.map(visit) })) }
  return { doc: next, assets, extraFiles, warnings }
}
