// Placement d'un element de palette depose (ou ajoute par clic) sur le
// canevas : choisit le PARENT -- le conteneur le plus profond sous le point,
// jamais une feuille -- et le cadre RELATIF a ce parent. Fonction pure, testee
// sans rendu.
//
// Les composants de structure se collent a leur place naturelle plutot que
// de flotter sous le curseur : barre d'application en haut, barre de
// navigation basse en bas, FAB en bas a droite au-dessus d'une barre basse,
// tiroir a gauche, feuille basse en bas, boite de dialogue centree. C'est ce
// qui permet a l'export de reconnaitre un Scaffold sans que l'utilisateur ait
// a aligner quoi que ce soit au pixel.
import { absoluteFrame, findParent, hitTest, screenAtPoint } from '@maquio/core'
import type { FrameNode, Node, PaletteItem, Rect } from '@maquio/core'

export type Placement = { parentId: string | null; frame: Rect }

const MARGIN = 16

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

// Conteneur le plus profond sous le point : la frame touchee, ou le parent
// de la feuille touchee, ou a defaut l'ecran sous le point.
function containerAt(nodes: Node[], point: { x: number; y: number }): FrameNode | null {
  const hit = hitTest(nodes, point)
  if (hit !== null) {
    if (hit.type === 'frame') return hit
    const parent = findParent(nodes, hit.id)
    if (parent !== null) return parent
  }
  return screenAtPoint(nodes, point)
}

function childOfType(parent: FrameNode, kind: string): Node | undefined {
  return parent.children.find((c) => c.type === 'component' && c.kind === kind)
}

export function placePaletteItem(item: PaletteItem, point: { x: number; y: number }, nodes: Node[]): Placement {
  const container = containerAt(nodes, point)
  const origin = container === null ? { x: 0, y: 0 } : absoluteFrame(nodes, container.id)
  const parentW = container === null ? Number.POSITIVE_INFINITY : container.frame.w
  const parentH = container === null ? Number.POSITIVE_INFINITY : container.frame.h
  const bounded = container !== null

  const w = Math.min(item.size.w, parentW)
  const h = Math.min(item.size.h, parentH)

  // Les elements de structure ne se collent que directement dans un ECRAN
  // (frame de premier niveau portant `device`) : dans une carte ou une
  // colonne, ils se placent comme n'importe quel composant.
  const inScreen = container !== null && container.device !== undefined

  if (inScreen) {
    const bar = childOfType(container, 'appBar')
    const nav = childOfType(container, 'bottomNav')
    switch (item.id) {
      case 'appBar':
        return { parentId: container.id, frame: { x: 0, y: 0, w: parentW, h } }
      case 'bottomNav':
        return { parentId: container.id, frame: { x: 0, y: parentH - h, w: parentW, h } }
      case 'tabs':
        return { parentId: container.id, frame: { x: 0, y: bar ? bar.frame.y + bar.frame.h : 0, w: parentW, h } }
      case 'fab':
      case 'fab-extended': {
        const bottom = nav ? nav.frame.y : parentH
        return { parentId: container.id, frame: { x: parentW - w - MARGIN, y: bottom - h - MARGIN, w, h } }
      }
      case 'drawer':
        return { parentId: container.id, frame: { x: 0, y: 0, w, h: parentH } }
      case 'bottomSheet':
        return { parentId: container.id, frame: { x: 0, y: parentH - h, w: parentW, h } }
      case 'dialog':
        return { parentId: container.id, frame: { x: Math.round((parentW - w) / 2), y: Math.round((parentH - h) / 2), w, h } }
      case 'snackbar':
        return {
          parentId: container.id,
          frame: { x: Math.round((parentW - w) / 2), y: parentH - h - 24, w, h },
        }
      case 'safeArea':
        return { parentId: container.id, frame: { x: 0, y: 0, w: parentW, h: parentH } }
    }
  }

  // Cas general : centre sous le point (relatif au parent), borne a son cadre.
  const relX = Math.round(point.x - origin.x - w / 2)
  const relY = Math.round(point.y - origin.y - h / 2)
  const x = bounded ? clamp(relX, 0, Math.max(parentW - w, 0)) : relX
  const y = bounded ? clamp(relY, 0, Math.max(parentH - h, 0)) : relY
  return { parentId: container === null ? null : container.id, frame: { x, y, w, h } }
}
