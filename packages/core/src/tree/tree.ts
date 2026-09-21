// Parcours et mutations immuables de l'arbre de noeuds (Tache 4).
//
// Toutes les mutations (insertNode, removeNode, replaceNode, moveNode)
// rendent un nouveau tableau de premier niveau et ne clonent que les
// noeuds situes sur le chemin de la modification : les branches non
// touchees restent identiques par reference (partage structurel), ce qui
// permettra a la tache 15 (canvas React) d'eviter les rendus inutiles.

import type { FrameNode, Node, Rect } from '../model/types'
import { containsPoint } from '../geometry/rect'

export class NodeNotFoundError extends Error {
  constructor(id: string) {
    super(`Nœud introuvable : ${id}`)
    this.name = 'NodeNotFoundError'
  }
}

export class NotAFrameError extends Error {
  constructor(id: string) {
    super(`Le nœud ${id} n'est pas une frame, il ne peut pas porter d'enfants`)
    this.name = 'NotAFrameError'
  }
}

export class CycleError extends Error {
  constructor(id: string, targetParentId: string) {
    super(`Déplacement invalide : ${targetParentId} est le nœud ${id} lui-même ou l'un de ses descendants`)
    this.name = 'CycleError'
  }
}

function isFrame(node: Node): node is FrameNode {
  return node.type === 'frame'
}

// v2 (addendum navigation §3.1) : vrai <=> `node` est une frame de premier
// niveau d'une page ET porte `device` -- c'est la definition meme d'un
// ecran. Exportee (partagee par les commandes de commands/edits.ts et par
// le renderer, qui filtre les ecrans du plan de travail sur ce meme
// predicat) pour qu'il n'existe qu'une seule definition de "qu'est-ce qu'un
// ecran" dans tout le projet. N'a de sens que sur un noeud DE PREMIER
// NIVEAU d'une page -- un appelant qui la teste sur un noeud imbrique
// obtiendra `true` si ce noeud imbrique porte lui-meme un `device` (rien ne
// l'interdit structurellement), mais un tel noeud n'est PAS un ecran au
// sens du modele (§3.1) : c'est aux appelants de ne l'invoquer que sur des
// noeuds de premier niveau.
export function isScreenNode(node: Node): node is FrameNode {
  return node.type === 'frame' && node.device !== undefined
}

// v2 (addendum navigation §3.2) : l'ecran (frame de premier niveau +
// `device`) qui contient `nodeId`, ou `nodeId` lui-meme s'il EST un ecran.
// `null` si `nodeId` est un noeud de premier niveau qui n'est pas un ecran
// (page de mise en page libre, aucun ecran englobant) ou introuvable.
// Partagee par setLinkCommand (commands/edits.ts) ET par le renderer (pour
// determiner l'ecran "actif" -- §4 de l'addendum -- a partir de la
// selection courante).
export function screenContaining(nodes: Node[], nodeId: string): string | null {
  const path = pathToNode(nodes, nodeId)
  const topId = path[0]
  if (topId === undefined) return null
  const top = findNode(nodes, topId)
  return top !== null && isScreenNode(top) ? top.id : null
}

// Correctif parentage (v2, addendum navigation) : l'ecran (au sens
// screenContaining ci-dessus) le plus profond dont le sous-arbre contient
// `point`, en reutilisant hitTest -- qui implemente deja la regle "le plus
// profond, et a profondeur egale le dernier dessine l'emporte" -- plutot que
// d'ecrire une seconde implementation de ce choix pour des ecrans qui se
// chevauchent ou s'imbriquent visuellement sur le plan de travail. `null` si
// aucun noeud de premier niveau ne contient le point (fond du plan de
// travail) OU si le noeud touche n'appartient a aucun ecran (noeud de
// premier niveau sans `device`, cas legitime, pas une erreur). Partagee par
// useCreateInteraction (ou tracer determine le parent d'un nouveau noeud) et
// useNodeInteraction (ou glisser determine l'ecran cible d'un reparentage),
// toutes deux dans apps/desktop.
export function screenAtPoint(nodes: Node[], point: { x: number; y: number }): FrameNode | null {
  const hit = hitTest(nodes, point)
  if (hit === null) return null
  const screenId = screenContaining(nodes, hit.id)
  if (screenId === null) return null
  const screen = findNode(nodes, screenId)
  return screen !== null && isScreenNode(screen) ? screen : null
}

