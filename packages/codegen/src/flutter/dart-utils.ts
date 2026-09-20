// Utilitaires de generation Dart partages par flutter.ts et theme.ts, pour
// que le format des couleurs, l'echappement des chaines et la casse des
// noms ne divergent jamais entre l'ecran genere et le theme genere.
//
// `toPascalCase`, `formatNumber` et le calcul hexadecimal ARGB sont
// vraiment communs aux quatre exportateurs (Taches 8/9) : ils vivent dans
// `../shared/` et sont ici re-exportes sous leur nom Dart historique pour
// ne rien changer au comportement de ce fichier.
import type { Color, DesignTokens } from '@calque/core'
import { colorHexARGB } from '../shared/color-hex'
import { formatNumber as sharedFormatNumber } from '../shared/format-number'
import { toPascalCase as sharedToPascalCase } from '../shared/naming'
import { tokenIdentifier } from '../shared/token-identifiers'
import { findColorToken } from '../shared/tokens'

// snake_case : utilise pour les noms de fichiers Dart (login_screen.dart).
export function toSnakeCase(input: string): string {
  const withSeparators = input.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_')
  return withSeparators
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// PascalCase : utilise pour les noms de classe (StatelessWidget).
export const toPascalCase = sharedToPascalCase

// Echappe une chaine pour l'inserer dans un litteral Dart entoure de
// guillemets simples : antislash, guillemet simple, `$` (interpolation
// Dart) et retour a la ligne (decision 10 du brief Tache 7). L'ordre
// importe : l'antislash doit etre echappe en premier, sinon les
// echappements qu'on vient d'inserer seraient a leur tour echappes.
export function escapeDartString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\$/g, '\\$')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/\t/g, '\\t')
}

// Formate un nombre en litteral Dart : un entier s'ecrit sans decimale
// (Dart accepte un litteral entier la ou un double est attendu), les
// autres sont arrondis a `decimals` decimales puis debarrasses de leurs
// zeros de fin, pour un rendu deterministe et lisible plutot que des
// flottants a 15 chiffres.
export const formatNumber = sharedFormatNumber

// Color(0xAARRGGBB) hexadecimal majuscule, converti depuis les composantes
// 0..1 par Math.round(c * 255) (decision 9 du brief Tache 7). Identique au
// format hexadecimal de Compose (Tache 9) : voir ../shared/color-hex.ts.
export const colorHex = colorHexARGB

// Expression Dart pour une couleur : la constante de theme quand elle
// correspond exactement a un token (decision 8 du brief Tache 7), sinon la
// valeur litterale.
//
// Correction Critical 3 : `token` est le nom BRUT ("brand-primary-500"),
// pas forcement un identifiant Dart valide -- `static const Color brand-
// primary-500` ne compile pas. `tokenIdentifier` le fait correspondre a la
// meme cle que celle emise par theme.ts pour ce document (meme categorie
// de noms `tokens.colors`), jamais recalculee independamment.
export function colorExpr(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  if (token === null) return `const Color(${colorHex(color)})`
  return `AppColors.${tokenIdentifier(token, Object.keys(tokens.colors))}`
}

// FontWeight.wNNN le plus proche (arrondi au multiple de 100, borne a
// 100..900 comme le prevoit l'API Flutter).
export function fontWeightExpr(weight: number): string {
  const clamped = Math.max(100, Math.min(900, Math.round(weight / 100) * 100))
  return `FontWeight.w${clamped}`
}

export function mainAxisAlignmentExpr(align: 'start' | 'center' | 'end' | 'space-between'): string {
  if (align === 'start') return 'MainAxisAlignment.start'
  if (align === 'center') return 'MainAxisAlignment.center'
  if (align === 'end') return 'MainAxisAlignment.end'
  return 'MainAxisAlignment.spaceBetween'
}

export function crossAxisAlignmentExpr(align: 'start' | 'center' | 'end' | 'stretch'): string {
  if (align === 'start') return 'CrossAxisAlignment.start'
  if (align === 'center') return 'CrossAxisAlignment.center'
  if (align === 'end') return 'CrossAxisAlignment.end'
  return 'CrossAxisAlignment.stretch'
}

export function textAlignExpr(align: 'left' | 'center' | 'right'): string {
  if (align === 'left') return 'TextAlign.left'
  if (align === 'center') return 'TextAlign.center'
  return 'TextAlign.right'
}

export function boxFitExpr(fit: 'cover' | 'contain' | 'fill'): string {
  if (fit === 'cover') return 'BoxFit.cover'
  if (fit === 'contain') return 'BoxFit.contain'
  return 'BoxFit.fill'
}
