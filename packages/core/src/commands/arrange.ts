// Operations d'agencement : ordre des calques, alignement, distribution,
// duplication et collage. Chaque fabrique rend une commande annulable en UN
// geste (compositeCommand) construite sur les primitives existantes.
import type { Node, Rect } from '../model/types'
import { unionRects } from '../geometry/rect'
import { absoluteFrame, cloneNodeWithNewIds, findNode, findParent, isScreenNode, NodeNotFoundError } from '../tree/tree'
import { requirePage, updatePageNodes } from './command'
import type { Command } from './command'
import { compositeCommand, createNodeCommand, moveNodeCommand, reparentNodeCommand } from './edits'

// --- Ordre des calques (le dernier de la fratrie est dessine au-dessus) ---

export type ReorderDirection = 'front' | 'back' | 'forward' | 'backward'

function siblingsOf(nodes: Node[], id: string): { parentId: string | null; siblings: Node[] } {
  const parent = findParent(nodes, id)
  return { parentId: parent ? parent.id : null, siblings: parent ? parent.children : nodes }
}

export function reorderIndex(length: number, index: number, direction: ReorderDirection): number {
  switch (direction) {
    case 'front':
      return length - 1
    case 'back':
      return 0
    case 'forward':
      return Math.min(length - 1, index + 1)
    case 'backward':
      return Math.max(0, index - 1)
  }
}

export function reorderNodeCommand(pageId: string, nodeId: string, direction: ReorderDirection): Command {
  const labels: Record<ReorderDirection, string> = {
    front: 'Premier plan',
    back: 'Arrière-plan',
    forward: 'Avancer',
    backward: 'Reculer',
  }
  return {
    label: labels[direction],
    apply(doc) {
      const nodes = requirePage(doc, pageId).nodes
      if (findNode(nodes, nodeId) === null) throw new NodeNotFoundError(nodeId)
      const { parentId, siblings } = siblingsOf(nodes, nodeId)
      const index = siblings.findIndex((n) => n.id === nodeId)
      const target = reorderIndex(siblings.length, index, direction)
      if (target === index) return doc
      return reparentNodeCommand(pageId, nodeId, parentId, target).apply(doc)
    },
    invert(doc) {
      const nodes = requirePage(doc, pageId).nodes
      if (findNode(nodes, nodeId) === null) throw new NodeNotFoundError(nodeId)
      const { parentId, siblings } = siblingsOf(nodes, nodeId)
      const index = siblings.findIndex((n) => n.id === nodeId)
      return { ...reparentNodeCommand(pageId, nodeId, parentId, index), label: labels[direction] }
    },
  }
}

// --- Alignement et distribution ---

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

function bounds(nodes: Node[], ids: string[]): Rect[] {
  return ids.map((id) => {
    if (findNode(nodes, id) === null) throw new NodeNotFoundError(id)
    return absoluteFrame(nodes, id)
  })
}

// Un seul noeud : on l'aligne sur son parent (l'ecran, typiquement), comme
// dans Figma ; plusieurs : sur leur boite englobante.
function alignReference(nodes: Node[], ids: string[], rects: Rect[]): Rect | null {
  if (ids.length > 1) return unionRects(rects)
  const parent = findParent(nodes, ids[0]!)
  return parent ? absoluteFrame(nodes, parent.id) : null
}

export function alignNodesCommand(pageId: string, ids: string[], mode: AlignMode): Command {
  return {
    label: 'Aligner',
    apply(doc) {
      const nodes = requirePage(doc, pageId).nodes
      const rects = bounds(nodes, ids)
      const ref = alignReference(nodes, ids, rects)
      if (ref === null) return doc
      const moves = ids.map((id, i) => {
        const r = rects[i]!
        let dx = 0
        let dy = 0
        if (mode === 'left') dx = ref.x - r.x
        if (mode === 'right') dx = ref.x + ref.w - (r.x + r.w)
        if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (r.x + r.w / 2)
        if (mode === 'top') dy = ref.y - r.y
        if (mode === 'bottom') dy = ref.y + ref.h - (r.y + r.h)
        if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (r.y + r.h / 2)
        return moveNodeCommand(pageId, id, Math.round(dx), Math.round(dy))
      })
      return compositeCommand('Aligner', moves).apply(doc)
    },
    invert(doc) {
      return restoreFramesCommand(pageId, doc, ids, 'Aligner')
    },
  }
}

