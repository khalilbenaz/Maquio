// Rendu DOM absolu d'un seul noeud (decision 5). Un NodeView par noeud
// VISIBLE de la page (les noeuds invisibles ne sont pas dans la liste
// aplatie que Canvas lui transmet, voir Canvas.tsx). Les noeuds verrouilles
// sont rendus mais recoivent `pointer-events: none` : un clic les traverse
// jusqu'a ce qu'il y a en dessous, ce qui reproduit sans code supplementaire
// la regle du modele "hitTest ignore les noeuds verrouilles et leurs
// descendants" (aucun de leurs descendants ne peut recevoir de clic non
// plus, puisqu'ils sont visuellement et logiquement a l'interieur).
import type { ImageNode, Node as CalqueNode, Rect } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { resolvePreviewAbsoluteFrame, useNodeInteraction } from './useDragInteraction'
import { resolveImageSrc } from './imageSource'

type Props = {
  node: CalqueNode
  nodes: CalqueNode[]
}

function colorToCss(c: { r: number; g: number; b: number; a: number }): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`
}

function backgroundOf(node: CalqueNode): string | undefined {
  if (node.type === 'frame' || node.type === 'rect' || node.type === 'ellipse') {
    const fill = node.fills.find((f) => f.type === 'solid')
    if (fill && fill.type === 'solid') return colorToCss(fill.color)
  }
  return undefined
}

// Défaut n3 (« comment mettre l'image ? ») : le canevas affichait
// jusqu'ici un cadre vide (`src` jamais lu du tout) quel que soit l'état
// du nœud -- ce composant est ce qui manquait pour que l'outil Image soit
// autre chose qu'un cadre creux. `resolveImageSrc` traduit le `src` du
// document (absolu, relatif aux ressources, ou vide) en une URL affichable
// ou `null` ; `null` couvre a la fois "aucune image choisie" (src vide) et
// "chemin relatif non résoluble sans documentPath" -- dans les deux cas un
// espace réservé remplace la <img>, jamais une image cassée.
function ImageContent({ node }: { node: ImageNode }) {
  const documentPath = useEditorStore((s) => s.documentPath)
  const resolved = resolveImageSrc(node.src, documentPath)

  if (resolved === null) {
    return (
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px dashed rgba(255, 255, 255, 0.2)',
          boxSizing: 'border-box',
          color: 'rgba(255, 255, 255, 0.35)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <circle cx="6" cy="6.5" r="1.1" />
          <path d="M2.6 11.5l3.2-3 2.4 2.2 2-1.8 3.2 2.9" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={resolved}
      alt=""
      draggable={false}
      style={{ width: '100%', height: '100%', objectFit: node.fit, pointerEvents: 'none' }}
    />
  )
}

export function NodeView({ node, nodes }: Props) {
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const onPointerDown = useNodeInteraction(node.id)
  const abs: Rect = resolvePreviewAbsoluteFrame(nodes, node.id, dragPreview)

  return (
    <div
      data-testid={`node-${node.id}`}
      onPointerDown={node.locked ? undefined : onPointerDown}
      style={{
        position: 'absolute',
        left: abs.x,
        top: abs.y,
        width: abs.w,
        height: abs.h,
        transform: node.rotation !== 0 ? `rotate(${node.rotation}deg)` : undefined,
        opacity: node.opacity,
        pointerEvents: node.locked ? 'none' : 'auto',
        background: backgroundOf(node),
        borderRadius: node.type === 'ellipse' ? '50%' : node.type === 'rect' || node.type === 'frame' ? node.cornerRadius : undefined,
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {node.type === 'text' ? node.characters : null}
      {node.type === 'image' ? <ImageContent node={node} /> : null}
    </div>
  )
}
