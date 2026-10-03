import { describe, expect, it } from 'vitest'
import { createDocument } from '../model/document'
import { createScreenNode } from '../model/screen'
import type { CalqueDocument, Node, RectNode } from '../model/types'
import { absoluteFrame, findNode } from '../tree/tree'
import { History } from './history'
import { alignNodesCommand, distributeNodesCommand, duplicateNodesCommand, pasteNodesCommand, reorderNodeCommand } from './arrange'

const device = { id: 'd', label: 'd', width: 400, height: 800, pixelRatio: 2 }
function rect(id: string, x: number, y: number, w = 50, h = 50): RectNode {
  return { id, name: id, type: 'rect', frame: { x, y, w, h }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }
}
function doc(children: Node[]): CalqueDocument {
  const d = createDocument('t')
  const s = { ...createScreenNode('E', device, { x: 100, y: 0, w: 400, h: 800 }, children), id: 's1' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [s] }] }
}
const pid = (d: CalqueDocument) => d.pages[0]!.id
const kids = (d: CalqueDocument) => (d.pages[0]!.nodes[0] as { children: Node[] }).children

describe('reorderNodeCommand', () => {
  it('avance, recule, premier plan, arriere-plan ; annulable', () => {
    const h = new History(doc([rect('a', 0, 0), rect('b', 0, 0), rect('c', 0, 0)]))
    const p = pid(h.document)
    h.execute(reorderNodeCommand(p, 'a', 'front'))
    expect(kids(h.document).map((n) => n.id)).toEqual(['b', 'c', 'a'])
    h.execute(reorderNodeCommand(p, 'a', 'backward'))
    expect(kids(h.document).map((n) => n.id)).toEqual(['b', 'a', 'c'])
    h.execute(reorderNodeCommand(p, 'c', 'back'))
    expect(kids(h.document).map((n) => n.id)).toEqual(['c', 'b', 'a'])
    h.undo(); h.undo(); h.undo()
    expect(kids(h.document).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
  it('reordonne les ecrans de premier niveau', () => {
    const d = doc([])
    const s2 = { ...createScreenNode('F', device, { x: 600, y: 0, w: 400, h: 800 }), id: 's2' }
    const h = new History({ ...d, pages: [{ ...d.pages[0]!, nodes: [...d.pages[0]!.nodes, s2] }] })
    h.execute(reorderNodeCommand(pid(h.document), 's1', 'forward'))
    expect(h.document.pages[0]!.nodes.map((n) => n.id)).toEqual(['s2', 's1'])
  })
  it('sans effet en bout de course', () => {
    const h = new History(doc([rect('a', 0, 0), rect('b', 0, 0)]))
    h.execute(reorderNodeCommand(pid(h.document), 'b', 'forward'))
    expect(kids(h.document).map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('alignNodesCommand', () => {
  it('aligne plusieurs noeuds sur leur boite englobante', () => {
    const h = new History(doc([rect('a', 10, 10), rect('b', 100, 200, 20, 20)]))
    const p = pid(h.document)
    h.execute(alignNodesCommand(p, ['a', 'b'], 'left'))
    expect(kids(h.document).map((n) => n.frame.x)).toEqual([10, 10])
    h.execute(alignNodesCommand(p, ['a', 'b'], 'bottom'))
    expect(kids(h.document).map((n) => n.frame.y + n.frame.h)).toEqual([220, 220])
    h.execute(alignNodesCommand(p, ['a', 'b'], 'hcenter'))
    const c = kids(h.document).map((n) => n.frame.x + n.frame.w / 2)
    expect(c[0]).toBe(c[1])
    h.undo(); h.undo(); h.undo()
    expect(kids(h.document)[1]!.frame).toEqual({ x: 100, y: 200, w: 20, h: 20 })
  })
  it('un seul noeud : aligne sur son ecran, quels que soient les decalages absolus', () => {
    const h = new History(doc([rect('a', 10, 10, 100, 50)]))
    h.execute(alignNodesCommand(pid(h.document), ['a'], 'right'))
    expect(kids(h.document)[0]!.frame.x).toBe(300)
    h.execute(alignNodesCommand(pid(h.document), ['a'], 'vcenter'))
    expect(kids(h.document)[0]!.frame.y).toBe(375)
  })
})

describe('distributeNodesCommand', () => {
  it('egalise les ecarts horizontaux en gardant les extremes', () => {
    const h = new History(doc([rect('a', 0, 0), rect('b', 60, 0), rect('c', 250, 0)]))
    h.execute(distributeNodesCommand(pid(h.document), ['a', 'b', 'c'], 'horizontal'))
    expect(kids(h.document).map((n) => n.frame.x)).toEqual([0, 125, 250])
    h.undo()
    expect(kids(h.document).map((n) => n.frame.x)).toEqual([0, 60, 250])
  })
  it('verticalement ; moins de 3 noeuds : rien', () => {
    const h = new History(doc([rect('a', 0, 0), rect('b', 0, 10), rect('c', 0, 250)]))
    h.execute(distributeNodesCommand(pid(h.document), ['a', 'b', 'c'], 'vertical'))
    expect(kids(h.document).map((n) => n.frame.y)).toEqual([0, 125, 250])
    const h2 = new History(doc([rect('a', 0, 0), rect('b', 0, 10)]))
    const before = h2.document
    h2.execute(distributeNodesCommand(pid(h2.document), ['a', 'b'], 'vertical'))
    expect(kids(h2.document)).toEqual(kids(before))
  })
})

describe('duplication et collage', () => {
  it('duplique avec de nouveaux ids, decale, dans le meme parent ; un annuler', () => {
    const h = new History(doc([rect('a', 10, 10)]))
    const { command, newIds } = duplicateNodesCommand(pid(h.document), ['a'], h.document.pages[0]!.nodes)
    h.execute(command)
    expect(kids(h.document)).toHaveLength(2)
    expect(newIds[0]).not.toBe('a')
    expect(findNode(h.document.pages[0]!.nodes, newIds[0]!)!.frame).toMatchObject({ x: 26, y: 26 })
    h.undo()
    expect(kids(h.document)).toHaveLength(1)
  })
  it('colle un ecran a droite des autres, sans doublon d identifiant', () => {
    const d = doc([rect('a', 0, 0)])
    const screen = d.pages[0]!.nodes[0]!
    const { command, newIds } = pasteNodesCommand(pid(d), null, [screen], 0, d.pages[0]!.nodes)
    const h = new History(d)
    h.execute(command)
    const nodes = h.document.pages[0]!.nodes
    expect(nodes).toHaveLength(2)
    expect(absoluteFrame(nodes, newIds[0]!).x).toBe(540)
    const ids = new Set<string>()
    const collect = (ns: Node[]) => ns.forEach((n) => { ids.add(n.id); if (n.type === 'frame') collect(n.children) })
    collect(nodes)
    expect(ids.size).toBe(4)
  })
})
