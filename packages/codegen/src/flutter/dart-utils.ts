// Utilitaires de generation Dart partages par flutter.ts et theme.ts, pour
// que le format des couleurs, l'echappement des chaines et la casse des
// noms ne divergent jamais entre l'ecran genere et le theme genere.
import type { Color, DesignTokens } from '@calque/core'

// snake_case : utilise pour les noms de fichiers Dart (login_screen.dart).
export function toSnakeCase(input: string): string {
  const withSeparators = input.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_')
  return withSeparators
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// PascalCase : utilise pour les noms de classe (StatelessWidget).
export function toPascalCase(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}

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
export function formatNumber(value: number, decimals = 4): string {
  if (Number.isInteger(value)) return String(value)
  const fixed = value.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}

function toByte(component: number): number {
  return Math.max(0, Math.min(255, Math.round(component * 255)))
}

// Color(0xAARRGGBB) hexadecimal majuscule, converti depuis les composantes
// 0..1 par Math.round(c * 255) (decision 9 du brief Tache 7).
export function colorHex(color: Color): string {
  const toHex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  return `0x${toHex(toByte(color.a))}${toHex(toByte(color.r))}${toHex(toByte(color.g))}${toHex(toByte(color.b))}`
}

function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

// Cherche un token de couleur correspondant exactement (composantes
// identiques). L'ordre d'iteration suit l'ordre d'insertion des cles de
// l'objet (deterministe pour des cles chaine non numeriques), jamais un
// Set/Map a ordre incertain.
function findColorToken(color: Color, tokens: DesignTokens): string | null {
  for (const [name, tokenColor] of Object.entries(tokens.colors)) {
    if (colorsEqual(color, tokenColor)) return name
  }
  return null
}

// Expression Dart pour une couleur : la constante de theme quand elle
// correspond exactement a un token (decision 8 du brief Tache 7), sinon la
// valeur litterale.
export function colorExpr(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? `AppColors.${token}` : `const Color(${colorHex(color)})`
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
