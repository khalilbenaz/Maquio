// Selection par rectangle (marquee). Fonction pure : le canevas lui passe le
// rectangle trace (coordonnees de PAGE) et recoit les identifiants a
// selectionner.
//
// Regle : on retient les noeuds ordinaires (hors ecrans) visibles et
// deverrouilles dont le cadre ABSOLU coupe le rectangle ; les descendants
// d'un noeud retenu sont ecartes (le parent suffit, comme pour un
// deplacement). Si le rectangle ne coupe aucun noeud ordinaire, ce sont les
// ecrans coupes qui sont retenus -- tracer sur le fond d'une maquette vide
// selectionne donc l'ecran, jamais rien par surprise.
import type { Node, Rect } from '../model/types'
import { intersects } from '../geometry/rect'
import { absoluteFrame, isScreenNode } from './tree'

function collect(nodes: Node[], all: Node[], rect: Rect, out: string[], skipScreens: boolean): void {
  for (const n of nodes) {
    if (!n.visible || n.locked) continue
    const isScreen = isScreenNode(n)
    if (!(skipScreens && isScreen)) {
      if (!isScreen && intersects(absoluteFrame(all, n.id), rect)) {
        out.push(n.id)
        continue // le parent retenu couvre ses descendants
      }
    }
    if (n.type === 'frame') collect(n.children, all, rect, out, skipScreens)
  }
}

export function marqueeSelect(nodes: Node[], rect: Rect): string[] {
  if (rect.w <= 0 || rect.h <= 0) return []
  const found: string[] = []
  collect(nodes, nodes, rect, found, true)
  if (found.length > 0) return found
  return nodes
    .filter((n) => isScreenNode(n) && n.visible && !n.locked && intersects(n.frame, rect))
    .map((n) => n.id)
}
