// Couverture d'apercu commune a SwiftUI et Compose (Tache 9, decision 4 du
// brief) : les deux exportateurs `preview` ne couvrent que cinq types de
// noeud (frame, text, rect, ellipse, image) et doivent produire le MEME
// message d'avertissement, au mot pres, pour tout type non couvert —
// seul l'id de l'exportateur change. Extrait ici pour que le format du
// message ne diverge jamais entre les deux generateurs.
export const PREVIEW_SUPPORTED_NODE_TYPES: ReadonlySet<string> = new Set([
  'frame',
  'text',
  'rect',
  'ellipse',
  'image',
])

// Format impose (brief Tache 9) : "<type> non pris en charge par l export
// <id> (apercu)".
export function unsupportedNodeWarning(nodeType: string, exporterId: string): string {
  return `${nodeType} non pris en charge par l export ${exporterId} (apercu)`
}
