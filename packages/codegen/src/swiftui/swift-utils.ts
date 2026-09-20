// Utilitaires de generation SwiftUI (Tache 9). SwiftUI et Compose sont en
// apercu (decision 9 du brief) : les couleurs restent des litteraux (pas
// de constante de theme genere), mais on ajoute un commentaire `// nom` en
// fin de ligne quand la couleur correspond exactement a un token du
// document, pour rester lisible et tracable jusqu'au design system sans
// avoir a generer un vrai fichier de theme SwiftUI.
import type { Color, DesignTokens } from '@calque/core'
import { findColorToken } from '../shared/tokens'

// Echappe une chaine pour l'inserer dans un litteral Swift entoure de
// guillemets doubles (decision 7 du brief) : antislash et guillemet
// double d'abord, puis `\(...)` (interpolation Swift, declenchee par un
// antislash suivi d'une parenthese — deja neutralisee par l'echappement de
// l'antislash) et enfin le saut de ligne. Le guillemet simple et `$` n'ont
// aucun sens special en Swift et n'ont donc pas besoin d'echappement.
export function escapeSwiftString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
}

export function swiftString(value: string): string {
  return `"${escapeSwiftString(value)}"`
}

function fixed4(value: number): string {
  return value.toFixed(4)
}

// Color(red:green:blue:opacity:) avec des litteraux a quatre decimales
// (decision 2 du brief).
export function swiftColorExpr(color: Color, _tokens: DesignTokens): string {
  return `Color(red: ${fixed4(color.r)}, green: ${fixed4(color.g)}, blue: ${fixed4(color.b)}, opacity: ${fixed4(color.a)})`
}

// `// nom` si la couleur correspond exactement a un token du document,
// chaine vide sinon. A ajouter par l'appelant en fin de la ligne complete
// (jamais au milieu d'un appel), un commentaire Kotlin/Swift s'etendant
// jusqu'a la fin de la ligne physique.
export function colorTokenComment(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? ` // ${token}` : ''
}

// Le poids le plus proche parmi les cas de Font.Weight (arrondi au
// multiple de 100, borne 100..900 comme pour Flutter/React Native).
export function swiftFontWeightExpr(weight: number): string {
  const clamped = Math.max(100, Math.min(900, Math.round(weight / 100) * 100))
  const table: Record<number, string> = {
    100: '.ultraLight',
    200: '.thin',
    300: '.light',
    400: '.regular',
    500: '.medium',
    600: '.semibold',
    700: '.bold',
    800: '.heavy',
    900: '.black',
  }
  return table[clamped]!
}
