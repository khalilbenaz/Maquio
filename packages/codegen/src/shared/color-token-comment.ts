// Commentaire de tracabilite `// nom` partage par SwiftUI et Compose
// (Tache 9, decision 9 du brief) : les deux cibles restent en apercu et
// emettent des couleurs litterales, mais annotent la ligne d'un
// commentaire quand la couleur correspond exactement a un token du
// document, pour rester lisible sans construire un vrai fichier de theme.
// Extrait ici plutot que duplique a l'identique dans swift-utils.ts et
// kotlin-utils.ts (round de correction 1, Important 2 du coordinateur) :
// `shared/preview-coverage.ts` existait deja pour cette meme raison
// (eviter que les deux cibles preview divergent sur un format partage).
import type { Color, DesignTokens } from '@calque/core'
import { findColorToken } from './tokens'

// `// nom` si la couleur correspond exactement a un token du document,
// chaine vide sinon. A ajouter par l'appelant en fin de ligne complete
// (jamais au milieu d'un appel), un commentaire Kotlin/Swift s'etendant
// jusqu'a la fin de la ligne physique.
export function colorTokenComment(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? ` // ${token}` : ''
}
