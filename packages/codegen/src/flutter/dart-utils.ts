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
import { toPascalCase as sharedToPascalCase, toSnakeCase as sharedToSnakeCase } from '../shared/naming'
import { tokenIdentifier } from '../shared/token-identifiers'
import { findColorToken } from '../shared/tokens'

// snake_case : utilise pour les noms de fichiers Dart (login_screen.dart).
export const toSnakeCase = sharedToSnakeCase

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

// Mots reserves Dart (D1 du rapport dart-correctness-report.md) : la liste
// exacte des 33 mots que le compilateur Dart refuse TOUJOURS comme
// identifiant, verifiee a la main avec le vrai SDK (`dart analyze` sur une
// declaration `static const int <mot> = 1;` pour chaque mot candidat, y
// compris les mots-cles "limites" async/await/yield/sync et les
// identifiants integres static/get/set/late/required -- aucun de ces
// derniers n'a produit d'erreur en position de nom de membre, seuls les
// mots reserves inconditionnels ci-dessous en produisent). Un style Figma
// nomme "Default", "Class", "New", "Switch" ou "Return" normalise en
// camelCase vers exactement l'un de ces mots (`default`, `class`, `new`,
// `switch`, `return`) -- tous plausibles dans un design system reel.
export const DART_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'assert',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'for',
  'if',
  'in',
  'is',
  'new',
  'null',
  'rethrow',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'var',
  'void',
  'while',
  'with',
])

// Expression Dart pour une couleur : la constante de theme quand elle
// correspond exactement a un token (decision 8 du brief Tache 7), sinon la
// valeur litterale.
//
// Correction Critical 3 : `token` est le nom BRUT ("brand-primary-500"),
// pas forcement un identifiant Dart valide -- `static const Color brand-
// primary-500` ne compile pas. `tokenIdentifier` le fait correspondre a la
// meme cle que celle emise par theme.ts pour ce document (meme categorie
// de noms `tokens.colors`, MEME ensemble de mots reserves --
// DART_RESERVED_WORDS ci-dessus), jamais recalculee independamment.
//
// `onTokenUsed` (D4 du rapport dart-correctness) : appele uniquement
// quand une reference `AppColors.*` est effectivement emise, pour que
// l'appelant (flutter.ts) sache s'il doit importer '../theme.dart' dans
// le fichier d'ecran -- jamais de maniere inconditionnelle, sous peine
// d'un `unused_import` a l'analyse pour tout ecran qui ne reference aucun
// token (verifie avec `flutter analyze`).
//
// `omitConstKeyword` (lint `unnecessary_const`, suite du rapport
// dart-correctness) : l'appelant qui construit deja un litteral dans un
// CONTEXTE constant (ex. `static const TextStyle x = TextStyle(color:
// ...)` de theme.ts -- toute la declaration est `const`, Dart promeut
// automatiquement le `Color(...)` imbrique en constante sans le mot-cle)
// passe `true` pour ne pas emettre de `const` explicite et redondant.
// Vide/absent par defaut : flutter.ts construit ses `Container`/`Text`
// SANS `const` autour (le widget lui-meme n'est pas const), le `const`
// sur la couleur y est donc utile, jamais redondant -- verifie avec
// `flutter analyze` (0 remontee `unnecessary_const` sur les fichiers
// d'ecran generes).
export function colorExpr(
  color: Color,
  tokens: DesignTokens,
  onTokenUsed?: () => void,
  omitConstKeyword = false,
): string {
  const token = findColorToken(color, tokens)
  if (token === null) return `${omitConstKeyword ? '' : 'const '}Color(${colorHex(color)})`
  onTokenUsed?.()
  return `AppColors.${tokenIdentifier(token, Object.keys(tokens.colors), DART_RESERVED_WORDS)}`
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
