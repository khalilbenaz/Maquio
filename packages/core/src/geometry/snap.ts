// Magnetisme (snapping) et guides d'alignement. Fonctions pures.

import type { Rect } from '../model/types'

export function snapValue(
  v: number,
  candidates: number[],
  threshold: number,
): { value: number; snappedTo: number | null } {
  let best: number | null = null
  let bestDist = Infinity

  for (const c of candidates) {
    const dist = Math.abs(v - c)
    if (dist > threshold) continue
    // Le plus proche gagne ; a distance egale, le plus petit candidat gagne
    // (regle arbitraire mais deterministe).
    if (dist < bestDist || (dist === bestDist && best !== null && c < best)) {
      best = c
      bestDist = dist
    }
  }

  return best === null ? { value: v, snappedTo: null } : { value: best, snappedTo: best }
}

// Bords et centre d'un rectangle sur un axe donne.
function edgeCandidates(min: number, size: number): [number, number, number] {
  return [min, min + size / 2, min + size]
}

function axisGuides(movingCandidates: number[], neighborCandidateLists: number[][], threshold: number): number[] {
  const guides = new Set<number>()
  for (const neighborCandidates of neighborCandidateLists) {
    for (const nc of neighborCandidates) {
      for (const mc of movingCandidates) {
        if (Math.abs(nc - mc) <= threshold) {
          guides.add(nc)
        }
      }
    }
  }
  return Array.from(guides).sort((a, b) => a - b)
}

export function alignmentGuides(
  moving: Rect,
  others: Rect[],
  threshold: number,
): { x: number[]; y: number[] } {
  const movingX = edgeCandidates(moving.x, moving.w)
  const movingY = edgeCandidates(moving.y, moving.h)

  const othersX = others.map((o) => edgeCandidates(o.x, o.w))
  const othersY = others.map((o) => edgeCandidates(o.y, o.h))

  return {
    x: axisGuides(movingX, othersX, threshold),
    y: axisGuides(movingY, othersY, threshold),
  }
}
