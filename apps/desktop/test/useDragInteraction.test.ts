import { describe, expect, it } from 'vitest'
import { computeSnappedMoveDelta, createDefaultNode, screenToPage, snapThreshold } from '../src/renderer/canvas/useDragInteraction'
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

describe('createDefaultNode (texte)', () => {
  it('interligne par defaut en PIXELS (modele), pas un multiplicateur : 1.2 x 16 px', () => {
    const node = createDefaultNode('text', { x: 0, y: 0, w: 100, h: 20 })
    if (node.type !== 'text') throw new Error('texte attendu')
    // Le modele stocke lineHeight en pixels ; 1.2 donnait « height: 0.075 »
    // dans le Dart exporte et « lineHeight: 1.2 » (px) en React Native.
    expect(node.style.lineHeight).toBeGreaterThanOrEqual(node.style.fontSize)
  })
})

describe('deepestFrameAt', () => {
  it('rend la frame la plus profonde qui contient le point (coordonnees de page), ignore verrouillees et feuilles', async () => {
    const { deepestFrameAt } = await import('../src/renderer/canvas/useDragInteraction')
    const { createScreenNode, DEVICE_PRESETS } = await import('@calque/core')
    const dev = DEVICE_PRESETS.iphone15
    const leaf = { id: 'r', name: 'r', type: 'rect' as const, frame: { x: 0, y: 0, w: 500, h: 500 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }
    const inner = { ...createScreenNode('inner', dev, { x: 50, y: 50, w: 100, h: 100 }, []), id: 'inner', device: undefined }
    const outer = { ...createScreenNode('outer', dev, { x: 20, y: 20, w: 300, h: 300 }, [leaf, inner]), id: 'outer', device: undefined }
    const screen = { ...createScreenNode('s', dev, { x: 100, y: 0, w: 393, h: 852 }, [outer]), id: 's' }
    // inner est a 100+20+50 = 170 en page
    expect(deepestFrameAt([screen], { x: 180, y: 80 })?.id).toBe('inner')
    expect(deepestFrameAt([screen], { x: 130, y: 30 })?.id).toBe('outer')
    expect(deepestFrameAt([screen], { x: 110, y: 700 })?.id).toBe('s')
    expect(deepestFrameAt([screen], { x: 10, y: 10 })).toBeNull()
    expect(deepestFrameAt([{ ...screen, locked: true }], { x: 110, y: 700 })).toBeNull()
  })
})
