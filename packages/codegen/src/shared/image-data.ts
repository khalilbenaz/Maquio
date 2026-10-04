// Images embarquees (SVG autonome, export Figma) : lecture injectee par
// l'application (le paquet ne touche jamais au disque), encodage base64 pur.
import type { MaquioDocument, Node } from '@maquio/core'
import { isLocalImageSrc } from './assets'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

export function mimeOf(src: string): string {
  const dot = src.lastIndexOf('.')
  return MIME[dot < 0 ? '' : src.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

// Sources d'images locales du document (noeuds image et avatars), sans doublon.
export function localImageSources(doc: MaquioDocument): string[] {
  const out = new Set<string>()
  const visit = (n: Node) => {
    if (n.type === 'image' && isLocalImageSrc(n.src)) out.add(n.src)
    if (n.type === 'component' && n.kind === 'avatar' && isLocalImageSrc(n.props.src)) out.add(n.props.src)
    if (n.type === 'frame') n.children.forEach(visit)
  }
  for (const p of doc.pages) p.nodes.forEach(visit)
  return [...out]
}

export function dataUri(src: string, loadImage: ((src: string) => Uint8Array | null) | undefined): string | null {
  const bytes = loadImage?.(src) ?? null
  return bytes === null ? null : `data:${mimeOf(src)};base64,${toBase64(bytes)}`
}
