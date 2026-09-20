// Fabriques de commandes annulables (Tache 5).
//
// Chaque fabrique rend un Command dont `apply` transforme un CalqueDocument
// et dont `invert` calcule, a partir du document D'AVANT application, la
// commande qui annule cette transformation. Toutes s'appuient sur les
// mutations immuables de tree.ts (insertNode, removeNode, replaceNode,
// moveNode) qui preservent le partage structurel : on ne reconstruit jamais
// l'arbre entier a la main ici.

import { nodeSchema } from '../model/schema'
import type { CalqueDocument, DesignTokens, FrameNode, Layout, Node, Rect } from '../model/types'
import { translateRect, unionRects } from '../geometry/rect'
import {
  absoluteFrame,
  findNode,
  findParent,
  insertNode,
  moveNode,
  NodeNotFoundError,
  NotAFrameError,
  removeNode,
  replaceNode,
} from '../tree/tree'
import { InvalidPatchError, MixedParentsError, requirePage, updatePageNodes } from './command'
import type { Command } from './command'

// --- Helpers internes de manipulation de fratrie (partages par group/ungroup) ---

function getParentFrame(nodes: Node[], parentId: string): FrameNode {
  const parent = findNode(nodes, parentId)
  if (parent === null) throw new NodeNotFoundError(parentId)
  if (parent.type !== 'frame') throw new NotAFrameError(parentId)
  return parent
}

function getSiblings(nodes: Node[], parentId: string | null): Node[] {
  return parentId === null ? nodes : getParentFrame(nodes, parentId).children
}

function setSiblings(nodes: Node[], parentId: string | null, siblings: Node[]): Node[] {
  if (parentId === null) return siblings
  const parent = getParentFrame(nodes, parentId)
  return replaceNode(nodes, parentId, { ...parent, children: siblings })
}

// Origine absolue du parent (0,0 si racine de la page) : sert a convertir
// entre cadre absolu et cadre relatif a ce parent.
function originAbsolute(nodes: Node[], parentId: string | null): Rect {
  return parentId === null ? { x: 0, y: 0, w: 0, h: 0 } : absoluteFrame(nodes, parentId)
}

// Verifie que tous les identifiants existent et partagent le meme parent ;
// rend cet identifiant de parent (null pour le premier niveau de la page).
function commonParentId(nodes: Node[], nodeIds: string[]): string | null {
  const [firstId, ...restIds] = nodeIds
  if (firstId === undefined) throw new Error('groupCommand : la selection ne peut pas etre vide')
  if (findNode(nodes, firstId) === null) throw new NodeNotFoundError(firstId)
  const firstParent = findParent(nodes, firstId)
  const parentId = firstParent ? firstParent.id : null
  for (const id of restIds) {
    if (findNode(nodes, id) === null) throw new NodeNotFoundError(id)
    const parent = findParent(nodes, id)
    const pid = parent ? parent.id : null
    if (pid !== parentId) throw new MixedParentsError()
  }
  return parentId
}

// --- Creation / suppression ---

export function createNodeCommand(pageId: string, parentId: string | null, node: Node, index?: number): Command {
  return {
    label: 'Creer',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => insertNode(nodes, parentId, node, index))
    },
    invert(): Command {
      return deleteNodeCommand(pageId, node.id)
    },
  }
}

export function deleteNodeCommand(pageId: string, nodeId: string): Command {
  return {
    label: 'Supprimer',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => removeNode(nodes, nodeId))
    },
    // Capture le parent et l'index AVANT suppression pour restaurer le noeud
    // a sa position exacte dans la fratrie (point 11 du cahier des charges).
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const node = findNode(nodes, nodeId)
      if (node === null) throw new NodeNotFoundError(nodeId)
      const parent = findParent(nodes, nodeId)
      const parentId = parent ? parent.id : null
      const siblings = getSiblings(nodes, parentId)
      const index = siblings.findIndex((n) => n.id === nodeId)
      return createNodeCommand(pageId, parentId, node, index)
    },
  }
}

// --- Deplacement / redimensionnement / reparentage ---

// Deplacement RELATIF (dx, dy), pas un cadre final.
export function moveNodeCommand(pageId: string, nodeId: string, dx: number, dy: number): Command {
  return {
    label: 'Deplacer',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const node = findNode(nodes, nodeId)
        if (node === null) throw new NodeNotFoundError(nodeId)
        return replaceNode(nodes, nodeId, { ...node, frame: translateRect(node.frame, dx, dy) })
      })
    },
    invert(): Command {
      return moveNodeCommand(pageId, nodeId, -dx, -dy)
    },
  }
}

