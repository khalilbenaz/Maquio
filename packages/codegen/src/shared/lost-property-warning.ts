// Avertissement partage par SwiftUI et Compose (Important 1 et 2 de la
// vague de correction finale) : la maturite `preview` (spec §7) borne la
// couverture aux TYPES de noeud (voir shared/preview-coverage.ts), pas aux
// proprietes -- une propriete existante mais non honoree par ces deux
// generateurs (opacity, rotation, alignCross: 'stretch', clipsContent) ne
// doit jamais disparaitre en silence. Meme format, au mot pres, que
// `unsupportedNodeWarning` : seuls le nom de la propriete et l'id du noeud
// changent.
export function unsupportedPropertyWarning(property: string, nodeId: string, exporterId: string): string {
  return `${property} non pris en charge par l export ${exporterId} (apercu) (noeud ${nodeId})`
}
