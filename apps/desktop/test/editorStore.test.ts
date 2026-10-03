import { beforeEach, describe, expect, it } from 'vitest'
import { createNodeCommand, findNode } from '@calque/core'
import type { FrameNode, RectNode } from '@calque/core'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('useEditorStore', () => {
  it('charge un document et derive pageId/selection/tool/zoom/pan', () => {
    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes.map((n) => n.id)).toEqual(['rect1', 'rect2'])
    expect(state.pageId).toBe(state.document.pages[0]!.id)
    expect(state.selection).toEqual([])
    expect(state.tool).toBe('select')
    expect(state.zoom).toBe(1)
    expect(state.pan).toEqual({ x: 0, y: 0 })
  })

  it('select remplace la selection', () => {
    useEditorStore.getState().select(['rect1'])
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
    useEditorStore.getState().select(['rect1', 'rect2'])
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
  })

  it('execute applique la commande et met a jour document ET history.document ensemble', () => {
    const { pageId, execute } = useEditorStore.getState()
    execute(
      createNodeCommand(pageId, null, {
        id: 'n1',
        name: 'Nouveau',
        type: 'rect',
        frame: { x: 0, y: 0, w: 10, h: 10 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        fills: [],
        strokes: [],
        cornerRadius: 0,
      }),
    )
    const state = useEditorStore.getState()
    expect(state.document).toBe(state.history.document)
    expect(findNode(state.document.pages[0]!.nodes, 'n1')).not.toBeNull()
    expect(state.history.canUndo).toBe(true)
  })

  it('undo et redo restaurent le document derive de history', () => {
    const { pageId, execute, undo, redo } = useEditorStore.getState()
    execute(
      createNodeCommand(pageId, null, {
        id: 'n1',
        name: 'Nouveau',
        type: 'rect',
        frame: { x: 0, y: 0, w: 10, h: 10 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        fills: [],
        strokes: [],
        cornerRadius: 0,
      }),
    )
    undo()
    expect(findNode(useEditorStore.getState().document.pages[0]!.nodes, 'n1')).toBeNull()
    redo()
    expect(findNode(useEditorStore.getState().document.pages[0]!.nodes, 'n1')).not.toBeNull()
  })

  it('setTool change l outil courant', () => {
    useEditorStore.getState().setTool('rect')
    expect(useEditorStore.getState().tool).toBe('rect')
  })

  it('setZoom et setPan existent et mettent a jour le magasin', () => {
    useEditorStore.getState().setZoom(2)
    useEditorStore.getState().setPan({ x: 10, y: -5 })
    const state = useEditorStore.getState()
    expect(state.zoom).toBe(2)
    expect(state.pan).toEqual({ x: 10, y: -5 })
  })

  it('load reinitialise la selection, l outil, le zoom et le pan', () => {
    const store = useEditorStore.getState()
    store.select(['rect1'])
    store.setTool('rect')
    store.setZoom(3)
    store.setPan({ x: 5, y: 5 })

    useEditorStore.getState().load(documentDeTest())

    const state = useEditorStore.getState()
    expect(state.selection).toEqual([])
    expect(state.tool).toBe('select')
    expect(state.zoom).toBe(1)
    expect(state.pan).toEqual({ x: 0, y: 0 })
  })

  // v3 (composants mobiles) : toute commande est suivie de la mise en page
  // automatique, dans la meme entree d'historique.
  it('execute re-cale les enfants d une frame en ligne, et un seul annuler defait tout', () => {
    const { pageId, execute, undo } = useEditorStore.getState()
    const rect = (id: string, w: number): RectNode => ({
      id, name: id, type: 'rect', frame: { x: 0, y: 0, w, h: 10 },
      visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0,
    })
    const rangee: FrameNode = {
      id: 'rangee', name: 'rangee', type: 'frame', frame: { x: 0, y: 200, w: 300, h: 50 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'row', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [rect('a', 40), rect('b', 40)],
    }
    execute(createNodeCommand(pageId, null, rangee))
    const enfants = () => (findNode(useEditorStore.getState().document.pages[0]!.nodes, 'rangee') as FrameNode).children
    expect(enfants().map((c) => c.frame.x)).toEqual([0, 50])
    undo()
    expect(findNode(useEditorStore.getState().document.pages[0]!.nodes, 'rangee')).toBeNull()
  })
})
