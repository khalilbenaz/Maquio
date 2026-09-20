// Canevas d'edition (Tache 15). Rendu DOM absolu de la page courante, plus
// le calque SVG de superposition (SelectionOverlay). Le fond porte
// data-testid="canvas-background" (decision 5) et gere le clic-dans-le-vide
// (desselection) ainsi que le cliquer-glisser de creation (decision 11).
//
// Les raccourcis clavier (decision 7) sont geres ici, au niveau du document
// (window), pas sur un element focusable du canevas : Suppr/Retour arriere
// supprime la selection, Cmd/Ctrl+Z annule, Cmd/Ctrl+Maj+Z retablit, Echap
// desselectionne. Ils sont desactives quand le focus est dans un champ de
// saisie (input, textarea, contenteditable).
import { useEffect, useRef } from 'react'
import { compositeCommand, deleteNodeCommand, findNode } from '@calque/core'
import type { Node as CalqueNode } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { NodeView } from './NodeView'
import { SelectionOverlay } from './SelectionOverlay'
import { pageNodesOf, useCreateInteraction } from './useDragInteraction'

// Aplatit l'arbre en liste de dessin (du fond vers le dessus, profondeur
// d'abord) en excluant les noeuds invisibles ET tous leurs descendants --
// c'est le sens du titre du premier test du brief ("un element par noeud
// VISIBLE") : un noeud invisible ne recoit aucun element DOM.
function flattenVisible(nodes: CalqueNode[]): CalqueNode[] {
  const out: CalqueNode[] = []
  for (const n of nodes) {
    if (!n.visible) continue
    out.push(n)
    if (n.type === 'frame') out.push(...flattenVisible(n.children))
  }
  return out
}

function isTextInput(el: Element | null): boolean {
  if (el === null) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  return el instanceof HTMLElement && el.isContentEditable
}

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const zoom = useEditorStore((s) => s.zoom)
  const pan = useEditorStore((s) => s.pan)

  const onBackgroundPointerDown = useCreateInteraction(canvasRef)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(window.document.activeElement)) return

      const state = useEditorStore.getState()
      const isMod = e.metaKey || e.ctrlKey

      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection.length > 0) {
        e.preventDefault()
        const nodes = pageNodesOf(state.document, state.pageId)
        const idsToDelete = state.selection.filter((id) => findNode(nodes, id) !== null)
        // Round de correction 1 : une seule commande composite pour toute
        // la selection, pour qu'un seul "annuler" restaure tous les noeuds
        // supprimes -- l'utilisateur percoit "supprimer ma selection" comme
        // un geste unique, pas comme N suppressions independantes.
        if (idsToDelete.length > 0) {
          const commands = idsToDelete.map((id) => deleteNodeCommand(state.pageId, id))
          state.execute(compositeCommand('Supprimer la selection', commands))
        }
        state.select([])
        return
      }

      if (isMod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        state.redo()
        return
      }

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        state.undo()
        return
      }

      if (e.key === 'Escape') {
        state.select([])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const pageNodes = pageNodesOf(document_, pageId)
  const page = document_.pages.find((p) => p.id === pageId)
  const device = page?.device

  return (
    <div
      ref={canvasRef}
      className="calque-canvas"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div
        className="calque-canvas-world"
        style={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <div
          data-testid="canvas-background"
          onPointerDown={onBackgroundPointerDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: device?.width ?? 0,
            height: device?.height ?? 0,
            background: '#ffffff',
          }}
        />
        {flattenVisible(pageNodes).map((node) => (
          <NodeView key={node.id} node={node} nodes={pageNodes} />
        ))}
      </div>
      <SelectionOverlay />
    </div>
  )
}