// Cadre FINAL absolu au sein du parent (pas un delta).
export function resizeNodeCommand(pageId: string, nodeId: string, frame: Rect): Command {
  return {
    label: 'Redimensionner',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const node = findNode(nodes, nodeId)
        if (node === null) throw new NodeNotFoundError(nodeId)
        return replaceNode(nodes, nodeId, { ...node, frame })
      })
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const node = findNode(nodes, nodeId)
      if (node === null) throw new NodeNotFoundError(nodeId)
      return resizeNodeCommand(pageId, nodeId, node.frame)
    },
  }
}

export function reparentNodeCommand(
  pageId: string,
  nodeId: string,
  newParentId: string | null,
  index: number,
): Command {
  return {
    label: 'Changer de parent',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => moveNode(nodes, nodeId, newParentId, index))
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      if (findNode(nodes, nodeId) === null) throw new NodeNotFoundError(nodeId)
      const parent = findParent(nodes, nodeId)
      const originalParentId = parent ? parent.id : null
      const siblings = getSiblings(nodes, originalParentId)
      const originalIndex = siblings.findIndex((n) => n.id === nodeId)
      return reparentNodeCommand(pageId, nodeId, originalParentId, originalIndex)
    },
  }
}

// --- Edition de contenu ---

// Le type du patch est volontairement Record<string, unknown> et non
// Partial<Node> : sur une union discriminee, Partial<Node> ne type rien
// d'utile (l'intersection des champs optionnels de toutes les variantes),
// et nodeSchema est de toute facon la source de verite du modele : c'est
// elle qui valide le noeud fusionne (decision 6 du cahier des charges).
export type NodePatch = Record<string, unknown>

export function updateNodeCommand(pageId: string, nodeId: string, patch: NodePatch): Command {
  return {
    label: 'Modifier',
    apply(doc: CalqueDocument): CalqueDocument {
      if ('id' in patch || 'type' in patch) {
        throw new InvalidPatchError("updateNodeCommand ne peut pas changer 'id' ou 'type'")
      }
      return updatePageNodes(doc, pageId, (nodes) => {
        const node = findNode(nodes, nodeId)
        if (node === null) throw new NodeNotFoundError(nodeId)
        const merged = { ...node, ...patch }
        const parsed = nodeSchema.parse(merged)
        return replaceNode(nodes, nodeId, parsed)
      })
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const node = findNode(nodes, nodeId)
      if (node === null) throw new NodeNotFoundError(nodeId)
      const nodeAsRecord = node as unknown as Record<string, unknown>
      const previousPatch: NodePatch = {}
      for (const key of Object.keys(patch)) {
        previousPatch[key] = nodeAsRecord[key]
      }
      return updateNodeCommand(pageId, nodeId, previousPatch)
    },
  }
}

export function setTextCommand(pageId: string, nodeId: string, characters: string): Command {
  return {
    label: 'Modifier le texte',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const node = findNode(nodes, nodeId)
        if (node === null) throw new NodeNotFoundError(nodeId)
        const merged = { ...node, characters }
        const parsed = nodeSchema.parse(merged)
        return replaceNode(nodes, nodeId, parsed)
      })
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const node = findNode(nodes, nodeId)
      if (node === null) throw new NodeNotFoundError(nodeId)
      const previous = node.type === 'text' ? node.characters : ''
      return setTextCommand(pageId, nodeId, previous)
    },
  }
}

// --- Groupement ---

export function groupCommand(pageId: string, nodeIds: string[]): Command {
  // Genere une seule fois pour que apply() et invert() (via ungroupCommand)
  // designent toujours la meme frame, y compris a travers plusieurs
  // executions (redo).
  const frameId = crypto.randomUUID()

  return {
    label: 'Grouper',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const parentId = commonParentId(nodes, nodeIds)
        const siblings = getSiblings(nodes, parentId)
        const selected = new Set(nodeIds)

        const indices = nodeIds.map((id) => siblings.findIndex((n) => n.id === id))
        const topmostIndex = Math.max(...indices)

        const unionAbs = unionRects(nodeIds.map((id) => absoluteFrame(nodes, id)))
        const parentOrigin = originAbsolute(nodes, parentId)
        const relativeFrame: Rect = {
          x: unionAbs.x - parentOrigin.x,
          y: unionAbs.y - parentOrigin.y,
          w: unionAbs.w,
          h: unionAbs.h,
        }

        // Enfants dans l'ordre d'origine de la fratrie, coordonnees
        // recalculees relatives a la nouvelle frame (et non plus a l'ancien
        // parent commun).
        const children: Node[] = siblings
          .filter((n) => selected.has(n.id))
          .map((n) => {
            const abs = absoluteFrame(nodes, n.id)
            return {
              ...n,
              frame: { x: abs.x - unionAbs.x, y: abs.y - unionAbs.y, w: n.frame.w, h: n.frame.h },
            }
          })

        const groupFrame: FrameNode = {
          id: frameId,
          name: 'Groupe',
          type: 'frame',
          frame: relativeFrame,
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          layout: {
            mode: 'absolute',
            gap: 0,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            alignMain: 'start',
            alignCross: 'start',
          },
          fills: [],
          strokes: [],
          cornerRadius: 0,
          clipsContent: false,
          children,
        }

        // La frame prend la place du noeud le plus haut dans l'ordre de
        // dessin parmi les selectionnes (decision 7).
        const remaining = siblings.filter((n) => !selected.has(n.id))
        const insertionIndex = siblings.slice(0, topmostIndex).filter((n) => !selected.has(n.id)).length
        const newSiblings = [...remaining.slice(0, insertionIndex), groupFrame, ...remaining.slice(insertionIndex)]

        return setSiblings(nodes, parentId, newSiblings)
      })
    },
    invert(): Command {
      return ungroupCommand(pageId, frameId)
    },
  }
}

