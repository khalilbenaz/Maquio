// Document minimal partage par les tests du canevas (Tache 15) : deux
// rectangles a des identifiants fixes, places de sorte a ne jamais se
// chevaucher (rect1 en haut-gauche, rect2 plus bas-a-droite), pour que les
// tests de selection par clic restent sans ambiguite.
import { createDocument } from '@calque/core'
import type { CalqueDocument, RectNode } from '@calque/core'

function rect(id: string, x: number, y: number, w = 50, h = 50): RectNode {
  return {
    id,
    name: id,
    type: 'rect',
    frame: { x, y, w, h },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
    cornerRadius: 0,
  }
}

export function documentDeTest(): CalqueDocument {
  const doc = createDocument('Document de test')
  const page = doc.pages[0]!
  return {
    ...doc,
    pages: [{ ...page, nodes: [rect('rect1', 0, 0), rect('rect2', 100, 100)] }],
  }
}
