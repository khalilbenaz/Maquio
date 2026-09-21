// Calque de connecteurs persistes (v2, addendum navigation §4) : dessine
// TOUS les liens du document courant, du centre du noeud source jusqu'au
// bord de l'ecran cible -- pas le geste en cours (la ligne ephemere de la
// poignee de lien vit dans SelectionOverlay.tsx, qui a acces au dragPreview
// 'link'). Affiche/masque par un bouton de la barre d'outils
// (linksVisible) et JAMAIS pendant un glissement quel qu'il soit
// (dragPreview !== null), pour ne pas encombrer le geste -- voir Canvas.tsx,
// qui ne rend ce composant que sous ces deux conditions.
import { absoluteFrame, isScreenNode } from '@calque/core'
import type { Node as CalqueNode, Rect } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf } from './useDragInteraction'

const ACCENT = '#e2714a'

// Le point du perimetre de `rect` le plus proche de `point` -- une bonne
// approximation de "vers le bord de l'ecran cible" sans avoir a calculer
// une vraie intersection segment/rectangle : le noeud source d'un lien
// n'est jamais A L'INTERIEUR de l'ecran cible (ce serait un lien vers
// l'ecran qui le contient, refuse par le modele), donc ce point tombe
// toujours exactement sur le bord, jamais a l'interieur.
function nearestPointOnRect(rect: Rect, point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(rect.x, Math.min(point.x, rect.x + rect.w)),
    y: Math.max(rect.y, Math.min(point.y, rect.y + rect.h)),
  }
}

function collectLinkedNodes(nodes: CalqueNode[]): CalqueNode[] {
  const result: CalqueNode[] = []
  function visit(list: CalqueNode[]): void {
    for (const n of list) {
      if (n.link !== undefined) result.push(n)
      if (n.type === 'frame') visit(n.children)
    }
  }
  visit(nodes)
  return result
}

export function LinksLayer() {
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const zoom = useEditorStore((s) => s.zoom)

  const nodes = pageNodesOf(document_, pageId)
  const screens = nodes.filter(isScreenNode)
  const linkedNodes = collectLinkedNodes(nodes)

  return (
    <g data-testid="links-layer">
      {linkedNodes.map((node) => {
        const target = screens.find((s) => s.id === node.link!.target)
        if (target === undefined) return null

        const sourceAbs = absoluteFrame(nodes, node.id)
        const sourceCenter = { x: sourceAbs.x + sourceAbs.w / 2, y: sourceAbs.y + sourceAbs.h / 2 }
        const endPoint = nearestPointOnRect(target.frame, sourceCenter)

        return (
          <g key={node.id} data-testid={`link-connector-${node.id}`}>
            <line
              x1={sourceCenter.x}
              y1={sourceCenter.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={ACCENT}
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            />
            <circle cx={endPoint.x} cy={endPoint.y} r={3 / zoom} fill={ACCENT} />
          </g>
        )
      })}
    </g>
  )
}
