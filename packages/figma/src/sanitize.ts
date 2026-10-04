// Point de passage unique pour l'assainissement des données Figma en entrée
// (correction Critical, round 1).
//
// `figma-types.ts` n'est qu'un typage a la compilation : rien ne verifie au
// runtime qu'une reponse Figma reelle le respecte (bug cote Figma, JSON
// edite a la main, version d'API differente). Une valeur absente, d'un
// mauvais type ou hors des bornes du modele Maquio ne doit jamais faire
// echouer `figmaToDocument` au milieu de l'import : elle est ramenee a la
// valeur valide la plus proche, et un avertissement est emis pour toute
// valeur *presente mais invalide* (une valeur simplement absente prend sa
// valeur par defaut en silence : ce n'est pas une anomalie, c'est un etat
// Figma parfaitement normal — ex. `opacity` absent, `children` absent/vide).
//
// Bornes imposees par nodeSchema (verifie par lecture de
// packages/core/src/model/schema.ts, tenu a jour a chaque round de
// correction) : Rect.w/h, Layout.gap, Layout.padding.*, cornerRadius (frame
// et rect), Stroke.width et TextStyle.fontSize/lineHeight sont bornes a
// 0..Infinity ; Color.r/g/b/a et NodeBase.opacity sont bornes a [0,1].
// `rotation`, `TextStyle.fontWeight` et `TextStyle.letterSpacing` restent des
// `z.number()` non bornes cote modele (letterSpacing negatif = crenage
// serre, un usage typographique legitime). Ils passent neanmoins par
// `sanitizeNumber` (sans bornes min/max) pour la meme raison que les champs
// bornes : se proteger d'un type invalide, `NaN` ou une valeur non
// numerique, sans lever au milieu de l'import. Ajouter une borne au modele
// demain se fait a l'un des appels de `sanitizeNumber` ci-dessous, jamais
// par un `Math.max`/`Math.min` disperse.
import type { Color } from '@maquio/core'
import type { FigmaColor, FigmaRect } from './figma-types'

export type WarnFn = (property: string, reason: string) => void

// Represente une valeur arbitraire dans un message d'avertissement lisible,
// y compris les cas ou JSON.stringify se comporte de facon surprenante
// (NaN/Infinity -> 'null', undefined -> la valeur JS undefined et non une
// chaine).
function describeValue(raw: unknown): string {
  if (raw === undefined) return 'undefined'
  if (typeof raw === 'number' && Number.isNaN(raw)) return 'NaN'
  if (typeof raw === 'number' && !Number.isFinite(raw)) return String(raw)
  try {
    const json = JSON.stringify(raw)
    return json ?? String(raw)
  } catch {
    return String(raw)
  }
}

// Ramene `raw` a un nombre fini valide. Une valeur absente (`undefined`)
// prend `fallback` sans avertissement (etat normal). Une valeur presente
// mais d'un type invalide, `NaN` ou non finie prend aussi `fallback`, avec
// avertissement. Une valeur numerique valide mais hors de `bounds` est
// ramenee a la borne la plus proche, avec avertissement citant la valeur
// d'origine.
export function sanitizeNumber(
  raw: unknown,
  fallback: number,
  warn: WarnFn,
  property: string,
  bounds?: { min?: number; max?: number },
): number {
  if (raw === undefined) return fallback

  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    warn(
      property,
      `Valeur Figma invalide pour "${property}" (${describeValue(raw)}), remplacee par ${fallback}`,
    )
    return fallback
  }

  const min = bounds?.min
  const max = bounds?.max
  if (min !== undefined && raw < min) {
    warn(property, `"${property}" = ${raw} hors bornes (minimum ${min}), ramene a ${min}`)
    return min
  }
  if (max !== undefined && raw > max) {
    warn(property, `"${property}" = ${raw} hors bornes (maximum ${max}), ramene a ${max}`)
    return max
  }
  return raw
}

// Assainit une couleur Figma composante par composante (bornes 0..1,
// identiques a colorSchema).
export function sanitizeColor(raw: FigmaColor, warn: WarnFn, property: string): Color {
  return {
    r: sanitizeNumber(raw.r, 0, warn, `${property}.r`, { min: 0, max: 1 }),
    g: sanitizeNumber(raw.g, 0, warn, `${property}.g`, { min: 0, max: 1 }),
    b: sanitizeNumber(raw.b, 0, warn, `${property}.b`, { min: 0, max: 1 }),
    a: sanitizeNumber(raw.a, 1, warn, `${property}.a`, { min: 0, max: 1 }),
  }
}

// Assainit la boite englobante absolue d'un noeud. Son absence totale (un
// noeud sans `absoluteBoundingBox`, structurellement possible malgre le
// champ requis du sous-ensemble type) est une perte reelle d'information de
// position : le noeud est place a l'origine de son parent avec une taille
// nulle, et l'avertissement le signale explicitement plutot que de laisser
// un noeud silencieusement invisible.
export function sanitizeBox(
  raw: FigmaRect | undefined,
  parentOrigin: { x: number; y: number },
  warn: WarnFn,
): { x: number; y: number; width: number; height: number } {
  if (!raw) {
    warn(
      'absoluteBoundingBox',
      'Boite englobante Figma absente (absoluteBoundingBox) : noeud positionne a (0,0) relativement a son parent, avec une largeur et une hauteur nulles',
    )
    return { x: parentOrigin.x, y: parentOrigin.y, width: 0, height: 0 }
  }
  return {
    x: sanitizeNumber(raw.x, parentOrigin.x, warn, 'absoluteBoundingBox.x'),
    y: sanitizeNumber(raw.y, parentOrigin.y, warn, 'absoluteBoundingBox.y'),
    width: sanitizeNumber(raw.width, 0, warn, 'absoluteBoundingBox.width', { min: 0 }),
    height: sanitizeNumber(raw.height, 0, warn, 'absoluteBoundingBox.height', { min: 0 }),
  }
}

// Nom de repli par type de noeud Figma, utilise quand `name` est absent ou
// vide. NodeBase.name (z.string()) accepterait une chaine vide sans jamais
// lever, mais un noeud sans nom degraderait silencieusement l'arbre de
// calques cote editeur : c'est signale, pas seulement tolere.
const FALLBACK_NAMES: Record<string, string> = {
  FRAME: 'Cadre',
  GROUP: 'Groupe',
  COMPONENT: 'Composant',
  INSTANCE: 'Instance',
  COMPONENT_SET: 'Ensemble de composants',
  TEXT: 'Texte',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  LINE: 'Ligne',
  VECTOR: 'Vecteur',
}

export function sanitizeName(raw: unknown, figmaType: string, warn: WarnFn): string {
  if (typeof raw === 'string' && raw.trim() !== '') return raw
  const fallback = FALLBACK_NAMES[figmaType] ?? 'Element'
  warn(
    'name',
    `Nom Figma absent ou vide pour un noeud de type "${figmaType}" (valeur d'origine : ${describeValue(raw)}), remplace par "${fallback}"`,
  )
  return fallback
}
