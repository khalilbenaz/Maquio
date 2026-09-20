// Interface Command et utilitaires partages par les fabriques de commandes
// (Tache 5). Une commande sait s'appliquer a un document (apply) et calculer
// sa propre commande inverse (invert). Regle centrale du cahier des charges :
// invert est toujours calcule a partir du document D'AVANT application (voir
// history.ts pour l'ordre exact d'appel entre invert et apply).
//
// Les commandes sont le SEUL chemin de mutation d'un CalqueDocument dans le
// projet : le canvas, l'inspecteur et les patchs de Claude Code passeront
// tous par les fabriques de edits.ts et par History.

import type { CalqueDocument, Node, Page } from '../model/types'

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
