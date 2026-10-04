// Refonte visuelle : le plan de travail doit desormais tenir entierement
// dans la zone visible a l'ouverture (au lieu de rester fige a 100 % au
// point (0,0) du monde, ce qui le faisait deborder de la fenetre des que
// l'appareil edite depassait sa taille). Ce test verifie directement la
// fonction pure qui calcule ce cadrage (voir canvas/viewport.ts), sans
// dependre d'une vraie mise en page (jsdom n'en fait pas).
import { describe, expect, it } from 'vitest'
import { computeFitTransform, computeFitTransformToBounds, computeWheelZoom } from '../src/renderer/canvas/viewport'

describe('computeFitTransform (refonte visuelle)', () => {
  it('centre et retrecit un appareil plus grand que le conteneur pour qu il tienne entierement dedans', () => {
    const container = { width: 900, height: 600 }
    const device = { width: 393, height: 852 } // iPhone 15, plus haut que le conteneur

    const { zoom, pan } = computeFitTransform(container, device)

    expect(zoom).toBeGreaterThan(0)
    expect(zoom).toBeLessThan(1)

    const right = pan.x + device.width * zoom
    const bottom = pan.y + device.height * zoom

    // "Tient entierement dans la zone visible" : le rectangle de
    // l'appareil, une fois cadre, reste a l'interieur des quatre bords du
    // conteneur.
    expect(pan.x).toBeGreaterThanOrEqual(0)
    expect(pan.y).toBeGreaterThanOrEqual(0)
    expect(right).toBeLessThanOrEqual(container.width)
    expect(bottom).toBeLessThanOrEqual(container.height)
  })

  it('centre horizontalement et verticalement (a l ecart symetrique pres de l etiquette)', () => {
    const container = { width: 1000, height: 1000 }
    const device = { width: 200, height: 200 }

    const { zoom, pan } = computeFitTransform(container, device)

    const marginLeft = pan.x
    const marginRight = container.width - (pan.x + device.width * zoom)
    expect(marginLeft).toBeCloseTo(marginRight, 5)
  })

  it('ne grossit jamais un petit appareil au-dela de 100 % dans un grand conteneur', () => {
    const container = { width: 4000, height: 3000 }
    const device = { width: 393, height: 852 }

    const { zoom } = computeFitTransform(container, device)

    expect(zoom).toBe(1)
  })

  it('rend des valeurs neutres si le conteneur n a pas de taille exploitable (jsdom, avant mise en page)', () => {
    const { zoom, pan } = computeFitTransform({ width: 0, height: 0 }, { width: 393, height: 852 })
    expect(zoom).toBe(1)
    expect(pan).toEqual({ x: 0, y: 0 })
  })
})

// v2 (addendum navigation §4 : « l'ajustement à la fenêtre cadre tous les
// écrans »). computeFitTransform delegue desormais a cette fonction plus
// generale ; ces tests la verifient directement sur un cadre englobant qui
// n'est PAS a l'origine du monde (l'union de plusieurs ecrans poses cote a
// cote sur le plan de travail).
describe('computeFitTransformToBounds (v2, addendum navigation)', () => {
  it('cadre un ensemble d ecrans qui ne commence pas en (0,0)', () => {
    const container = { width: 2000, height: 1000 }
    // Deux ecrans iPhone 15 (393x852) cote a cote avec une gouttière,
    // l'union commence a x=500 (pas 0).
    const bounds = { x: 500, y: 0, w: 393 * 2 + 120, h: 852 }

    const { zoom, pan } = computeFitTransformToBounds(container, bounds)

    const left = pan.x + bounds.x * zoom
    const right = pan.x + (bounds.x + bounds.w) * zoom
    const top = pan.y + bounds.y * zoom
    const bottom = pan.y + (bounds.y + bounds.h) * zoom

    expect(left).toBeGreaterThanOrEqual(-0.01)
    expect(top).toBeGreaterThanOrEqual(-0.01)
    expect(right).toBeLessThanOrEqual(container.width + 0.01)
    expect(bottom).toBeLessThanOrEqual(container.height + 0.01)
  })

  it('equivaut a computeFitTransform pour un cadre a l origine (0,0)', () => {
    const container = { width: 900, height: 600 }
    const device = { width: 393, height: 852 }

    const viaDevice = computeFitTransform(container, device)
    const viaBounds = computeFitTransformToBounds(container, { x: 0, y: 0, w: device.width, h: device.height })

    expect(viaBounds).toEqual(viaDevice)
  })
})

describe('computeWheelZoom (refonte visuelle, zoom molette Ctrl/Cmd)', () => {
  it('augmente le zoom quand deltaY est negatif (molette vers soi / pincement)', () => {
    const { zoom } = computeWheelZoom(1, { x: 0, y: 0 }, { x: 100, y: 100 }, -100)
    expect(zoom).toBeGreaterThan(1)
  })

  it('diminue le zoom quand deltaY est positif', () => {
    const { zoom } = computeWheelZoom(1, { x: 0, y: 0 }, { x: 100, y: 100 }, 100)
    expect(zoom).toBeLessThan(1)
  })

  it('garde le point sous le curseur fixe (le pan compense le changement de zoom)', () => {
    const zoomAvant = 1
    const pan = { x: 0, y: 0 }
    const cursor = { x: 100, y: 50 }
    const { zoom, pan: panApres } = computeWheelZoom(zoomAvant, pan, cursor, -100)

    // Le point du monde sous le curseur avant == apres.
    const mondeAvant = { x: (cursor.x - pan.x) / zoomAvant, y: (cursor.y - pan.y) / zoomAvant }
    const mondeApres = { x: (cursor.x - panApres.x) / zoom, y: (cursor.y - panApres.y) / zoom }
    expect(mondeApres.x).toBeCloseTo(mondeAvant.x, 5)
    expect(mondeApres.y).toBeCloseTo(mondeAvant.y, 5)
  })
})

describe('compensatePan : la vue ne saute pas quand un panneau de gauche bouge', () => {
  it('le panoramique absorbe le decalage du bord gauche, zoom inchange', async () => {
    const { compensatePan } = await import('../src/renderer/canvas/viewport')
    // le panneau de 248 px se replie en barre de 36 px : le bord gauche recule de 212 px
    expect(compensatePan({ x: 100, y: 40 }, 248, 36)).toEqual({ x: 312, y: 40 })
    // et revient
    expect(compensatePan({ x: 312, y: 40 }, 36, 248)).toEqual({ x: 100, y: 40 })
    const same = { x: 5, y: 5 }
    expect(compensatePan(same, 10, 10)).toBe(same)
  })
})
