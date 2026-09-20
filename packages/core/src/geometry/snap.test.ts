import { describe, expect, it } from 'vitest'
import { snapValue, alignmentGuides } from './snap'

describe('snapValue', () => {
  it('accroche au candidat le plus proche sous le seuil', () => {
    expect(snapValue(98, [0, 100, 200], 5)).toEqual({ value: 100, snappedTo: 100 })
  })
  it('n accroche pas au-dela du seuil', () => {
    expect(snapValue(90, [0, 100], 5)).toEqual({ value: 90, snappedTo: null })
  })

  // Point 6 du cahier des charges : a distance egale entre deux candidats,
  // le plus petit gagne (regle arbitraire mais deterministe, figee ici).
  it('a distance egale entre deux candidats, le plus petit gagne', () => {
    expect(snapValue(100, [95, 105], 10)).toEqual({ value: 95, snappedTo: 95 })
  })
})

describe('alignmentGuides', () => {
  it('signale les bords alignes des voisins', () => {
    const g = alignmentGuides({ x: 48, y: 0, w: 50, h: 10 }, [{ x: 50, y: 100, w: 50, h: 10 }], 4)
    expect(g.x).toContain(50)
  })

  // Point 7 du cahier des charges : pas de doublon, resultat trie par ordre
  // croissant, meme quand plusieurs voisins produisent la meme valeur et
  // meme quand ils sont fournis dans le desordre. Seuil 0 pour ne retenir
  // que les correspondances exactes et isoler ce qu'on teste.
  it('deduplique les guides et les trie par ordre croissant', () => {
    const moving = { x: 0, y: 0, w: 20, h: 10 } // left=0, centerX=10, right=20
    const n3 = { x: 5, y: 300, w: 10, h: 10 } // centerX=10 -> matche moving.centerX (guide 10)
    const n1 = { x: 0, y: 100, w: 6, h: 6 } // left=0 -> matche moving.left (guide 0)
    const n2 = { x: -3, y: 200, w: 6, h: 6 } // centerX=0 -> matche aussi moving.left (guide 0, doublon)
    // n3 en tete pour verifier que le tri ne depend pas de l'ordre d'entree.
    const g = alignmentGuides(moving, [n3, n1, n2], 0)
    expect(g.x).toEqual([0, 10])
    expect(g.y).toEqual([])
  })
})
