import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createNodeCommand, createScreenNode } from '@calque/core'
import type { CalqueDocument, DevicePreset, FrameNode, Node as CalqueNode, RectNode } from '@calque/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { LayersPanel } from '../src/renderer/panels/LayersPanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'

// Document imbrique dedie a cette suite : une frame ('frame1') contenant un
// seul enfant ('child1'), plus un noeud de premier niveau ('rect2'), pour
// tester le repli/depli, le glisser-depose et le refus de cycle sans
// dependre du document plat de documentDeTest (rect1/rect2 sans hierarchie).
function rectNode(id: string, x: number, y: number): RectNode {
  return {
    id,
    name: id,
    type: 'rect',
    frame: { x, y, w: 50, h: 50 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
    cornerRadius: 0,
  }
}

function frameNode(id: string, children: CalqueNode[]): FrameNode {
  return {
    id,
    name: id,
    type: 'frame',
    frame: { x: 0, y: 0, w: 200, h: 200 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    layout: {
      mode: 'absolute',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      alignMain: 'start',
      alignCross: 'start',
    },
    fills: [],
    strokes: [],
    cornerRadius: 0,
    clipsContent: false,
    children,
  }
}

function nestedDocument(): CalqueDocument {
  const doc = createDocument('Document imbrique')
  const child = rectNode('child1', 10, 10)
  const frame1 = frameNode('frame1', [child])
  const rect2 = rectNode('rect2', 300, 300)
  return { ...doc, pages: [{ ...doc.pages[0]!, nodes: [frame1, rect2] }] }
}

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('LayersPanel', () => {
  it('utilise les roles tree et treeitem', () => {
    render(<LayersPanel />)
    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0)
  })

  it('synchronise la selection avec le canvas dans les deux sens', () => {
    render(
      <>
        <LayersPanel />
        <Canvas api={apiFactice} />
      </>,
    )
    fireEvent.click(screen.getByTestId('layer-rect2'))
    expect(useEditorStore.getState().selection).toEqual(['rect2'])

    // Appel direct au magasin (pas via fireEvent) : avec useSyncExternalStore
    // (zustand), une mutation venue de l'exterieur d'un gestionnaire React
    // est bien planifiee en priorite synchrone, mais son rendu n'est
    // effectivement applique qu'a la prochaine purge du travail React -- il
    // faut donc l'envelopper dans act() pour observer la mise a jour du DOM
    // immediatement apres, sans quoi aria-selected resterait sur son
    // ancienne valeur au moment de l'assertion suivante.
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    expect(screen.getByTestId('layer-rect1').getAttribute('aria-selected')).toBe('true')
  })

  it('bascule la visibilite sans changer la selection', () => {
    useEditorStore.getState().select(['rect2'])
    render(<LayersPanel />)
    fireEvent.click(screen.getByTestId('layer-visibility-rect1'))

    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes[0]!.visible).toBe(false)
    expect(state.selection).toEqual(['rect2'])
  })

  it('bascule le verrou sans changer la selection (decision 7)', () => {
    useEditorStore.getState().select(['rect2'])
    render(<LayersPanel />)
    fireEvent.click(screen.getByTestId('layer-lock-rect1'))

    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes[0]!.locked).toBe(true)
    expect(state.selection).toEqual(['rect2'])
  })

  it('replie une frame pour masquer ses enfants puis les reaffiche', () => {
    useEditorStore.getState().load(nestedDocument())
    render(<LayersPanel />)

    expect(screen.getByTestId('layer-child1')).toBeTruthy()

    fireEvent.click(screen.getByTestId('layer-toggle-frame1'))
    expect(screen.queryByTestId('layer-child1')).toBeNull()

    fireEvent.click(screen.getByTestId('layer-toggle-frame1'))
    expect(screen.getByTestId('layer-child1')).toBeTruthy()
  })

  it('le glisser-depose sur une frame emet reparentNodeCommand (decision 6)', () => {
    useEditorStore.getState().load(nestedDocument())
    render(<LayersPanel />)

    fireEvent.dragStart(screen.getByTestId('layer-rect2'))
    fireEvent.drop(screen.getByTestId('layer-frame1'))

    const state = useEditorStore.getState()
    expect(state.history.undoLabels).toHaveLength(1)
    const frame1 = state.document.pages[0]!.nodes.find((n) => n.id === 'frame1') as FrameNode
    expect(frame1.children.map((c) => c.id)).toContain('rect2')
  })

  it('refuse de deposer un noeud dans son propre descendant, sans lever (decision 6)', () => {
    useEditorStore.getState().load(nestedDocument())
    render(<LayersPanel />)

    fireEvent.dragStart(screen.getByTestId('layer-frame1'))
    expect(() => fireEvent.drop(screen.getByTestId('layer-child1'))).not.toThrow()

    const state = useEditorStore.getState()
    expect(state.history.canUndo).toBe(false)
    expect(state.document.pages[0]!.nodes.map((n) => n.id)).toEqual(['frame1', 'rect2'])
  })

  // Finition v1 (maquette Empty.dc.html) : sans ce message, une page sans
  // noeud laissait le panneau simplement vide, sans rien pour indiquer que
  // c'est l'etat attendu.
  it("affiche l etat vide quand la page n a aucun noeud, et le fait disparaitre des qu un calque est cree", () => {
    useEditorStore.getState().load(createDocument('Document vide'))
    render(<LayersPanel />)

    expect(screen.getByText("Aucun calque pour l'instant.")).toBeTruthy()
    expect(screen.getByText('Les éléments que vous tracez apparaissent ici, du fond vers le dessus.')).toBeTruthy()

    act(() => {
      const { pageId, execute } = useEditorStore.getState()
      execute(createNodeCommand(pageId, null, rectNode('r1', 0, 0)))
    })

    expect(screen.queryByText("Aucun calque pour l'instant.")).toBeNull()
    expect(screen.getByTestId('layer-r1')).toBeTruthy()
  })
})

