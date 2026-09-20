// Operations geometriques de base sur Rect. Fonctions pures : aucune ne
// mute son entree.
//
// Convention de bord (fige par les tests) : un rectangle contient son
// bord haut-gauche et exclut son bord bas-droit (demi-ouvert). intersects
// suit la meme convention : deux rectangles qui se touchent seulement
// par un bord ne s'intersectent pas.

import type { Rect } from '../model/types'

export function containsPoint(r: Rect, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
}

export function unionRects(rects: Rect[]): Rect {
  const [first, ...rest] = rects
  if (first === undefined) {
    throw new Error('unionRects: le tableau de rectangles ne doit pas etre vide')
  }

  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.w
  let maxY = first.y + first.h

  for (const r of rest) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function translateRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }
}
