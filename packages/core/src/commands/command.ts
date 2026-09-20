// Interface Command et utilitaires partages par les fabriques de commandes
// (Tache 5). Une commande sait s'appliquer a un document (apply) et calculer
// sa propre commande inverse (invert). Regle centrale du cahier des charges :
// invert est toujours calcule a partir du document D'AVANT application (voir
// history.ts pour l'ordre exact d'appel entre invert et apply).
//
// Les commandes sont le SEUL chemin de mutation d'un CalqueDocument dans le
// projet : le canvas, l'inspecteur et les patchs de Claude Code passeront
// tous par les fabriques de edits.ts et par History.

import { nodeSchema } from '../model/schema'
import type { CalqueDocument, Node, Page } from '../model/types'
import { findNode, NodeNotFoundError, replaceNode } from '../tree/tree'

export interface Command {
  readonly label: string
  apply(doc: CalqueDocument): CalqueDocument
  invert(doc: CalqueDocument): Command
}

export class PageNotFoundError extends Error {
  constructor(id: string) {
    super(`Page introuvable : ${id}`)
    this.name = 'PageNotFoundError'
  }
}

// Refuse explicitement de changer id/type via updateNodeCommand, ou tout
// patch qui, une fois fusionne, echoue la validation de nodeSchema.
export class InvalidPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPatchError'
  }
}

// groupCommand refuse de grouper des noeuds qui n'ont pas le meme parent :
// c'est la seule semantique defendable sans inventer une regle de remontee
// d'arbre (cf. cahier des charges, decision 7).
export class MixedParentsError extends Error {
  constructor() {
    super("Les noeuds selectionnes n'ont pas tous le meme parent")
    this.name = 'MixedParentsError'
  }
}

// groupCommand refuse une selection vide, distinctement d'une selection a un
// seul noeud (legitime : grouper un element seul est une operation courante,
// l'interdire surprendrait). Nommee et exportee pour qu'un appelant - l'UI ou
// un patch de Claude Code - puisse distinguer ce cas par le type plutot que
// par un message d'erreur generique.
export class EmptySelectionError extends Error {
  constructor() {
    super('La selection ne peut pas etre vide')
    this.name = 'EmptySelectionError'
  }
}

// Rend la page ciblee ou leve PageNotFoundError : centralise la verification
// que le cahier des charges exige de toutes les fabriques (point 12).
export function requirePage(doc: CalqueDocument, pageId: string): Page {
  const page = doc.pages.find((p) => p.id === pageId)
  if (page === undefined) throw new PageNotFoundError(pageId)
  return page
}

// Rend un nouveau document ou seule la page `pageId` a ete remplacee par le
// resultat de `updater` applique a ses noeuds. Les autres pages du document,
// ainsi que les branches non touchees de l'arbre (partage structurel de
// tree.ts), restent identiques par reference.
export function updatePageNodes(
  doc: CalqueDocument,
  pageId: string,
  updater: (nodes: Node[]) => Node[],
): CalqueDocument {
  requirePage(doc, pageId)
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, nodes: updater(p.nodes) } : p)),
  }
}

// Chemin de mutation partage par toutes les fabriques qui modifient UN noeud
// existant en place (move, resize, update, setText) : trouve le noeud (sinon
// NodeNotFoundError), applique la transformation, refuse un cadre resultant a
// largeur ou hauteur negative, puis revalide le noeud entier via nodeSchema
// avant de le reinjecter dans l'arbre via replaceNode (qui preserve le
// partage structurel des branches non touchees).
//
// La verification de largeur/hauteur negative est ici et pas seulement dans
// nodeSchema car rectSchema (Tache 2) n'interdit pas les dimensions
// negatives : un Rect degenere doit neanmoins etre rejete a la frontiere des
// commandes, avant d'atteindre le fichier .calque ou les generateurs de code
// par plateforme, plutot que d'etre decouvert bien plus tard dans du code
// Flutter incorrect.
export function updateNodeIn(
  doc: CalqueDocument,
  pageId: string,
  nodeId: string,
  fn: (node: Node) => Node,
): CalqueDocument {
  return updatePageNodes(doc, pageId, (nodes) => {
    const node = findNode(nodes, nodeId)
    if (node === null) throw new NodeNotFoundError(nodeId)
    const updated = fn(node)
    if (updated.frame.w < 0 || updated.frame.h < 0) {
      throw new InvalidPatchError('Un cadre ne peut pas avoir une largeur ou une hauteur negative')
    }
    const parsed = nodeSchema.parse(updated)
    return replaceNode(nodes, nodeId, parsed)
  })
}
