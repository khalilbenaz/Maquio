// Petits accesseurs partages par les quatre exportateurs (Flutter,
// React Native, SwiftUI, Compose) : la meme regle de "premier
// remplissage plein" / "premiere bordure" / "URL distante contre chemin
// relatif" doit s'appliquer identiquement aux quatre cibles pour un meme
// document — copier ces trois lignes dans chaque generateur est
// precisement le genre de derive que ce fichier existe pour empecher
// (round de correction 1, Important 1 du coordinateur).
import type { Color, Fill, Stroke } from '@calque/core'

// Premiere couleur de remplissage plein d'une liste de Fill (ignore les
// fills `type: 'none'`) : null si aucun remplissage plein n'est present.
export function firstSolidFillColor(fills: Fill[]): Color | null {
  const found = fills.find((f) => f.type === 'solid')
  return found && found.type === 'solid' ? found.color : null
}

// Premiere bordure d'une liste de Stroke (le modele n'en garde qu'une a
// l'usage aujourd'hui, mais le type autorise plusieurs entrees) : null si
// la liste est vide.
export function firstStroke(strokes: Stroke[]): Stroke | null {
  return strokes[0] ?? null
}

// Une source d'image est une URL distante (http/https) plutot qu'un
// chemin de ressource locale (relatif ou nom d'asset).
export function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//.test(src)
}

// Ecart connu fermé (voir le README, section « Écarts connus ») : un
// noeud image dont `src` est vide (systématique pour tout espace réservé
// `image` importé de Figma, ou tracé dans l'éditeur avant tout choix de
// fichier) ne doit plus jamais produire `Image.asset('')`, `require('')`
// ou `Image("")` EN SILENCE — chaque generateur doit avertir et n'émettre
// AUCUNE référence à la ressource vide pour ce noeud. Message partagé par
// les quatre exportateurs, au même titre que unsupportedNodeWarning /
// unsupportedPropertyWarning : seul l'id de l'exportateur et celui du
// noeud changent.
export function emptyImageSourceWarning(nodeId: string, exporterId: string): string {
  return `image ignoree (src vide) par l export ${exporterId} : aucun fichier n'a ete choisi pour ce noeud (noeud ${nodeId})`
}
