// Utilitaires de generation React Native partages par react-native.ts et
// theme.ts (Tache 8), pour que le format des couleurs, l'echappement des
// chaines et la casse des noms ne divergent jamais entre l'ecran genere et
// le theme genere.
import type { Color, DesignTokens } from '@calque/core'
import { colorByte } from '../shared/color-hex'
import { findColorToken } from '../shared/tokens'

// camelCase a partir d'un id de noeud ('frame-login-screen' ->
// 'frameLoginScreen') : utilise pour les cles de StyleSheet.create. On
// part de l'id (unique) plutot que du nom (potentiellement duplique entre
// deux noeuds, ex. deux boutons "Button") pour garantir des cles uniques
// de maniere deterministe, sans compteur de collision a maintenir.
export function toCamelCase(input: string): string {
  const parts = input.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0)
  if (parts.length === 0) return input
  const [first, ...rest] = parts
  return [first!.toLowerCase(), ...rest.map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())].join('')
}

// Echappe une chaine pour l'inserer dans un litteral JS/TS a guillemets
// simples : antislash et guillemet simple, puis saut de ligne (decision 7
// du brief Tache 9). Contrairement a Dart/Swift/Kotlin, `$` n'a pas besoin
// d'etre echappe ici : ce n'est un caractere special que dans un template
// literal (`${...}`), jamais dans une chaine a guillemets simples ou
// doubles. Le guillemet double n'a pas non plus besoin d'etre echappe
// puisque le delimiteur choisi est le guillemet simple.
export function escapeJsString(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
}

function jsString(value: string): string {
  return `'${escapeJsString(value)}'`
}

// #rrggbbaa minuscule (alpha en dernier, format hexadecimal 8 chiffres
// supporte par le parseur de couleurs de React Native), converti depuis
// les composantes 0..1 par Math.round(c * 255).
export function colorToHex(color: Color): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(colorByte(color.r))}${toHex(colorByte(color.g))}${toHex(colorByte(color.b))}${toHex(colorByte(color.a))}`
}

// Expression TS pour une couleur : la constante de theme quand elle
// correspond exactement a un token (decision 9 du brief Tache 9), sinon la
// valeur litterale hexadecimale.
export function colorExpr(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? `theme.colors.${token}` : jsString(colorToHex(color))
}

// '100'..'900' le plus proche (arrondi au multiple de 100, borne comme
// l'union de types `fontWeight` de React Native), rendu en chaine JS.
export function fontWeightExpr(weight: number): string {
  const clamped = Math.max(100, Math.min(900, Math.round(weight / 100) * 100))
  return jsString(String(clamped))
}

export function justifyContentExpr(align: 'start' | 'center' | 'end' | 'space-between'): string {
  if (align === 'start') return "'flex-start'"
  if (align === 'center') return "'center'"
  if (align === 'end') return "'flex-end'"
  return "'space-between'"
}

export function alignItemsExpr(align: 'start' | 'center' | 'end' | 'stretch'): string {
  if (align === 'start') return "'flex-start'"
  if (align === 'center') return "'center'"
  if (align === 'end') return "'flex-end'"
  return "'stretch'"
}

export { jsString }