// v2 (addendum navigation §4 : « la duplication d'un écran existant est
// disponible depuis le panneau des calques »).
describe('LayersPanel - duplication d un ecran (v2, addendum navigation)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function documentAvecUnEcran(): CalqueDocument {
    const doc = createDocument('Document de test')
    const bouton = rectNode('bouton', 10, 10)
    const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height }, [bouton])
    return { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecran1] }] }
  }

  it('le bouton de duplication n apparait que sur un ecran de premier niveau', () => {
    useEditorStore.getState().load(documentAvecUnEcran())
    render(<LayersPanel />)
    expect(screen.getByTestId(/layer-duplicate-/)).toBeTruthy()
    expect(screen.queryByTestId('layer-duplicate-bouton')).toBeNull()
  })

  it('duplique l ecran (contenu compris) avec de nouveaux identifiants, sans chevaucher l original', () => {
    const doc = documentAvecUnEcran()
    const original = doc.pages[0]!.nodes[0] as FrameNode
    useEditorStore.getState().load(doc)
    render(<LayersPanel />)

    act(() => {
      fireEvent.click(screen.getByTestId(`layer-duplicate-${original.id}`))
    })

    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes).toHaveLength(2)
    const clone = state.document.pages[0]!.nodes[1] as FrameNode
    expect(clone.id).not.toBe(original.id)
    expect(clone.frame.x).toBeGreaterThan(original.frame.x + original.frame.w - 1)
    expect(clone.children).toHaveLength(1)
    expect(clone.children[0]!.id).not.toBe(original.children[0]!.id)
    expect(clone.children[0]!.name).toBe(original.children[0]!.name)
  })
})

// Correctif parentage (v2, addendum navigation) : une fois un element trace
// ou glisse a l'interieur d'un ecran REELLEMENT devenu son enfant (voir
// canvas.test.tsx, useDragInteraction.ts), le panneau des calques doit le
// montrer -- imbrique, indente, sous cet ecran -- et non plus comme un
// simple frere de premier niveau qui se trouverait visuellement dessus.
describe('LayersPanel - imbrication reelle des ecrans (correctif parentage)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function documentEcranAvecContenu(): CalqueDocument {
    const doc = createDocument('Document de test')
    const bouton = rectNode('bouton', 10, 10)
    const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height }, [bouton])
    return { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecran1] }] }
  }

  it("l'element trace dans l'ecran apparait indente SOUS lui dans l'arborescence, pas comme un frere de premier niveau", () => {
    const doc = documentEcranAvecContenu()
    const ecran1 = doc.pages[0]!.nodes[0] as FrameNode
    useEditorStore.getState().load(doc)
    render(<LayersPanel />)

    // Racine de l'arborescence : uniquement l'ecran, pas le bouton.
    const arbre = screen.getByRole('tree')
    const racines = Array.from(arbre.children)
    expect(racines).toHaveLength(1)

    // Le bouton est bien rendu, mais a l'INTERIEUR du <li> racine de
    // l'ecran (qui porte sa propre ligne ET son groupe <ul role="group">
    // d'enfants), pas comme un <li> frere au meme niveau de l'arborescence.
    const ligneEcran = screen.getByTestId(`layer-${ecran1.id}`)
    const ligneBouton = screen.getByTestId('layer-bouton')
    expect(racines[0]!.contains(ligneBouton)).toBe(true)

    // Indentation reelle (paddingLeft croissant avec la profondeur, voir
    // LayerRow) : le bouton (profondeur 1) est plus indente que l'ecran
    // (profondeur 0).
    const indentEcran = Number(ligneEcran.style.paddingLeft.replace('px', '')) || 0
    const indentBouton = Number(ligneBouton.style.paddingLeft.replace('px', '')) || 0
    expect(indentBouton).toBeGreaterThan(indentEcran)
  })
})
