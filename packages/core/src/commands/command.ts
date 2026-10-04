// Interface Command et utilitaires partages par les fabriques de commandes
// (Tache 5). Une commande sait s'appliquer a un document (apply) et calculer
// sa propre commande inverse (invert). Regle centrale du cahier des charges :
// invert est toujours calcule a partir du document D'AVANT application (voir
// history.ts pour l'ordre exact d'appel entre invert et apply).
//
// Les commandes sont le SEUL chemin de mutation d'un MaquioDocument dans le
// projet : le canvas, l'inspecteur et les patchs de Claude Code passeront
// tous par les fabriques de edits.ts et par History.

import { nodeSchema } from '../model/schema'
import type { MaquioDocument, Node, Page } from '../model/types'
import { findNode, NodeNotFoundError, replaceNode } from '../tree/tree'

export interface Command {
  readonly label: string
  apply(doc: MaquioDocument): MaquioDocument
  invert(doc: MaquioDocument): Command
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
    super("Les noeuds sélectionnés n'ont pas tous le même parent")
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
    super('La sélection ne peut pas être vide')
    this.name = 'EmptySelectionError'
  }
}

// v2 (addendum navigation §3.2) : setLinkCommand refuse une cible qui n'est
// pas l'identifiant d'une frame de premier niveau de la MEME page portant
// `device` (donc un veritable ecran). Nommee et exportee pour que l'appelant
// (inspecteur, poignee de lien) puisse distinguer ce cas d'une cible
// techniquement introuvable ailleurs dans le document.
export class LinkTargetNotFoundError extends Error {
  constructor(target: string) {
    super(`Écran cible introuvable dans cette page : ${target}`)
    this.name = 'LinkTargetNotFoundError'
  }
}

// v2 (addendum navigation §3.2) : « un lien vers l'écran qui contient le
// nœud est refusé (il ne produirait rien de sensé) ». Distincte de
// LinkTargetNotFoundError : la cible EXISTE bel et bien, elle est juste
// invalide pour CE noeud precis.
export class LinkToContainingScreenError extends Error {
  constructor(target: string) {
    super(`Un nœud ne peut pas être lié à l'écran qui le contient : ${target}`)
    this.name = 'LinkToContainingScreenError'
  }
}

// Rend la page ciblee ou leve PageNotFoundError : centralise la verification
// que le cahier des charges exige de toutes les fabriques (point 12).
export function requirePage(doc: MaquioDocument, pageId: string): Page {
  const page = doc.pages.find((p) => p.id === pageId)
  if (page === undefined) throw new PageNotFoundError(pageId)
  return page
}

// Rend un nouveau document ou seule la page `pageId` a ete remplacee par le
// resultat de `updater` applique a ses noeuds. Les autres pages du document,
// ainsi que les branches non touchees de l'arbre (partage structurel de
// tree.ts), restent identiques par reference.
export function updatePageNodes(
  doc: MaquioDocument,
  pageId: string,
  updater: (nodes: Node[]) => Node[],
): MaquioDocument {
  requirePage(doc, pageId)
  return {
    ...doc,
    pages: doc.pages.map((p) => (p.id === pageId ? { ...p, nodes: updater(p.nodes) } : p)),
  }
}

// Chemin de mutation partage par toutes les fabriques qui modifient UN noeud
// existant en place (move, resize, update, setText) : trouve le noeud (sinon
// NodeNotFoundError), applique la transformation, puis revalide le noeud
// entier via nodeSchema avant de le reinjecter dans l'arbre via replaceNode
// (qui preserve le partage structurel des branches non touchees).
//
// nodeSchema (donc rectSchema, Tache 2) rejette deja une largeur/hauteur
// negative : c'est un invariant du MODELE, pas des commandes, car
// parseDocument (fichier .maquio malforme), createNodeCommand (recevant un
// Node deja invalide) et un futur patch de Claude Code contournent tous la
// couche commandes sans jamais contourner nodeSchema. Cette fonction n'a
// donc pas de verification dediee a ajouter : elle herite de la contrainte.
export function updateNodeIn(
  doc: MaquioDocument,
  pageId: string,
  nodeId: string,
  fn: (node: Node) => Node,
): MaquioDocument {
  return updatePageNodes(doc, pageId, (nodes) => {
    const node = findNode(nodes, nodeId)
    if (node === null) throw new NodeNotFoundError(nodeId)
    const updated = fn(node)
    const parsed = nodeSchema.parse(updated)
    return replaceNode(nodes, nodeId, parsed)
  })
}