// Repartit les noeuds pour que les ECARTS entre eux soient egaux, en
// gardant les deux extremes en place. Moins de trois noeuds : rien a faire.
export function distributeNodesCommand(pageId: string, ids: string[], axis: DistributeAxis): Command {
  return {
    label: 'Distribuer',
    apply(doc) {
      if (ids.length < 3) return doc
      const nodes = requirePage(doc, pageId).nodes
      const rects = bounds(nodes, ids)
      const h = axis === 'horizontal'
      const pos = (r: Rect) => (h ? r.x : r.y)
      const size = (r: Rect) => (h ? r.w : r.h)
      const order = ids.map((id, i) => ({ id, r: rects[i]! })).sort((a, b) => pos(a.r) - pos(b.r))
      const first = order[0]!.r
      const last = order[order.length - 1]!.r
      const total = pos(last) + size(last) - pos(first)
      const gap = (total - order.reduce((s, o) => s + size(o.r), 0)) / (order.length - 1)
      let cursor = pos(first) + size(first) + gap
      const moves: Command[] = []
      for (const o of order.slice(1, -1)) {
        const d = Math.round(cursor - pos(o.r))
        if (d !== 0) moves.push(moveNodeCommand(pageId, o.id, h ? d : 0, h ? 0 : d))
        cursor += size(o.r) + gap
      }
      return moves.length === 0 ? doc : compositeCommand('Distribuer', moves).apply(doc)
    },
    invert(doc) {
      return restoreFramesCommand(pageId, doc, ids, 'Distribuer')
    },
  }
}

// Remet les cadres relatifs d'avant (inversion exacte de align/distribute).
function restoreFramesCommand(pageId: string, doc: Parameters<Command['apply']>[0], ids: string[], label: string): Command {
  const nodes = requirePage(doc, pageId).nodes
  const saved = ids.map((id) => {
    const n = findNode(nodes, id)
    if (n === null) throw new NodeNotFoundError(id)
    return { id, frame: n.frame }
  })
  return {
    label,
    apply(d) {
      return updatePageNodes(d, pageId, (ns) => {
        let out = ns
        for (const s of saved) {
          out = replaceFrame(out, s.id, s.frame)
        }
        return out
      })
    },
    invert(d) {
      return restoreFramesCommand(pageId, d, ids, label)
    },
  }
}

function replaceFrame(nodes: Node[], id: string, frame: Rect): Node[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, frame }
    if (n.type === 'frame') {
      const children = replaceFrame(n.children, id, frame)
      return children === n.children ? n : { ...n, children }
    }
    return n
  })
}

// --- Duplication / collage ---

export const PASTE_OFFSET = 16
export const SCREEN_GAP = 40

// Clone `nodes` (nouveaux identifiants, y compris les descendants) sous
// `parentId` (null = premier niveau), decales de `offset` ; un ecran est
// pose a droite de l'ensemble des ecrans, jamais sur l'original. Rend la
// commande et les identifiants crees (pour les selectionner).
export function pasteNodesCommand(
  pageId: string,
  parentId: string | null,
  nodes: Node[],
  offset: number,
  pageNodes: Node[],
): { command: Command; newIds: string[] } {
  const newIds: string[] = []
  const commands: Command[] = []
  const screens = pageNodes.filter(isScreenNode)
  let nextScreenX = screens.length === 0 ? 0 : Math.max(...screens.map((s) => s.frame.x + s.frame.w)) + SCREEN_GAP
  for (const node of nodes) {
    const clone = cloneNodeWithNewIds(node)
    if (isScreenNode(clone) && parentId === null) {
      commands.push(createNodeCommand(pageId, null, { ...clone, name: `${clone.name} copie`, frame: { ...clone.frame, x: nextScreenX } }))
      nextScreenX += clone.frame.w + SCREEN_GAP
    } else {
      commands.push(createNodeCommand(pageId, parentId, { ...clone, frame: { ...clone.frame, x: clone.frame.x + offset, y: clone.frame.y + offset } }))
    }
    newIds.push(clone.id)
  }
  return { command: compositeCommand(nodes.length > 1 ? 'Coller la sélection' : 'Coller', commands), newIds }
}

// Duplique les noeuds (chacun dans son propre parent), decalage standard.
export function duplicateNodesCommand(pageId: string, ids: string[], pageNodes: Node[]): { command: Command; newIds: string[] } {
  const commands: Command[] = []
  const newIds: string[] = []
  for (const id of ids) {
    const node = findNode(pageNodes, id)
    if (node === null) throw new NodeNotFoundError(id)
    const parent = findParent(pageNodes, id)
    const r = pasteNodesCommand(pageId, parent ? parent.id : null, [node], PASTE_OFFSET, pageNodes)
    commands.push(r.command)
    newIds.push(...r.newIds)
  }
  return { command: compositeCommand(ids.length > 1 ? 'Dupliquer la sélection' : 'Dupliquer', commands), newIds }
}
