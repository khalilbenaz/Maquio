// Utilitaires de generation Jetpack Compose (Tache 9). Comme SwiftUI,
// Compose reste en apercu (decision 9 du brief) : couleurs litterales. Le
// commentaire de tracabilite `// nom` est defini une seule fois dans
// ../shared/color-token-comment.ts, reexporte ici pour ne pas changer les
// imports de compose.ts (round de correction 1, Important 2 du
// coordinateur : la version precedente dupliquait ce commentaire a
// l'identique dans swift-utils.ts).
import type { Color, DesignTokens } from '@maquio/core'
import { colorHexARGB } from '../shared/color-hex'

export { colorTokenComment } from '../shared/color-token-comment'

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
