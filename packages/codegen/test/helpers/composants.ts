// Fabriques de documents de test pour les exportateurs de composants : un
// composant ou conteneur du catalogue place dans un ecran, un document a
// plusieurs ecrans relies.
import { DEVICE_PRESETS, tapLink, PALETTE_ITEMS, createDocument, createScreenNode } from '@maquio/core'
import type { MaquioDocument, ComponentNode, FrameNode, Node, Rect } from '@maquio/core'

export function make(id: string, frame: Partial<Rect> = {}, props: Record<string, unknown> = {}, name?: string): Node {
  const entry = PALETTE_ITEMS.find((i) => i.id === id)
  if (entry === undefined) throw new Error(`entree de palette inconnue : ${id}`)
  const node = entry.build({ x: 0, y: 0, w: entry.size.w, h: entry.size.h, ...frame })
  const withProps = node.type === 'component' ? ({ ...node, props: { ...node.props, ...props } } as ComponentNode) : node
  return name === undefined ? withProps : { ...withProps, name }
}

export function linked(node: Node, target: string): Node {
  return { ...node, interactions: [tapLink(target)] }
}

export function parent(frame: FrameNode, children: Node[]): FrameNode {
  return { ...frame, children }
}

export function screen(name: string, children: Node[], x = 0): FrameNode {
  return createScreenNode(name, DEVICE_PRESETS.iphone15, { x, y: 0, w: 393, h: 852 }, children)
}

export function docOf(...screens: FrameNode[]): MaquioDocument {
  const doc = createDocument('Projet')
  return { ...doc, pages: [{ ...doc.pages[0]!, nodes: screens }] }
}

// Document a un seul ecran contenant `children`.
export function oneScreen(...children: Node[]): MaquioDocument {
  return docOf(screen('Accueil', children))
}

// Contenu du fichier d'ecran (le premier) d'un resultat d'export.
export function screenFile(files: { path: string; contents: string }[], match: RegExp = /screens\/|Screens\//): string {
  return files.find((f) => match.test(f.path))!.contents
}
