import { describe, expect, it } from 'vitest'
import { handleRects, resizeRect } from './handles'

describe('handleRects', () => {
  it('produit huit poignees centrees sur les bords et les coins', () => {
    const h = handleRects({ x: 0, y: 0, w: 100, h: 100 }, 8)
    expect(Object.keys(h)).toHaveLength(8)
    expect(h.nw).toEqual({ x: -4, y: -4, w: 8, h: 8 })
    expect(h.se).toEqual({ x: 96, y: 96, w: 8, h: 8 })
    expect(h.n).toEqual({ x: 46, y: -4, w: 8, h: 8 })
  })
})

describe('resizeRect', () => {
  it('deplace l origine quand on tire le coin haut-gauche', () => {
    expect(resizeRect({ x: 10, y: 10, w: 100, h: 100 }, 'nw', 10, 20))
      .toEqual({ x: 20, y: 30, w: 90, h: 80 })
  })
  it('ne laisse jamais une dimension descendre sous 1', () => {
    const out = resizeRect({ x: 0, y: 0, w: 10, h: 10 }, 'se', -100, -100)
    expect(out.w).toBe(1); expect(out.h).toBe(1)
  })
  it('conserve le ratio quand on le demande', () => {
    const out = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, 'se', 100, 0, { keepRatio: true })
    expect(out.w / out.h).toBeCloseTo(2)
  })

  // Point 4 du cahier des charges : quand la contrainte de dimension minimale
  // (1) mord sur une poignee qui deplace l'origine, le bord OPPOSE a la
  // poignee doit rester fixe (coherence origine / dimension retenue).
  it('garde le bord oppose fixe quand nw est tire tres au-dela du bord oppose', () => {
    const out = resizeRect({ x: 10, y: 10, w: 100, h: 100 }, 'nw', 10000, 10000)
    expect(out.w).toBe(1)
    expect(out.h).toBe(1)
    // Le bord bas-droit (oppose a nw) etait a x+w=110, y+h=110 : il ne bouge pas.
    expect(out.x + out.w).toBeCloseTo(110)
    expect(out.y + out.h).toBeCloseTo(110)
  })

  // Correction round 1 : avec une dimension nulle, keepRatio n'a pas de
  // ratio a conserver. L'option est ignoree (comportement identique a sans
  // keepRatio, clamp min-1 inclus) — jamais de NaN/Infinity en sortie.
  describe('keepRatio avec une dimension nulle (ratio non defini)', () => {
    it('ignore keepRatio quand h=0, sur une poignee de coin (se)', () => {
      const out = resizeRect({ x: 0, y: 0, w: 100, h: 0 }, 'se', 0, 50, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 100, h: 50 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })

    it('ignore keepRatio quand w=0, sur une poignee de coin (se)', () => {
      const out = resizeRect({ x: 0, y: 0, w: 0, h: 100 }, 'se', 50, 0, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 50, h: 100 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })

    it('ignore keepRatio quand w=0 et h=0, sur une poignee de coin (se), et applique quand meme le clamp min-1', () => {
      const out = resizeRect({ x: 0, y: 0, w: 0, h: 0 }, 'se', -100, -100, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 1, h: 1 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })

    it('ignore keepRatio quand h=0, sur une poignee de bord (e)', () => {
      const out = resizeRect({ x: 0, y: 0, w: 100, h: 0 }, 'e', 20, 0, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 120, h: 1 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })

    it('ignore keepRatio quand w=0, sur une poignee de bord (s)', () => {
      const out = resizeRect({ x: 0, y: 0, w: 0, h: 100 }, 's', 0, 30, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 1, h: 130 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })

    it('ignore keepRatio quand w=0 et h=0, sur une poignee de bord (e), et applique quand meme le clamp min-1', () => {
      const out = resizeRect({ x: 0, y: 0, w: 0, h: 0 }, 'e', -5, 0, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 1, h: 1 })
      expect(Number.isFinite(out.w)).toBe(true)
      expect(Number.isFinite(out.h)).toBe(true)
    })
  })

  // Non-regression : avec des dimensions non nulles, keepRatio se comporte
  // exactement comme avant la correction (coin et bord).
  describe('keepRatio avec des dimensions non nulles (non-regression)', () => {
    it('conserve le ratio sur une poignee de coin (se) — deja teste plus haut, reaffirme ici', () => {
      const out = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, 'se', 100, 0, { keepRatio: true })
      expect(out.w / out.h).toBeCloseTo(2)
    })

    it('conserve le ratio sur une poignee de bord (e)', () => {
      const out = resizeRect({ x: 0, y: 0, w: 100, h: 50 }, 'e', 100, 0, { keepRatio: true })
      expect(out).toEqual({ x: 0, y: 0, w: 200, h: 100 })
      expect(out.w / out.h).toBeCloseTo(2)
    })
  })
})
