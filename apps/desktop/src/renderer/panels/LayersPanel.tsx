// Panneau des calques (Tache 16, decision 1). Arbre repliable de la page
// courante, synchronise dans les deux sens avec la selection du magasin
// (decision 5) : cliquer une ligne selectionne le noeud (comme le canevas),
// et selectionner depuis le canevas (ou par programme) met a jour
// aria-selected ici. Les bascules de visibilite/verrou emettent
// updateNodeCommand SANS toucher a la selection (decision 7). Le
// glisser-depose emet reparentNodeCommand et refuse un depot dans son
// propre descendant (decision 6) : le coeur leverait CycleError si on le
// laissait faire, donc on detecte le cycle AVANT d'executer quoi que ce
// soit.
import { useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import { findParent, pathToNode, reparentNodeCommand, updateNodeCommand } from '@calque/core'
import type { FrameNode, Node as CalqueNode } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf } from '../canvas/useDragInteraction'
import './LayersPanel.css'

// Identifiant du calque actuellement glisse. Une simple variable de module
// suffit : la source et la cible du glisser-depose sont toujours dans le
// meme arbre React (pas de glisser-depose entre fenetres), donc pas besoin
// de passer par dataTransfer pour transporter l'information.
let draggedNodeId: string | null = null

function isSelfOrDescendant(nodes: CalqueNode[], ancestorCandidateId: string, id: string): boolean {
  if (ancestorCandidateId === id) return true
  return pathToNode(nodes, id).includes(ancestorCandidateId)
}

type RowProps = {
  node: CalqueNode
  depth: number
  nodes: CalqueNode[]
  pageId: string
  collapsed: Set<string>
  onToggleCollapse: (id: string) => void
}

function LayerRow({ node, depth, nodes, pageId, collapsed, onToggleCollapse }: RowProps) {
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const execute = useEditorStore((s) => s.execute)

  const selected = selection.includes(node.id)
  const hasChildren = node.type === 'frame' && node.children.length > 0
  const isCollapsed = collapsed.has(node.id)

  function handleSelect(e: MouseEvent) {
    e.stopPropagation()
    select([node.id])
  }

  function handleToggleVisibility(e: MouseEvent) {
    e.stopPropagation()
    execute(updateNodeCommand(pageId, node.id, { visible: !node.visible }))
  }

  function handleToggleLock(e: MouseEvent) {
    e.stopPropagation()
    execute(updateNodeCommand(pageId, node.id, { locked: !node.locked }))
  }

  function handleToggleCollapse(e: MouseEvent) {
    e.stopPropagation()
    onToggleCollapse(node.id)
  }

  function handleDragStart(e: DragEvent) {
    e.stopPropagation()
    // jsdom (environnement de test) n'implemente pas toujours DataTransfer :
    // on s'en passe de toute facon (voir le commentaire sur draggedNodeId
    // plus haut), donc cet appel reste facultatif et ne doit jamais lever.
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    draggedNodeId = node.id
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const sourceId = draggedNodeId
    draggedNodeId = null
    if (sourceId === null || sourceId === node.id) return
    // Refus du cycle (decision 6) : le coeur (moveNode) leverait CycleError
    // si on le laissait deplacer un noeud dans l'un de ses propres
    // descendants. On le detecte avant d'appeler quoi que ce soit, pour ne
    // jamais laisser cette exception atteindre l'utilisateur.
    if (isSelfOrDescendant(nodes, sourceId, node.id)) return

    if (node.type === 'frame') {
      execute(reparentNodeCommand(pageId, sourceId, node.id, node.children.length))
      return
    }

    const parent = findParent(nodes, node.id)
    const parentId = parent ? parent.id : null
    const siblings = parent ? parent.children : nodes
    const targetIndex = siblings.findIndex((n) => n.id === node.id)
    execute(reparentNodeCommand(pageId, sourceId, parentId, targetIndex + 1))
  }

  return (
    <li
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      data-testid={`layer-${node.id}`}
      className={selected ? 'layers-row layers-row-selected' : 'layers-row'}
      style={{ paddingLeft: depth * 16 }}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleSelect}
    >
      <span className="layers-row-main">
        {hasChildren ? (
          <button
            type="button"
            className="layers-toggle"
            data-testid={`layer-toggle-${node.id}`}
            aria-label={isCollapsed ? `Déplier ${node.name}` : `Replier ${node.name}`}
            onClick={handleToggleCollapse}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="layers-toggle-spacer" aria-hidden="true" />
        )}
        <span className="layers-row-name">{node.name}</span>
      </span>

      <span className="layers-row-actions">
        <button
          type="button"
          data-testid={`layer-visibility-${node.id}`}
          aria-label={node.visible ? `Masquer le calque ${node.name}` : `Afficher le calque ${node.name}`}
          aria-pressed={node.visible}
          className="layers-icon-button"
          onClick={handleToggleVisibility}
        >
          {node.visible ? '\u{1F441}' : '—'}
        </button>
        <button
          type="button"
          data-testid={`layer-lock-${node.id}`}
          aria-label={node.locked ? `Déverrouiller le calque ${node.name}` : `Verrouiller le calque ${node.name}`}
          aria-pressed={node.locked}
          className="layers-icon-button"
          onClick={handleToggleLock}
        >
          {node.locked ? '\u{1F512}' : '\u{1F513}'}
        </button>
      </span>

      {hasChildren && !isCollapsed ? (
        <ul role="group" className="layers-children">
          {(node as FrameNode).children.map((child) => (
            <LayerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              nodes={nodes}
              pageId={pageId}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function LayersPanel() {
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const nodes = pageNodesOf(document_, pageId)

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="layers-panel" aria-label="Calques">
      <h2 className="layers-title">Calques</h2>
      {nodes.length === 0 ? (
        // Etat vide (finition v1, maquette Empty.dc.html) : sans ce
        // message, une page sans noeud laissait le panneau simplement vide,
        // sans rien pour indiquer que c'est l'etat attendu (et non une
        // panne) ni pour orienter vers le premier geste a faire.
        <div className="layers-empty">
          <p>Aucun calque pour l&apos;instant.</p>
          <p>Les éléments que vous tracez apparaissent ici, du fond vers le dessus.</p>
        </div>
      ) : (
        <ul role="tree" className="layers-tree" aria-label="Arborescence des calques">
          {nodes.map((node) => (
            <LayerRow
              key={node.id}
              node={node}
              depth={0}
              nodes={nodes}
              pageId={pageId}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}
