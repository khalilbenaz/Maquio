import { describe, expect, it } from 'vitest'
import { containsPoint, unionRects, intersects, translateRect } from './rect'

const r = { x: 10, y: 10, w: 100, h: 50 }

describe('containsPoint', () => {
  it('inclut le bord haut-gauche et exclut le bord bas-droit', () => {
    expect(containsPoint(r, { x: 10, y: 10 })).toBe(true)
    expect(containsPoint(r, { x: 110, y: 60 })).toBe(false)
    expect(containsPoint(r, { x: 109, y: 59 })).toBe(true)
  })
})

describe('unionRects', () => {
  it('englobe tous les rectangles', () => {
    expect(unionRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }]))
      .toEqual({ x: 0, y: 0, w: 30, h: 15 })
  })
  it('leve sur un tableau vide', () => { expect(() => unionRects([])).toThrow() })
})

describe('intersects', () => {
  it('est faux pour deux rectangles qui se touchent seulement par le bord', () => {
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('translateRect', () => {
  it('ne mute pas l entree', () => {
    const out = translateRect(r, 5, -5)
    expect(out).toEqual({ x: 15, y: 5, w: 100, h: 50 })
    expect(r.x).toBe(10)
  })
})
