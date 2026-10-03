import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createScreenNode } from '@calque/core'
import type { CalqueDocument, Node, RectNode } from '@calque/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { InspectorPanel } from '../src/renderer/panels/InspectorPanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { apiFactice } from './helpers/apiFactice'

function rect(id: string, x: number, y: number, w = 50, h = 50): RectNode {
  return { id, name: id, type: 'rect', frame: { x, y, w, h }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }
}
function docDeTest(): CalqueDocument {
  const d = createDocument('t')
  const dev = { id: 'd', label: 'd', width: 400, height: 800, pixelRatio: 2 }
  const s = { ...createScreenNode('Ecran 1', dev, { x: 0, y: 0, w: 400, h: 800 }, [rect('a', 10, 10), rect('b', 100, 200), rect('c', 300, 400)]), id: 's1' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [s] }] }
}
const store = () => useEditorStore.getState()
const kids = () => (store().document.pages[0]!.nodes[0] as { children: Node[] }).children

beforeEach(() => store().load(docDeTest()))

describe('agencement : raccourcis et presse-papiers', () => {
  it('Cmd+D duplique la selection et selectionne les copies (un annuler)', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['a'])
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(kids()).toHaveLength(4)
    expect(store().selection).toHaveLength(1)
    expect(store().selection[0]).not.toBe('a')
    store().undo()
    expect(kids()).toHaveLength(3)
  })
  it('copier / coller (evenements DOM du menu Edition), collages successifs decales', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['a'])
    fireEvent(window, new Event('copy', { cancelable: true }))
    fireEvent(window, new Event('paste', { cancelable: true }))
    fireEvent(window, new Event('paste', { cancelable: true }))
    expect(kids()).toHaveLength(5)
    const xs = kids().slice(3).map((n) => n.frame.x)
    expect(xs).toEqual([26, 42])
  })
  it('couper retire puis coller recree', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['b'])
    fireEvent(window, new Event('cut', { cancelable: true }))
    expect(kids().map((n) => n.id)).toEqual(['a', 'c'])
    fireEvent(window, new Event('paste', { cancelable: true }))
    expect(kids()).toHaveLength(3)
  })
  it('Cmd+G groupe, Cmd+Maj+G degroupe', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['a', 'b'])
    fireEvent.keyDown(window, { key: 'g', metaKey: true })
    expect(kids().map((n) => n.type)).toEqual(['frame', 'rect'])
    const g = kids()[0]!
    expect(store().selection).toEqual([g.id])
    fireEvent.keyDown(window, { key: 'g', metaKey: true, shiftKey: true })
    expect(kids().map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
  })
  it('Cmd+] / Cmd+[ changent l ordre', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['a'])
    fireEvent.keyDown(window, { key: ']', metaKey: true })
    expect(kids().map((n) => n.id)).toEqual(['b', 'a', 'c'])
    fireEvent.keyDown(window, { key: ']', metaKey: true, shiftKey: true })
    expect(kids().map((n) => n.id)).toEqual(['b', 'c', 'a'])
    fireEvent.keyDown(window, { key: '[', metaKey: true, shiftKey: true })
    expect(kids().map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
  it('les fleches deplacent de 1 px, 10 avec Maj', () => {
    render(<Canvas api={apiFactice} />)
    store().select(['a'])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true })
    expect(kids()[0]!.frame).toMatchObject({ x: 11, y: 20 })
  })
})

describe('agencement : inspecteur', () => {
  it('aligner, distribuer et renommer depuis l inspecteur', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => store().select(['a', 'b', 'c']))
    fireEvent.click(screen.getByRole('button', { name: 'Aligner à gauche' }))
    expect(kids().map((n) => n.frame.x)).toEqual([10, 10, 10])
    fireEvent.click(screen.getByRole('button', { name: 'Distribuer verticalement' }))
    expect(kids().map((n) => n.frame.y)).toEqual([10, 225, 400])
  })
  it('renomme un calque', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => store().select(['a']))
    const champ = screen.getByLabelText('Nom du calque')
    fireEvent.change(champ, { target: { value: 'Logo' } })
    fireEvent.blur(champ)
    expect(kids()[0]!.name).toBe('Logo')
  })
  it('Grouper est desactive pour un seul noeud, Distribuer sous 3 noeuds', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => store().select(['a']))
    expect((screen.getByRole('button', { name: 'Grouper' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Distribuer horizontalement' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
