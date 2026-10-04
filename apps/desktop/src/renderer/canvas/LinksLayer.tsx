// Calque de connecteurs persistes (v2, addendum navigation §4) : dessine
// TOUS les liens du document courant, du centre du noeud source jusqu'au
// bord de l'ecran cible -- pas le geste en cours (la ligne ephemere de la
// poignee de lien vit dans SelectionOverlay.tsx, qui a acces au dragPreview
// 'link'). Affiche/masque par un bouton de la barre d'outils
// (linksVisible) et JAMAIS pendant un glissement quel qu'il soit
// (dragPreview !== null), pour ne pas encombrer le geste -- voir Canvas.tsx,
// qui ne rend ce composant que sous ces deux conditions.
import { absoluteFrame, isScreenNode } from '@maquio/core'
import type { Node as MaquioNode, Rect } from '@maquio/core'
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

type Connector = { key: string; testId: string; node: MaquioNode; target: string; label: string; first: boolean }

const TRIGGER_SHORT = { tap: 'clic', longPress: 'appui long', afterDelay: 'délai' } as const
const TRANSITION_SHORT = { none: 'sans transition', slide: 'glissement', push: 'poussée', fade: 'fondu', modal: 'modale' } as const

// Une fleche par interaction de navigation (declencheur + transition en legende).
function collectConnectors(nodes: MaquioNode[]): Connector[] {
  const result: Connector[] = []
  function visit(list: MaquioNode[]): void {
    for (const n of list) {
      let first = true
      ;(n.interactions ?? []).forEach((it, i) => {
        if (it.action.type !== 'navigate') return
        result.push({
          key: `${n.id}-${i}`,
          testId: first ? `link-connector-${n.id}` : `link-connector-${n.id}-${i}`,
          node: n,
          target: it.action.target,
          label: `${TRIGGER_SHORT[it.trigger.type]} · ${TRANSITION_SHORT[it.transition.type]}`,
          first,
        })
        first = false
      })
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
  const connectors = collectConnectors(nodes)

  return (
    <g data-testid="links-layer">
      {connectors.map((c) => {
        const target = screens.find((s) => s.id === c.target)
        if (target === undefined) return null

        const sourceAbs = absoluteFrame(nodes, c.node.id)
        const sourceCenter = { x: sourceAbs.x + sourceAbs.w / 2, y: sourceAbs.y + sourceAbs.h / 2 }
        const endPoint = nearestPointOnRect(target.frame, sourceCenter)
        const angle = Math.atan2(endPoint.y - sourceCenter.y, endPoint.x - sourceCenter.x)
        const s = 9 / zoom
        const head = [
          [endPoint.x, endPoint.y],
          [endPoint.x - s * Math.cos(angle - 0.4), endPoint.y - s * Math.sin(angle - 0.4)],
          [endPoint.x - s * Math.cos(angle + 0.4), endPoint.y - s * Math.sin(angle + 0.4)],
        ]
          .map((p) => p.join(','))
          .join(' ')

        return (
          <g key={c.key} data-testid={c.testId} data-trigger-label={c.label}>
            <line
              x1={sourceCenter.x}
              y1={sourceCenter.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke={ACCENT}
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            />
            <polygon points={head} fill={ACCENT} />
            <text x={(sourceCenter.x + endPoint.x) / 2} y={(sourceCenter.y + endPoint.y) / 2 - 4 / zoom} fontSize={11 / zoom} fill={ACCENT} textAnchor="middle">
              {c.label}
            </text>
          </g>
        )
      })}
    </g>
  )
}
