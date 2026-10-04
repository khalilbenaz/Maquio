// Utilitaires de generation React Native partages par react-native.ts et
// theme.ts (Tache 8), pour que le format des couleurs, l'echappement des
// chaines et la casse des noms ne divergent jamais entre l'ecran genere et
// le theme genere.
import type { Color, DesignTokens } from '@maquio/core'
import { colorByte } from '../shared/color-hex'
import { toSafeIdentifier } from '../shared/identifier'
import { findColorToken } from '../shared/tokens'
import { tokenIdentifier } from '../shared/token-identifiers'

// camelCase a partir d'un id de noeud ('frame-login-screen' ->
// 'frameLoginScreen') : utilise pour les cles de StyleSheet.create. On
// part de l'id (unique) plutot que du nom (potentiellement duplique entre
// deux noeuds, ex. deux boutons "Button") pour garantir des cles uniques
// de maniere deterministe.
//
// Correction Critical 1 (round de correction finale) : un id Figma comme
// '1:1' ne contient qu'un seul "mot" alphanumerique par separateur
// (['1','1']), ce qui produisait ici la cle '11' -- un identifiant JS
// invalide (`styles.11` ne parse pas). `toSafeIdentifier` (shared/
// identifier.ts) garde exactement le meme decoupage/casse pour toute
// chaine deja valide (aucun changement sur la fixture existante) et
// prefixe seulement les ids qui commenceraient par un chiffre.
// L'UNICITE des cles (y compris avec le repli 'root' du multi-racine,
// react-native.ts) est de la responsabilite de l'appelant, qui doit
// utiliser un `createUniqueIdentifierNamer` partage pour toute une page --
// cette fonction reste pure et sans etat pour rester testable isolement.
export function toCamelCase(input: string): string {
  return toSafeIdentifier(input, 'node')
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
// valeur litterale hexadecimale. `onTokenUsed` est appele quand un token a
// ete utilise, pour que l'appelant (react-native.ts) sache s'il doit
// importer `theme` dans le fichier genere, sans dupliquer ici la logique
// de correspondance couleur -> token.
//
// Correction Critical 3 : `token` est le nom BRUT du token ("brand-
// primary-500"), lisible mais pas un identifiant JS valide en notation
// pointee. `tokenIdentifier` le fait correspondre exactement a la cle
// emise par theme.ts pour ce meme document (meme categorie de noms,
// `tokens.colors`, meme regle d'unicite) : les deux ne peuvent jamais
// diverger, calcules a partir des memes noms bruts.
export function colorExpr(color: Color, tokens: DesignTokens, onTokenUsed?: () => void): string {
  const token = findColorToken(color, tokens)
  if (token !== null) {
    onTokenUsed?.()
    return `theme.colors.${tokenIdentifier(token, Object.keys(tokens.colors))}`
  }
  return jsString(colorToHex(color))
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
