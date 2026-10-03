import { describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, PALETTE_ITEMS, createComponentNode, createContainerNode, createScreenNode } from '@calque/core'
import type { Node } from '@calque/core'
import { placePaletteItem } from '../src/renderer/canvas/dropPlacement'

const item = (id: string) => PALETTE_ITEMS.find((i) => i.id === id)!

function screenAt(x: number, children: Node[] = []) {
  return createScreenNode('Écran', DEVICE_PRESETS.iphone15, { x, y: 0, w: 393, h: 852 }, children)
}

describe('placePaletteItem', () => {
  it('centre le composant sous le point de depot, relatif a l ecran', () => {
    const screen = screenAt(500)
    const place = placePaletteItem(item('button'), { x: 500 + 200, y: 300 }, [screen])
    expect(place.parentId).toBe(screen.id)
    // bouton 160x48 centre sur (200, 300)
    expect(place.frame).toEqual({ x: 120, y: 276, w: 160, h: 48 })
  })

  it('reste dans les limites de l ecran', () => {
    const screen = screenAt(0)
    const place = placePaletteItem(item('button'), { x: 5, y: 5 }, [screen])
    expect(place.frame.x).toBe(0)
    expect(place.frame.y).toBe(0)
    const bas = placePaletteItem(item('button'), { x: 390, y: 850 }, [screen])
    expect(bas.frame.x + bas.frame.w).toBeLessThanOrEqual(393)
    expect(bas.frame.y + bas.frame.h).toBeLessThanOrEqual(852)
  })

  it('un depot hors de tout ecran cree un noeud de premier niveau', () => {
    const place = placePaletteItem(item('button'), { x: -900, y: -900 }, [screenAt(0)])
    expect(place.parentId).toBeNull()
    expect(place.frame.x).toBe(-900 - 80)
  })

  it('depose dans le conteneur le plus profond sous le point', () => {
    const card = createContainerNode('card', { x: 20, y: 100, w: 300, h: 200 })
    const screen = screenAt(0, [card])
    const place = placePaletteItem(item('switch'), { x: 100, y: 150 }, [screen])
    expect(place.parentId).toBe(card.id)
    // relatif a la carte (20,100) : centre (80,50) pour un 240x48
    expect(place.frame).toEqual({ x: 0, y: 26, w: 240, h: 48 })
  })

  it('un depot sur un composant feuille cible son parent, pas la feuille', () => {
    const button = createComponentNode('button', { x: 40, y: 40, w: 160, h: 48 })
    const screen = screenAt(0, [button])
    const place = placePaletteItem(item('switch'), { x: 100, y: 60 }, [screen])
    expect(place.parentId).toBe(screen.id)
  })

  it('la barre d application se colle en haut, pleine largeur', () => {
    const place = placePaletteItem(item('appBar'), { x: 200, y: 500 }, [screenAt(0)])
    expect(place.frame).toEqual({ x: 0, y: 0, w: 393, h: 56 })
  })

  it('la barre de navigation basse se colle en bas, pleine largeur', () => {
    const place = placePaletteItem(item('bottomNav'), { x: 200, y: 100 }, [screenAt(0)])
    expect(place.frame).toEqual({ x: 0, y: 852 - 80, w: 393, h: 80 })
  })

  it('les onglets se placent sous la barre d application existante', () => {
    const bar = createComponentNode('appBar', { x: 0, y: 0, w: 393, h: 56 })
    const place = placePaletteItem(item('tabs'), { x: 200, y: 500 }, [screenAt(0, [bar])])
    expect(place.frame).toEqual({ x: 0, y: 56, w: 393, h: 48 })
  })

  it('le FAB se place en bas a droite, au-dessus d une barre basse', () => {
    const nav = createComponentNode('bottomNav', { x: 0, y: 772, w: 393, h: 80 })
    const place = placePaletteItem(item('fab'), { x: 10, y: 10 }, [screenAt(0, [nav])])
    expect(place.frame).toEqual({ x: 393 - 56 - 16, y: 772 - 56 - 16, w: 56, h: 56 })
  })

  it('le tiroir et la feuille basse se collent aux bords', () => {
    const tiroir = placePaletteItem(item('drawer'), { x: 300, y: 300 }, [screenAt(0)])
    expect(tiroir.frame).toEqual({ x: 0, y: 0, w: 304, h: 852 })
    const feuille = placePaletteItem(item('bottomSheet'), { x: 300, y: 300 }, [screenAt(0)])
    expect(feuille.frame).toEqual({ x: 0, y: 852 - 280, w: 393, h: 280 })
  })

  it('la boite de dialogue se centre dans l ecran', () => {
    const place = placePaletteItem(item('dialog'), { x: 10, y: 10 }, [screenAt(0)])
    expect(place.frame).toEqual({ x: Math.round((393 - 280) / 2), y: Math.round((852 - 190) / 2), w: 280, h: 190 })
  })

  it('le snackbar se place en bas, centre', () => {
    const place = placePaletteItem(item('snackbar'), { x: 10, y: 10 }, [screenAt(0)])
    expect(place.frame.y + place.frame.h).toBe(852 - 24)
  })

  it('reduit un composant plus large que son parent', () => {
    const card = createContainerNode('card', { x: 0, y: 0, w: 200, h: 200 })
    const place = placePaletteItem(item('textField'), { x: 100, y: 100 }, [screenAt(0, [card])])
    expect(place.parentId).toBe(card.id)
    expect(place.frame.w).toBeLessThanOrEqual(200)
  })
})