export function findNode(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (isFrame(n)) {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

// Rend la liste des identifiants des ancetres du noeud vise, du plus
// externe au noeud lui-meme inclus. Tableau vide si le noeud est
// introuvable.
export function pathToNode(nodes: Node[], id: string): string[] {
  for (const n of nodes) {
    if (n.id === id) return [n.id]
    if (isFrame(n)) {
      const sub = pathToNode(n.children, id)
      if (sub.length > 0) return [n.id, ...sub]
    }
  }
  return []
}

export function findParent(nodes: Node[], id: string): FrameNode | null {
  const path = pathToNode(nodes, id)
  if (path.length <= 1) return null
  const parentId = path[path.length - 2]!
  const parent = findNode(nodes, parentId)
  return parent && isFrame(parent) ? parent : null
}

// Parcours en profondeur d'abord, dans l'ordre du tableau. `parent` vaut
// null pour les noeuds de premier niveau (racine de la page).
export function walk(
  nodes: Node[],
  fn: (n: Node, parent: FrameNode | null) => void,
  parent: FrameNode | null = null,
): void {
  for (const n of nodes) {
    fn(n, parent)
    if (isFrame(n)) walk(n.children, fn, n)
  }
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length
  return Math.max(0, Math.min(index, length))
}

function spliceInsert<T>(arr: T[], index: number, item: T): T[] {
  return [...arr.slice(0, index), item, ...arr.slice(index)]
}

// Reconstruit le chemin racine -> id en clonant uniquement les noeuds
// traverses ; les freres non concernes restent identiques par reference
// (le tableau lui-meme n'est reconstruit que si quelque chose a change).
function updateAlongPath(nodes: Node[], id: string, updater: (n: Node) => Node): Node[] {
  let changed = false
  const result = nodes.map((n) => {
    if (n.id === id) {
      changed = true
      return updater(n)
    }
    if (isFrame(n)) {
      const newChildren = updateAlongPath(n.children, id, updater)
      if (newChildren !== n.children) {
        changed = true
        return { ...n, children: newChildren }
      }
    }
    return n
  })
  return changed ? result : nodes
}

export function insertNode(nodes: Node[], parentId: string | null, node: Node, index?: number): Node[] {
  if (parentId === null) {
    return spliceInsert(nodes, clampIndex(index, nodes.length), node)
  }

  const parent = findNode(nodes, parentId)
  if (parent === null) throw new NodeNotFoundError(parentId)
  if (!isFrame(parent)) throw new NotAFrameError(parentId)

  return updateAlongPath(nodes, parentId, (n) => {
    const frameNode = n as FrameNode
    return {
      ...frameNode,
      children: spliceInsert(frameNode.children, clampIndex(index, frameNode.children.length), node),
    }
  })
}

function removeAt(nodes: Node[], id: string): { result: Node[]; removed: boolean } {
  const withoutTarget = nodes.filter((n) => n.id !== id)
  if (withoutTarget.length !== nodes.length) {
    return { result: withoutTarget, removed: true }
  }

  let removed = false
  const result = nodes.map((n) => {
    if (isFrame(n)) {
      const sub = removeAt(n.children, id)
      if (sub.removed) {
        removed = true
        return { ...n, children: sub.result }
      }
    }
    return n
  })
  return { result: removed ? result : nodes, removed }
}

export function removeNode(nodes: Node[], id: string): Node[] {
  const { result, removed } = removeAt(nodes, id)
  if (!removed) throw new NodeNotFoundError(id)
  return result
}

function replaceAt(nodes: Node[], id: string, next: Node): { result: Node[]; replaced: boolean } {
  let replacedHere = false
  const direct = nodes.map((n) => {
    if (n.id === id) {
      replacedHere = true
      return next
    }
    return n
  })
  if (replacedHere) return { result: direct, replaced: true }

  let replaced = false
  const result = nodes.map((n) => {
    if (isFrame(n)) {
      const sub = replaceAt(n.children, id, next)
      if (sub.replaced) {
        replaced = true
        return { ...n, children: sub.result }
      }
    }
    return n
  })
  return { result: replaced ? result : nodes, replaced }
}

export function replaceNode(nodes: Node[], id: string, next: Node): Node[] {
  const { result, replaced } = replaceAt(nodes, id, next)
  if (!replaced) throw new NodeNotFoundError(id)
  return result
}

export function moveNode(nodes: Node[], id: string, newParentId: string | null, index: number): Node[] {
  const moving = findNode(nodes, id)
  if (moving === null) throw new NodeNotFoundError(id)

  if (newParentId !== null) {
    const parentPath = pathToNode(nodes, newParentId)
    if (parentPath.length === 0) throw new NodeNotFoundError(newParentId)
    // Le nouveau parent est id lui-meme ou l'un de ses descendants : le
    // chemin racine -> newParentId contiendrait alors id. On verifie ce
    // point avant toute mutation, sur l'arbre d'origine.
    if (parentPath.includes(id)) throw new CycleError(id, newParentId)

    const newParent = findNode(nodes, newParentId)
    if (newParent === null || !isFrame(newParent)) throw new NotAFrameError(newParentId)
  }

  const withoutMoved = removeNode(nodes, id)
  return insertNode(withoutMoved, newParentId, moving, index)
}

// Cadre absolu : somme des origines des ancetres jusqu'a la racine de la
// page. La largeur/hauteur restent celles du noeud lui-meme.
export function absoluteFrame(nodes: Node[], id: string): Rect {
  const path = pathToNode(nodes, id)
  if (path.length === 0) throw new NodeNotFoundError(id)

  let x = 0
  let y = 0
  let current = nodes
  let target: Node | null = null

  for (const segmentId of path) {
    const found = current.find((n) => n.id === segmentId)
    if (found === undefined) throw new NodeNotFoundError(id)
    x += found.frame.x
    y += found.frame.y
    target = found
    current = isFrame(found) ? found.children : []
  }

  return { x, y, w: target!.frame.w, h: target!.frame.h }
}

// v2 (addendum navigation §4 : « la duplication d'un écran existant est
// disponible depuis le panneau des calques ») : clone structurel d'un
// noeud, avec un NOUVEL identifiant genere pour lui ET pour chacun de ses
// descendants (sinon deux noeuds distincts du document partageraient le
// meme id, ce que toutes les fabriques de commandes -- findNode, replaceNode,
// etc. -- supposent impossible). Tout le reste (frame, fills, link, device
// pour un ecran...) est repris tel quel : un `link` copie continue de
// pointer vers son ecran d'ORIGINE (toujours valide, ce n'est pas l'ecran
// clone lui-meme) ; c'est a l'appelant de repositionner le clone (meme
// frame.x/y qu'un noeud fraichement colle sur place serait deroutant pour
// un ecran, qui se superposerait exactement sur l'original).
export function cloneNodeWithNewIds(node: Node): Node {
  const cloned: Node = { ...node, id: crypto.randomUUID() }
  if (isFrame(cloned)) {
    return { ...cloned, children: cloned.children.map(cloneNodeWithNewIds) }
  }
  return cloned
}

// hitTest travaille en coordonnees de page (absolues) et descend en
// cumulant l'origine des ancetres au fil de la recursion, sans jamais
// appeler absoluteFrame par noeud (ce qui serait quadratique). Il ignore
// volontairement clipsContent en v1 : un enfant qui depasse de sa frame
// reste cliquable meme si son parent devrait le rogner visuellement a
// l'affichage (choix assume pour cette version, pas un oubli).
export function hitTest(nodes: Node[], point: { x: number; y: number }): Node | null {
  // `state` est une reference mutable unique (plutot qu'une variable `let`
  // reassignee depuis la fermeture `visit`) : TypeScript perd sinon le
  // suivi de type du meilleur candidat entre la fermeture et le `return`.
  const state: { best: { node: Node; depth: number; order: number } | null; order: number } = {
    best: null,
    order: 0,
  }

  function visit(list: Node[], originX: number, originY: number, depth: number): void {
    for (const n of list) {
      const currentOrder = state.order++

      // Un noeud invisible ou verrouille, ainsi que tous ses descendants,
      // sont exclus du test (on ne descend pas dans son sous-arbre).
      if (!n.visible || n.locked) continue

      const absX = originX + n.frame.x
      const absY = originY + n.frame.y

      if (containsPoint({ x: absX, y: absY, w: n.frame.w, h: n.frame.h }, point)) {
        const best = state.best
        if (best === null || depth > best.depth || (depth === best.depth && currentOrder > best.order)) {
          state.best = { node: n, depth, order: currentOrder }
        }
      }

      if (isFrame(n)) visit(n.children, absX, absY, depth + 1)
    }
  }

  visit(nodes, 0, 0, 0)
  return state.best === null ? null : state.best.node
}
