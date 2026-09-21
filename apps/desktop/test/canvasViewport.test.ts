// Refonte visuelle : le plan de travail doit desormais tenir entierement
// dans la zone visible a l'ouverture (au lieu de rester fige a 100 % au
// point (0,0) du monde, ce qui le faisait deborder de la fenetre des que
// l'appareil edite depassait sa taille). Ce test verifie directement la
// fonction pure qui calcule ce cadrage (voir canvas/viewport.ts), sans
// dependre d'une vraie mise en page (jsdom n'en fait pas).
import { describe, expect, it } from 'vitest'
import { computeFitTransform, computeWheelZoom } from '../src/renderer/canvas/viewport'

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
