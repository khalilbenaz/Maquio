import { describe, expect, it } from 'vitest'
import { computeSnappedMoveDelta, screenToPage, snapThreshold } from '../src/renderer/canvas/useDragInteraction'
import { documentDeTest } from './helpers/documentDeTest'

describe('screenToPage (decision 10)', () => {
  it('convertit un point ecran en point de page a zoom 1 sans decalage', () => {
    expect(screenToPage({ x: 50, y: 30 }, { x: 0, y: 0 }, 1, { x: 0, y: 0 })).toEqual({ x: 50, y: 30 })
  })

  it('tient compte du zoom (teste a un zoom different de 1)', () => {
    // A zoom 2, un point ecran deux fois plus loin de l'origine correspond
    // au meme point de page qu'a zoom 1 : c'est le zoom qui absorbe le
    // facteur, pas la position de page.
    expect(screenToPage({ x: 100, y: 60 }, { x: 0, y: 0 }, 2, { x: 0, y: 0 })).toEqual({ x: 50, y: 30 })
  })

  it('tient compte du decalage du canevas a l ecran et du panoramique', () => {
    expect(screenToPage({ x: 130, y: 80 }, { x: 10, y: 10 }, 1, { x: 20, y: 10 })).toEqual({ x: 100, y: 60 })
  })
})

describe('snapThreshold (decision 9)', () => {
  it('vaut 4 px a zoom 1', () => {
    expect(snapThreshold(1)).toBe(4)
  })

  it('est divise par le zoom aux autres echelles', () => {
    expect(snapThreshold(2)).toBe(2)
    expect(snapThreshold(0.5)).toBe(8)
  })
})

describe('computeSnappedMoveDelta (decision 9)', () => {
  it('aligne sur un voisin proche (dans le seuil, ajuste au zoom)', () => {
    const doc = documentDeTest()
    const nodes = doc.pages[0]!.nodes // rect1 {0,0,50,50}, rect2 {100,100,50,50}
    // Deplacer rect1 pour que son bord droit (x + w = dx + 50) arrive a 98,
    // a 2px du bord gauche de rect2 (100) : dans le seuil de 4px a zoom 1.
    const { dx, dy } = computeSnappedMoveDelta(nodes, 'rect1', 48, 0, 1)
    expect(dx).toBe(50) // bord droit aligne exactement sur 100
    expect(dy).toBe(0)
  })

  it('n aligne pas hors du seuil divise par le zoom', () => {
    const doc = documentDeTest()
    const nodes = doc.pages[0]!.nodes
    // Meme deplacement qu'au-dessus, mais a zoom 2 le seuil vaut 2px : un
    // ecart de page de 2px (98 vs 100) reste dans ce seuil de 2px, donc on
    // verifie plutot un ecart hors seuil pour prouver l'absence d'aimant.
    const { dx } = computeSnappedMoveDelta(nodes, 'rect1', 40, 0, 2)
    expect(dx).toBe(40)
  })
})
