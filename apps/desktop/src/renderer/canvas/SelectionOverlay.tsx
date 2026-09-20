// Calque SVG de superposition (decision 5) : cadre de selection, huit
// poignees, et l'aperçu de creation en cours. N'affiche les poignees que
// pour une selection d'UN SEUL noeud (decision 8) ; sur plusieurs noeuds,
// seul le cadre englobant (union des cadres absolus) est affiche.
import { findNode, handleRects, unionRects } from '@calque/core'
import type { HandleId, Rect } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf, resolvePreviewAbsoluteFrame, useResizeInteraction } from './useDragInteraction'

const HANDLE_SIZE = 8

function Handle({ id, rect, nodeId }: { id: HandleId; rect: Rect; nodeId: string }) {
  const onPointerDown = useResizeInteraction(nodeId, id)
  return (
    <rect
      data-testid={`handle-${id}`}
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      className="calque-handle"
      style={{ pointerEvents: 'auto', cursor: `${id}-resize` }}
      onPointerDown={onPointerDown}
    />
  )
}

export function SelectionOverlay() {
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const zoom = useEditorStore((s) => s.zoom)
  const pan = useEditorStore((s) => s.pan)

  const nodes = pageNodesOf(document, pageId)
  const selectedFrames = selection
    .map((id) => (findNode(nodes, id) !== null ? resolvePreviewAbsoluteFrame(nodes, id, dragPreview) : null))
    .filter((r): r is Rect => r !== null)

  const bounding = selectedFrames.length === 0 ? null : selectedFrames.length === 1 ? selectedFrames[0]! : unionRects(selectedFrames)

  return (
    <svg
      className="calque-selection-overlay"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
    >
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {bounding !== null ? (
          <rect
            x={bounding.x}
            y={bounding.y}
            width={bounding.w}
            height={bounding.h}
            className="calque-selection-frame"
            fill="none"
            stroke="#2b6fff"
            strokeWidth={1 / zoom}
          />
        ) : null}

        {bounding !== null && selection.length === 1
          ? Object.entries(handleRects(bounding, HANDLE_SIZE / zoom)).map(([id, rect]) => (
              <Handle key={id} id={id as HandleId} rect={rect} nodeId={selection[0]!} />
            ))
          : null}

        {dragPreview !== null && dragPreview.kind === 'move'
          ? dragPreview.guides.x.map((gx) => (
              <line key={`gx-${gx}`} x1={gx} y1={-10000} x2={gx} y2={10000} stroke="#ff2b6f" strokeWidth={1 / zoom} />
            ))
          : null}
        {dragPreview !== null && dragPreview.kind === 'move'
          ? dragPreview.guides.y.map((gy) => (
              <line key={`gy-${gy}`} x1={-10000} y1={gy} x2={10000} y2={gy} stroke="#ff2b6f" strokeWidth={1 / zoom} />
            ))
          : null}

        {dragPreview !== null && dragPreview.kind === 'create' ? (
          <rect
            x={dragPreview.frame.x}
            y={dragPreview.frame.y}
            width={dragPreview.frame.w}
            height={dragPreview.frame.h}
            fill="rgba(43, 111, 255, 0.15)"
            stroke="#2b6fff"
            strokeDasharray="4 2"
            strokeWidth={1 / zoom}
          />
        ) : null}
      </g>
    </svg>
  )
}
