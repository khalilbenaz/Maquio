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

// Points d'accroche d'un rectangle sur chaque axe : bord min, centre, bord
// max. Exporte (Tache 15, round de correction 1) pour rester l'UNIQUE
// derivation de ces points : alignmentGuides s'en sert ci-dessous, et le
// renderer (apps/desktop) s'en sert pour calculer le delta de magnetisme
// applique au deplacement. Deux derivations separees finiraient par
// diverger (un guide affiche la ou rien n'accroche vraiment).
export function alignmentCandidates(rect: Rect): { x: [number, number, number]; y: [number, number, number] } {
  return {
    x: [rect.x, rect.x + rect.w / 2, rect.x + rect.w],
    y: [rect.y, rect.y + rect.h / 2, rect.y + rect.h],
  }
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
  const movingCandidates = alignmentCandidates(moving)
  const othersCandidates = others.map(alignmentCandidates)

  return {
    x: axisGuides(movingCandidates.x, othersCandidates.map((c) => c.x), threshold),
    y: axisGuides(movingCandidates.y, othersCandidates.map((c) => c.y), threshold),
  }
}
