// Actions d'edition de la selection (dupliquer, copier/coller, grouper,
// ordre, alignement, suppression, nudge) : un seul endroit appele par les
// raccourcis clavier ET par les boutons de l'inspecteur, pour que les deux
// chemins fassent exactement la meme chose.
import {
  alignNodesCommand,
  compositeCommand,
  deleteNodeCommand,
  distributeNodesCommand,
  duplicateNodesCommand,
  findNode,
  findParent,
  groupCommand,
  isScreenNode,
  moveNodeCommand,
  pasteNodesCommand,
  reorderNodeCommand,
  screenContaining,
  ungroupCommand,
} from '@calque/core'
import type { AlignMode, DistributeAxis, FrameNode, Node, ReorderDirection } from '@calque/core'
import { useEditorStore } from './editorStore'
import { outermostSelection, pageNodesOf } from '../canvas/useDragInteraction'

// Presse-papiers interne (le contenu est un instantane d'arbre : il survit a
// la suppression de l'original).
let clipboard: { nodes: Node[]; parentId: string | null; pastes: number } | null = null

export function clipboardIsEmpty(): boolean {
  return clipboard === null
}

function ctx() {
  const s = useEditorStore.getState()
  const nodes = pageNodesOf(s.document, s.pageId)
  const ids = outermostSelection(nodes, s.selection).filter((id) => findNode(nodes, id) !== null)
  return { s, nodes, ids }
}

export function deleteSelection(): void {
  const { s, ids } = ctx()
  if (ids.length === 0) return
  s.execute(compositeCommand('Supprimer la sélection', ids.map((id) => deleteNodeCommand(s.pageId, id))))
  s.select([])
}

export function duplicateSelection(): void {
  const { s, nodes, ids } = ctx()
  if (ids.length === 0) return
  const { command, newIds } = duplicateNodesCommand(s.pageId, ids, nodes)
  s.execute(command)
  s.select(newIds)
}

export function copySelection(): boolean {
  const { nodes, ids } = ctx()
  if (ids.length === 0) return false
  const first = findParent(nodes, ids[0]!)
  clipboard = {
    nodes: ids.map((id) => structuredClone(findNode(nodes, id)!)),
    parentId: first ? first.id : null,
    pastes: 0,
  }
  return true
}

export function cutSelection(): boolean {
  if (!copySelection()) return false
  deleteSelection()
  return true
}

// Colle dans l'ecran actif (ou le parent d'origine s'il existe encore),
// avec un decalage croissant a chaque collage successif.
export function pasteClipboard(): void {
  if (clipboard === null) return
  const s = useEditorStore.getState()
  const nodes = pageNodesOf(s.document, s.pageId)
  clipboard.pastes += 1
  const hasScreen = clipboard.nodes.some((n) => isScreenNode(n))
  let parentId: string | null = null
  if (!hasScreen) {
    const original = clipboard.parentId !== null && findNode(nodes, clipboard.parentId) !== null ? clipboard.parentId : null
    const active = s.activeScreenId !== null && findNode(nodes, s.activeScreenId) !== null ? s.activeScreenId : null
    // Une selection courante dans un autre ecran gagne : on colle ou l'on travaille.
    const sel = s.selection[0]
    const selScreen = sel !== undefined ? screenContaining(nodes, sel) : null
    parentId = selScreen ?? original ?? active
  }
  const sameParent = parentId === clipboard.parentId
  const offset = sameParent ? 16 * clipboard.pastes : 0
  const { command, newIds } = pasteNodesCommand(s.pageId, parentId, clipboard.nodes, offset, nodes)
  s.execute(command)
  s.select(newIds)
}

export function groupSelection(): void {
  const { s, nodes, ids } = ctx()
  const candidates = ids.filter((id) => !isScreenNode(findNode(nodes, id)!))
  if (candidates.length < 2) return
  const parents = new Set(candidates.map((id) => findParent(nodes, id)?.id ?? null))
  if (parents.size !== 1) return // la commande exige un parent commun
  const cmd = groupCommand(s.pageId, candidates)
  s.execute(cmd)
  const after = pageNodesOf(useEditorStore.getState().document, s.pageId)
  const first = findNode(after, candidates[0]!)
  const group = first ? findParent(after, first.id) : null
  if (group) s.select([group.id])
}

export function ungroupSelection(): void {
  const { s, nodes, ids } = ctx()
  if (ids.length !== 1) return
  const node = findNode(nodes, ids[0]!)
  if (node === null || !isPlainGroup(node)) return
  const childIds = node.children.map((c) => c.id)
  s.execute(ungroupCommand(s.pageId, node.id))
  s.select(childIds)
}

export function canGroup(): boolean {
  const { nodes, ids } = ctx()
  if (ids.length < 2) return false
  const ns = ids.map((id) => findNode(nodes, id)!)
  if (ns.some((n) => isScreenNode(n))) return false
  return new Set(ids.map((id) => findParent(nodes, id)?.id ?? null)).size === 1
}

export function canUngroup(): boolean {
  const { nodes, ids } = ctx()
  if (ids.length !== 1) return false
  const n = findNode(nodes, ids[0]!)
  return n !== null && isPlainGroup(n)
}

// Frame ordinaire (ni ecran, ni conteneur semantique) : ce que « Dégrouper » sait defaire.
function isPlainGroup(n: Node): n is FrameNode {
  return n.type === 'frame' && n.device === undefined && n.container === undefined
}

export function reorderSelection(direction: ReorderDirection): void {
  const { s, ids } = ctx()
  if (ids.length === 0) return
  // Plusieurs noeuds : on traite dans l'ordre qui preserve leur ordre relatif.
  const ordered = direction === 'front' || direction === 'forward' ? [...ids].reverse() : ids
  s.execute(compositeCommand(reorderLabel(direction), ordered.map((id) => reorderNodeCommand(s.pageId, id, direction))))
}

function reorderLabel(d: ReorderDirection): string {
  return { front: 'Premier plan', back: 'Arrière-plan', forward: 'Avancer', backward: 'Reculer' }[d]
}

export function alignSelection(mode: AlignMode): void {
  const { s, ids } = ctx()
  if (ids.length === 0) return
  s.execute(alignNodesCommand(s.pageId, ids, mode))
}

export function distributeSelection(axis: DistributeAxis): void {
  const { s, ids } = ctx()
  if (ids.length < 3) return
  s.execute(distributeNodesCommand(s.pageId, ids, axis))
}

export function nudgeSelection(dx: number, dy: number): void {
  const { s, ids } = ctx()
  if (ids.length === 0) return
  s.execute(compositeCommand('Déplacer la sélection', ids.map((id) => moveNodeCommand(s.pageId, id, dx, dy))))
}
