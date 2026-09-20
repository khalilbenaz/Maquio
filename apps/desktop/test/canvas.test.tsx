import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('Canvas', () => {
  it('rend un element par noeud visible', () => {
    render(<Canvas />)
    expect(screen.getByTestId('node-rect1')).toBeTruthy()
  })

  it('selectionne le noeud clique', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
  })

  it('desselectionne au clic dans le vide', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('canvas-background'))
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('ajoute a la selection avec majuscule', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
  })

  it('n emet qu une seule commande de deplacement pour tout un glissement', () => {
    render(<Canvas />)
    const el = screen.getByTestId('node-rect1')
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 30 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 30 })
    const { history, document: doc } = useEditorStore.getState()
    expect(doc.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 20, y: 30 })
    history.undo()
    expect(history.document.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 0, y: 0 })
  })

  it('affiche huit poignees quand un seul noeud est selectionne', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(screen.getAllByTestId(/^handle-/)).toHaveLength(8)
  })

  it('supprime la selection avec la touche Suppr', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByTestId('node-rect1')).toBeNull()
  })
})

// --- Tests supplementaires (decisions du brief non couvertes verbatim) ---

describe('Canvas - selection (decision 8)', () => {
  it('un clic simple sur un noeud deja selectionne avec d autres ne garde que lui', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
    fireEvent.pointerDown(screen.getByTestId('node-rect2'))
    expect(useEditorStore.getState().selection).toEqual(['rect2'])
  })

  it('Maj+clic sur un noeud deja selectionne le retire (bascule)', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
  })

  it('sur une selection de plusieurs noeuds, aucune poignee n est affichee', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(screen.queryAllByTestId(/^handle-/)).toHaveLength(0)
  })
})

describe('Canvas - redimensionnement (decision 4, meme regle que le deplacement)', () => {
  it('n emet qu une seule commande de redimensionnement pour tout un glissement de poignee', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    const handle = screen.getByTestId('handle-se')
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 55, clientY: 55 })
    fireEvent.pointerMove(window, { clientX: 70, clientY: 60 })
    fireEvent.pointerUp(window, { clientX: 70, clientY: 60 })

    const { history, document: doc } = useEditorStore.getState()
    expect(doc.pages[0]!.nodes[0]!.frame).toMatchObject({ w: 70, h: 60 })
    history.undo()
    expect(history.document.pages[0]!.nodes[0]!.frame).toMatchObject({ w: 50, h: 50 })
  })
})

describe('Canvas - raccourcis clavier (decision 7)', () => {
  it('Cmd+Z annule et Cmd+Maj+Z retablit', () => {
    render(<Canvas />)
    const el = screen.getByTestId('node-rect1')
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 30 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 30 })
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 20, y: 30 })

    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 0, y: 0 })

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 20, y: 30 })
  })

  it('Echap desselectionne', () => {
    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('ne supprime pas la selection quand le focus est dans un champ de saisie', () => {
    render(
      <>
        <input data-testid="champ-externe" />
        <Canvas />
      </>,
    )
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])

    const input = screen.getByTestId('champ-externe')
    input.focus()
    fireEvent.keyDown(input, { key: 'Delete' })

    expect(screen.getByTestId('node-rect1')).toBeTruthy()
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
  })
})

describe('Canvas - noeuds verrouilles/invisibles (decisions 6 et 8)', () => {
  it('un noeud invisible n est pas rendu', () => {
    const doc = documentDeTest()
    const [rect1, rect2] = doc.pages[0]!.nodes
    const invisible = { ...rect1!, visible: false }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [invisible, rect2!] }] })

    render(<Canvas />)

    expect(screen.queryByTestId('node-rect1')).toBeNull()
    expect(screen.getByTestId('node-rect2')).toBeTruthy()
  })

  it('un noeud verrouille n est pas selectionnable au clic', () => {
    const doc = documentDeTest()
    const [rect1, rect2] = doc.pages[0]!.nodes
    const locked = { ...rect1!, locked: true }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [locked, rect2!] }] })

    render(<Canvas />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))

    expect(useEditorStore.getState().selection).toEqual([])
  })
})

describe('Canvas - outils de creation (decision 11)', () => {
  it('pose un rectangle par cliquer-glisser sur le fond puis revient a l outil select', () => {
    render(<Canvas />)
    useEditorStore.getState().setTool('rect')

    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 200, clientY: 200 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 240 })
    fireEvent.pointerUp(window, { clientX: 250, clientY: 240 })

    const state = useEditorStore.getState()
    expect(state.tool).toBe('select')
    expect(state.selection).toHaveLength(1)

    const createdId = state.selection[0]!
    const created = state.document.pages[0]!.nodes.find((n) => n.id === createdId)
    expect(created).toBeDefined()
    expect(created?.type).toBe('rect')
    expect(created?.frame).toMatchObject({ x: 200, y: 200, w: 50, h: 40 })
  })
})
