// Rendu DOM absolu d'un seul noeud (decision 5). Un NodeView par noeud
// VISIBLE de la page (les noeuds invisibles ne sont pas dans la liste
// aplatie que Canvas lui transmet, voir Canvas.tsx). Les noeuds verrouilles
// sont rendus mais recoivent `pointer-events: none` : un clic les traverse
// jusqu'a ce qu'il y a en dessous, ce qui reproduit sans code supplementaire
// la regle du modele "hitTest ignore les noeuds verrouilles et leurs
// descendants" (aucun de leurs descendants ne peut recevoir de clic non
// plus, puisqu'ils sont visuellement et logiquement a l'interieur).
import { useEffect, useRef } from 'react'
import type { CSSProperties, HTMLAttributes } from 'react'
import type { Color, ImageNode, Node as MaquioNode, Rect, Stroke, TextNode } from '@maquio/core'
import { useEditorStore } from '../state/editorStore'
import { resolvePreviewAbsoluteFrame, useNodeInteraction } from './useDragInteraction'
import { resolveImageSrc } from './imageSource'
import { ComponentContent } from './ComponentView'
import { inlineTextCommand, inlineTextOf, isInlineEditable } from './inlineText'
import { ContainerDecor, containerShadow } from './ContainerView'

type Props = {
  node: MaquioNode
  nodes: MaquioNode[]
}

export function colorToCss(c: Color): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`
}

function backgroundOf(node: MaquioNode): string | undefined {
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

// Trait d'un noeud : bordure interieure (les noeuds du canevas sont des
// elements freres a plat, une bordure ne decale donc aucun enfant).
function strokeOf(node: MaquioNode): Stroke | undefined {
  if ((node.type === 'frame' || node.type === 'rect' || node.type === 'ellipse') && node.strokes.length > 0) return node.strokes[0]
  return undefined
}

export function textCss(node: TextNode): CSSProperties {
  const st = node.style
  return {
    color: colorToCss(st.color),
    fontFamily: `'${st.fontFamily}', system-ui, sans-serif`,
    fontSize: st.fontSize,
    fontWeight: st.fontWeight,
    lineHeight: `${st.lineHeight}px`,
    letterSpacing: st.letterSpacing,
    textAlign: st.align,
    whiteSpace: 'pre-wrap',
    overflow: 'hidden',
  }
}

function LineContent({ node }: { node: Extract<MaquioNode, { type: 'line' }> }) {
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${node.frame.w} ${node.frame.h}`} preserveAspectRatio="none" style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <line x1={0} y1={0} x2={node.frame.w} y2={node.frame.h} stroke={colorToCss(node.stroke.color)} strokeWidth={node.stroke.width} />
    </svg>
  )
}

// Editeur en ligne (double-clic) : Entree valide, Maj+Entree saute une
// ligne, Echap annule, perdre le focus valide.
function InlineEditor({ node }: { node: MaquioNode }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  function finish(commit: boolean) {
    if (done.current) return
    done.current = true
    const state = useEditorStore.getState()
    if (commit) {
      const cmd = inlineTextCommand(state.pageId, node, ref.current?.value ?? '')
      if (cmd !== null) state.execute(cmd)
    }
    state.setEditingTextId(null)
  }

  const textStyle: CSSProperties = node.type === 'text' ? textCss(node) : { fontSize: 14, textAlign: 'center', color: 'inherit' }
  return (
    <textarea
      ref={ref}
      aria-label="Modifier le texte"
      data-testid="inline-text-editor"
      defaultValue={inlineTextOf(node)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(true)
        }
      }}
      style={{
        ...textStyle,
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        resize: 'none',
        border: '1px solid var(--maquio-accent, #e2714a)',
        outline: 'none',
        background: 'rgba(255,255,255,0.92)',
        color: node.type === 'text' ? colorToCss(node.style.color) : '#111',
        boxSizing: 'border-box',
        padding: 0,
        margin: 0,
        zIndex: 5,
      }}
    />
  )
}

// Rendu visuel d'un noeud (sans aucune interaction d'edition) : partage entre
// le canevas (NodeView) et le mode prototype (PrototypeView).
export function NodeVisual({
  node,
  abs,
  testId,
  editing = false,
  extraStyle,
  ...rest
}: {
  node: MaquioNode
  abs: Rect
  testId: string
  editing?: boolean
  extraStyle?: CSSProperties
} & Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'children'>) {
  const stroke = strokeOf(node)
  return (
    <div
      data-testid={testId}
      data-node-type={node.type === 'component' ? node.kind : node.type === 'frame' && node.container ? node.container.kind : node.type}
      {...rest}
      style={{
        position: 'absolute',
        left: abs.x,
        top: abs.y,
        width: abs.w,
        height: abs.h,
        transform: node.rotation !== 0 ? `rotate(${node.rotation}deg)` : undefined,
        opacity: node.opacity,
        background: backgroundOf(node),
        borderRadius: node.type === 'ellipse' ? '50%' : node.type === 'rect' || node.type === 'frame' ? node.cornerRadius : undefined,
        border: stroke !== undefined && stroke.width > 0 ? `${stroke.width}px solid ${colorToCss(stroke.color)}` : undefined,
        ...(node.type === 'text' ? textCss(node) : {}),
        boxShadow: node.type === 'frame' ? containerShadow(node) : undefined,
        boxSizing: 'border-box',
        userSelect: 'none',
        ...extraStyle,
      }}
    >
      {node.type === 'text' && !editing ? node.characters : null}
      {node.type === 'line' ? <LineContent node={node} /> : null}
      {editing ? <InlineEditor node={node} /> : null}
      {node.type === 'image' ? <ImageContent node={node} /> : null}
      {node.type === 'component' ? <ComponentContent node={node} /> : null}
      {node.type === 'frame' && node.container !== undefined ? <ContainerDecor node={node} /> : null}
    </div>
  )
}

export function NodeView({ node, nodes }: Props) {
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const onPointerDown = useNodeInteraction(node.id, { screenBodyIsMarquee: true })
  const abs: Rect = resolvePreviewAbsoluteFrame(nodes, node.id, dragPreview)
  const editing = useEditorStore((s) => s.editingTextId === node.id)

  return (
    <NodeVisual
      node={node}
      abs={abs}
      testId={`node-${node.id}`}
      editing={editing}
      onPointerDown={node.locked ? undefined : onPointerDown}
      onDoubleClick={
        node.locked || !isInlineEditable(node)
          ? undefined
          : (e) => {
              e.stopPropagation()
              useEditorStore.getState().setEditingTextId(node.id)
            }
      }
      extraStyle={{ pointerEvents: node.locked ? 'none' : 'auto' }}
    />
  )
}
