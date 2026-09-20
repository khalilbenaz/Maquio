// Utilitaires de generation Jetpack Compose (Tache 9). Comme SwiftUI,
// Compose reste en apercu (decision 9 du brief) : couleurs litterales,
// avec un commentaire `// nom` quand la couleur correspond exactement a
// un token du document.
import type { Color, DesignTokens } from '@calque/core'
import { colorHexARGB } from '../shared/color-hex'
import { findColorToken } from '../shared/tokens'

// Echappe une chaine pour l'inserer dans un litteral Kotlin a guillemets
// doubles (decision 7 du brief) : antislash et guillemet double d'abord,
// puis `$` — Kotlin interpole avec `$identifiant` ou `${expression}` dans
// une chaine a guillemets doubles, contrairement a TypeScript/Swift, donc
// `$` DOIT etre echappe ici (`\$`) — et enfin le saut de ligne. Le
// guillemet simple n'a aucun sens special en Kotlin.
export function escapeKotlinString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
}

export function kotlinString(value: string): string {
  return `"${escapeKotlinString(value)}"`
}

// Color(0xAARRGGBB) hexadecimal majuscule : EXACTEMENT le meme format que
// Flutter (voir ../shared/color-hex.ts), reutilise tel quel plutot que
// recalcule.
export function composeColorExpr(color: Color, _tokens: DesignTokens): string {
  return `Color(${colorHexARGB(color)})`
}

// `// nom` si la couleur correspond exactement a un token du document, a
// ajouter par l'appelant en fin de ligne complete (jamais au milieu d'un
// appel Kotlin, ou `//` commenterait le reste de la ligne).
export function colorTokenComment(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? ` // ${token}` : ''
}

// Le FontWeight.* le plus proche parmi les constantes standard de
// Compose (arrondi au multiple de 100, borne 100..900).
export function composeFontWeightExpr(weight: number): string {
  const clamped = Math.max(100, Math.min(900, Math.round(weight / 100) * 100))
  const table: Record<number, string> = {
    100: 'FontWeight.Thin',
    200: 'FontWeight.ExtraLight',
    300: 'FontWeight.Light',
    400: 'FontWeight.Normal',
    500: 'FontWeight.Medium',
    600: 'FontWeight.SemiBold',
    700: 'FontWeight.Bold',
    800: 'FontWeight.ExtraBold',
    900: 'FontWeight.Black',
  }
  return table[clamped]!
}
