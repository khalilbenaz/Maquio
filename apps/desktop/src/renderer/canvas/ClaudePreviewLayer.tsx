// Dessin en direct d'une creation d'application : les ecrans que Claude est
// en train de dessiner, affiches sur le plan de travail (memes coordonnees
// de page que le document) en lecture seule. Ils ne font partie ni du
// document ni de l'historique : le resultat final est applique d'un seul
// geste par le panneau Claude, qui efface alors cet apercu.
import { absoluteFrame, inheritedOpacity } from '@maquio/core'
import type { Node } from '@maquio/core'
import { useEditorStore } from '../state/editorStore'
import { NodeVisual } from './NodeView'

function flatten(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    if (!n.visible) continue
    out.push(n)
    if (n.type === 'frame') out.push(...flatten(n.children))
  }
  return out
}

export function ClaudePreviewLayer() {
  const preview = useEditorStore((s) => s.claudePreview)
  const zoom = useEditorStore((s) => s.zoom)
  if (preview === null) return null
  const current = preview.screens.find((s) => s.id === preview.currentId)

  return (
    <>
      {flatten(preview.screens).map((n) => (
        <NodeVisual
          key={`apercu-${n.id}`}
          node={n}
          abs={absoluteFrame(preview.screens, n.id)}
          testId={`preview-node-${n.id}`}
          inherited={inheritedOpacity(preview.screens, n.id)}
          extraStyle={{ pointerEvents: 'none' }}
        />
      ))}
      {current !== undefined ? (
        <>
          <div
            className="maquio-claude-drawing-outline"
            style={{ left: current.frame.x, top: current.frame.y, width: current.frame.w, height: current.frame.h, borderWidth: 2 / zoom }}
          />
          <div className="maquio-claude-drawing-label" style={{ left: current.frame.x, top: current.frame.y, fontSize: 13 / zoom, transform: `translateY(-${28 / zoom}px)` }}>
            <span className="maquio-claude-drawing-dot" style={{ width: 8 / zoom, height: 8 / zoom }} />
            Claude dessine « {current.name} »…
          </div>
        </>
      ) : null}
    </>
  )
}