export function ungroupCommand(pageId: string, frameId: string): Command {
  return {
    label: 'Degrouper',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const frameNode = findNode(nodes, frameId)
        if (frameNode === null) throw new NodeNotFoundError(frameId)
        if (frameNode.type !== 'frame') throw new NotAFrameError(frameId)

        const parent = findParent(nodes, frameId)
        const parentId = parent ? parent.id : null
        const siblings = getSiblings(nodes, parentId)
        const index = siblings.findIndex((n) => n.id === frameId)
        const parentOrigin = originAbsolute(nodes, parentId)

        const promoted = frameNode.children.map((child) => {
          const abs = absoluteFrame(nodes, child.id)
          return {
            ...child,
            frame: { x: abs.x - parentOrigin.x, y: abs.y - parentOrigin.y, w: child.frame.w, h: child.frame.h },
          }
        })

        const newSiblings = [...siblings.slice(0, index), ...promoted, ...siblings.slice(index + 1)]
        return setSiblings(nodes, parentId, newSiblings)
      })
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const frameSnapshot = findNode(nodes, frameId)
      if (frameSnapshot === null) throw new NodeNotFoundError(frameId)
      if (frameSnapshot.type !== 'frame') throw new NotAFrameError(frameId)

      const parent = findParent(nodes, frameId)
      const parentId = parent ? parent.id : null
      const siblings = getSiblings(nodes, parentId)
      const index = siblings.findIndex((n) => n.id === frameId)
      const childIds = frameSnapshot.children.map((c) => c.id)

      return {
        label: 'Grouper',
        apply(doc2: CalqueDocument): CalqueDocument {
          return updatePageNodes(doc2, pageId, (nodes2) => {
            const currentSiblings = getSiblings(nodes2, parentId)
            const childSet = new Set(childIds)
            const remaining = currentSiblings.filter((n) => !childSet.has(n.id))
            const newSiblings = [...remaining.slice(0, index), frameSnapshot, ...remaining.slice(index)]
            return setSiblings(nodes2, parentId, newSiblings)
          })
        },
        invert(): Command {
          return ungroupCommand(pageId, frameId)
        },
      }
    },
  }
}

// --- Disposition / tokens ---

// Ne recalcule PAS les positions des enfants : ce recalcul appartient a
// applyAutoLayout (tache 6, pas encore implementee).
export function setLayoutCommand(pageId: string, frameId: string, layout: Layout): Command {
  return {
    label: 'Modifier la disposition',
    apply(doc: CalqueDocument): CalqueDocument {
      return updatePageNodes(doc, pageId, (nodes) => {
        const node = findNode(nodes, frameId)
        if (node === null) throw new NodeNotFoundError(frameId)
        if (node.type !== 'frame') throw new NotAFrameError(frameId)
        return replaceNode(nodes, frameId, { ...node, layout })
      })
    },
    invert(doc: CalqueDocument): Command {
      const nodes = requirePage(doc, pageId).nodes
      const node = findNode(nodes, frameId)
      if (node === null) throw new NodeNotFoundError(frameId)
      if (node.type !== 'frame') throw new NotAFrameError(frameId)
      return setLayoutCommand(pageId, frameId, node.layout)
    },
  }
}

export function setTokensCommand(tokens: Partial<DesignTokens>): Command {
  return {
    label: 'Modifier les tokens',
    apply(doc: CalqueDocument): CalqueDocument {
      return { ...doc, tokens: { ...doc.tokens, ...tokens } }
    },
    invert(doc: CalqueDocument): Command {
      return setTokensCommand(doc.tokens)
    },
  }
}
