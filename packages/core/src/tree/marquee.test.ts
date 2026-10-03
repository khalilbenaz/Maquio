import { describe, expect, it } from 'vitest'
import { createScreenNode } from '../model/screen'
import { marqueeSelect } from './marquee'
import type { FrameNode, Node, RectNode } from '../model/types'

function rect(id: string, x: number, y: number, w = 50, h = 50, extra: Partial<RectNode> = {}): RectNode {
  return { id, name: id, type: 'rect', frame: { x, y, w, h }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0, ...extra }
}
function screenWith(children: Node[]): FrameNode {
  return { ...createScreenNode('Ecran', { id: 'iphone', label: 'iPhone', width: 393, height: 852, pixelRatio: 3 }, { x: 100, y: 100, w: 393, h: 852 }, children), id: 's1' }
}

describe('marqueeSelect', () => {
  it('retient les noeuds dont le cadre absolu coupe le rectangle (coordonnees de page)', () => {
    const nodes = [screenWith([rect('a', 10, 10), rect('b', 200, 10)])]
    // a est a (110,110) en page ; b a (300,110)
    expect(marqueeSelect(nodes, { x: 90, y: 90, w: 100, h: 100 })).toEqual(['a'])
    expect(marqueeSelect(nodes, { x: 90, y: 90, w: 400, h: 100 })).toEqual(['a', 'b'])
  })
  it('ignore les noeuds verrouilles et invisibles', () => {
    const nodes = [screenWith([rect('a', 10, 10, 50, 50, { locked: true }), rect('b', 10, 80, 50, 50, { visible: false })])]
    expect(marqueeSelect(nodes, { x: 0, y: 0, w: 500, h: 500 })).toEqual(['s1'])
  })
  it('ne retient que le parent quand il est coupe avec ses enfants', () => {
    const frame: FrameNode = { ...createScreenNode('f', { id: 'd', label: 'd', width: 1, height: 1, pixelRatio: 1 }, { x: 0, y: 0, w: 100, h: 100 }, [rect('c', 10, 10)]), id: 'f', device: undefined }
    expect(marqueeSelect([screenWith([frame])], { x: 100, y: 100, w: 300, h: 300 })).toEqual(['f'])
  })
  it('retombe sur l\'ecran coupe quand aucun noeud ordinaire ne l\'est', () => {
    expect(marqueeSelect([screenWith([rect('a', 300, 300)])], { x: 120, y: 120, w: 20, h: 20 })).toEqual(['s1'])
  })
  it('un rectangle vide ne selectionne rien', () => {
    expect(marqueeSelect([screenWith([rect('a', 0, 0)])], { x: 0, y: 0, w: 0, h: 0 })).toEqual([])
  })
  it('fonctionne sur une page sans ecran (noeuds de premier niveau)', () => {
    expect(marqueeSelect([rect('r1', 0, 0), rect('r2', 100, 100)], { x: 90, y: 90, w: 100, h: 100 })).toEqual(['r2'])
  })
})
