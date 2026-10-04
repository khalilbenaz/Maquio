import { describe, expect, it } from 'vitest'
import { createScreenNode } from '@maquio/core'
import type { DevicePreset } from '@maquio/core'
import { nextScreenPosition, SCREEN_GUTTER } from '../src/renderer/canvas/screenLayout'

const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

// v2 (addendum navigation §4, §8 : « créer un écran le place bien à droite
// du dernier »).
describe('nextScreenPosition (v2, addendum navigation)', () => {
  it("place le premier ecran a l'origine quand la page n'en a encore aucun", () => {
    expect(nextScreenPosition([])).toEqual({ x: 0, y: 0 })
  })

  it("place le nouvel ecran a droite du dernier, avec une gouttiere fixe", () => {
    const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height })
    const position = nextScreenPosition([ecran1])
    expect(position).toEqual({ x: device.width + SCREEN_GUTTER, y: 0 })
  })

  it("se base sur l ecran le PLUS A DROITE, pas sur le dernier de l ordre du tableau", () => {
    const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height })
    // 'Écran 2' est le PREMIER du tableau mais le plus a droite (deplace
    // apres sa creation) : la position calculee doit se baser sur lui, pas
    // sur 'Écran 1' qui apparait en second dans le tableau.
    const ecran2 = createScreenNode('Écran 2', device, { x: 2000, y: 100, w: device.width, h: device.height })
    const position = nextScreenPosition([ecran2, ecran1])
    expect(position).toEqual({ x: 2000 + device.width + SCREEN_GUTTER, y: 100 })
  })

  it('la gouttiere reste constante quelle que soit la largeur des ecrans existants', () => {
    const large = createScreenNode('Grand', device, { x: 0, y: 0, w: 1200, h: device.height })
    const position = nextScreenPosition([large])
    expect(position.x - 1200).toBe(SCREEN_GUTTER)
  })
})
