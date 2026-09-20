// Poignees de redimensionnement. Fonctions pures : aucune ne mute son
// entree.

import type { Rect } from '../model/types'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

// Pour chaque poignee, quel bord horizontal/vertical du rectangle elle
// deplace. 'none' signifie que ce bord ne bouge pas (l'origine correspondante
// reste fixe).
const X_EDGE: Record<HandleId, 'left' | 'right' | 'none'> = {
  nw: 'left',
  n: 'none',
  ne: 'right',
  e: 'right',
  se: 'right',
  s: 'none',
  sw: 'left',
  w: 'left',
}

const Y_EDGE: Record<HandleId, 'top' | 'bottom' | 'none'> = {
  nw: 'top',
  n: 'top',
  ne: 'top',
  e: 'none',
  se: 'bottom',
  s: 'bottom',
  sw: 'bottom',
  w: 'none',
}

// Point d'ancrage de chaque poignee sur le rectangle (avant centrage sur la
// taille de la poignee).
function anchorOf(r: Rect, handle: HandleId): { x: number; y: number } {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  switch (handle) {
    case 'nw': return { x: r.x, y: r.y }
    case 'n': return { x: cx, y: r.y }
    case 'ne': return { x: r.x + r.w, y: r.y }
    case 'e': return { x: r.x + r.w, y: cy }
    case 'se': return { x: r.x + r.w, y: r.y + r.h }
    case 's': return { x: cx, y: r.y + r.h }
    case 'sw': return { x: r.x, y: r.y + r.h }
    case 'w': return { x: r.x, y: cy }
  }
}

export function handleRects(r: Rect, size: number): Record<HandleId, Rect> {
  const half = size / 2
  const handles: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const result = {} as Record<HandleId, Rect>
  for (const handle of handles) {
    const anchor = anchorOf(r, handle)
    result[handle] = { x: anchor.x - half, y: anchor.y - half, w: size, h: size }
  }
  return result
}

export function resizeRect(
  r: Rect,
  handle: HandleId,
  dx: number,
  dy: number,
  opts?: { keepRatio?: boolean },
): Rect {
  const xEdge = X_EDGE[handle]
  const yEdge = Y_EDGE[handle]

  let rawW = xEdge === 'left' ? r.w - dx : xEdge === 'right' ? r.w + dx : r.w
  let rawH = yEdge === 'top' ? r.h - dy : yEdge === 'bottom' ? r.h + dy : r.h

  // keepRatio n'a de sens que si le rectangle d'origine a un ratio defini :
  // avec une dimension nulle, il n'y a pas de ratio a conserver, l'option
  // est alors ignoree (comportement identique a sans keepRatio, clamp min-1
  // inclus) plutot que d'inventer une contrainte (ex. carre) non demandee.
  if (opts?.keepRatio && r.w !== 0 && r.h !== 0) {
    const ratio = r.w / r.h
    const isCorner = xEdge !== 'none' && yEdge !== 'none'
    if (isCorner) {
      // Poignee de coin : la dimension dominante est celle dont le
      // deplacement est le plus grand en valeur absolue ; l'autre s'en
      // deduit du ratio d'origine.
      if (Math.abs(dx) >= Math.abs(dy)) {
        rawH = rawW / ratio
      } else {
        rawW = rawH * ratio
      }
    } else if (xEdge !== 'none') {
      // Poignee de bord horizontal (e/w) : la hauteur suit proportionnellement.
      rawH = rawW / ratio
    } else if (yEdge !== 'none') {
      // Poignee de bord vertical (n/s) : la largeur suit proportionnellement.
      rawW = rawH * ratio
    }
  }

  // Jamais de dimension sous 1.
  const newW = Math.max(1, rawW)
  const newH = Math.max(1, rawH)

  // Quand la poignee deplace l'origine (bord gauche/haut), le bord oppose
  // (droit/bas) reste fixe : on recalcule x/y a partir de la dimension
  // retenue plutot que d'appliquer dx/dy bruts.
  const newX = xEdge === 'left' ? r.x + r.w - newW : r.x
  const newY = yEdge === 'top' ? r.y + r.h - newH : r.y

  return { x: newX, y: newY, w: newW, h: newH }
}
