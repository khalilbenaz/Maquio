import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { COMPONENT_DEFINITIONS, createDocument, createScreenNode, setLinkCommand, tapNavigation } from '@calque/core'
import type { CalqueDocument, DevicePreset, FrameNode, RectNode } from '@calque/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { computeFitTransform } from '../src/renderer/canvas/viewport'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('Canvas', () => {
  it('rend un element par noeud visible', () => {
    render(<Canvas api={apiFactice} />)
    expect(screen.getByTestId('node-rect1')).toBeTruthy()
  })

  it('selectionne le noeud clique', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
  })

  it('desselectionne au clic dans le vide', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('canvas-background'))
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('ajoute a la selection avec majuscule', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
  })

  it('n emet qu une seule commande de deplacement pour tout un glissement', () => {
    render(<Canvas api={apiFactice} />)
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
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(screen.getAllByTestId(/^handle-/)).toHaveLength(8)
  })

  it('supprime la selection avec la touche Suppr', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(screen.queryByTestId('node-rect1')).toBeNull()
  })
})

// --- Tests supplementaires (decisions du brief non couvertes verbatim) ---

describe('Canvas - selection (decision 8)', () => {
  it('un clic simple sur un noeud deja selectionne avec d autres ne garde que lui', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
    fireEvent.pointerDown(screen.getByTestId('node-rect2'))
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['rect2'])
  })

  it('glisser un noeud d une multi-selection deplace toute la selection, en une seule commande annulable', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    const avant = useEditorStore.getState().document.pages[0]!.nodes.map((n) => ({ x: n.frame.x, y: n.frame.y }))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 30 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 30 })
    const state = useEditorStore.getState()
    expect(state.selection).toEqual(['rect1', 'rect2'])
    const apres = state.document.pages[0]!.nodes
    expect(apres[0]!.frame).toMatchObject({ x: avant[0]!.x + 20, y: avant[0]!.y + 30 })
    expect(apres[1]!.frame).toMatchObject({ x: avant[1]!.x + 20, y: avant[1]!.y + 30 })
    state.history.undo()
    const annule = state.history.document.pages[0]!.nodes.map((n) => ({ x: n.frame.x, y: n.frame.y }))
    expect(annule).toEqual(avant)
  })

  it('Maj+clic sur un noeud deja selectionne le retire (bascule)', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
  })

  it('sur une selection de plusieurs noeuds, aucune poignee n est affichee', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    expect(screen.queryAllByTestId(/^handle-/)).toHaveLength(0)
  })
})

describe('Canvas - redimensionnement (decision 4, meme regle que le deplacement)', () => {
  it('n emet qu une seule commande de redimensionnement pour tout un glissement de poignee', () => {
    render(<Canvas api={apiFactice} />)
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
    render(<Canvas api={apiFactice} />)
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
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('ne supprime pas la selection quand le focus est dans un champ de saisie', () => {
    render(
      <>
        <input data-testid="champ-externe" />
        <Canvas api={apiFactice} />
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

    render(<Canvas api={apiFactice} />)

    expect(screen.queryByTestId('node-rect1')).toBeNull()
    expect(screen.getByTestId('node-rect2')).toBeTruthy()
  })

  it('un noeud verrouille n est pas selectionnable au clic', () => {
    const doc = documentDeTest()
    const [rect1, rect2] = doc.pages[0]!.nodes
    const locked = { ...rect1!, locked: true }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [locked, rect2!] }] })

    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))

    expect(useEditorStore.getState().selection).toEqual([])
  })
})

describe('Canvas - outils de creation (decision 11)', () => {
  it('pose un rectangle par cliquer-glisser sur le fond puis revient a l outil select', () => {
    render(<Canvas api={apiFactice} />)
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

  // Defaut n3 (« comment mettre l'image ? »), tests requis par le brief :
  // le tracé d'un nœud Image ouvre le sélecteur de fichier natif, et
  // n'en crée aucun si l'utilisateur annule.
  it('le trace d un noeud image appelle le selecteur de fichier et n en cree aucun si l utilisateur annule', async () => {
    const chooseImage = vi.fn(async () => null)
    render(<Canvas api={{ ...apiFactice, chooseImage }} />)
    useEditorStore.getState().setTool('image')

    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 50 })
    fireEvent.pointerUp(window, { clientX: 60, clientY: 50 })

    expect(chooseImage).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(useEditorStore.getState().tool).toBe('select'))

    // documentDeTest() ne porte que rect1/rect2 : aucun troisieme noeud
    // n'a ete ajoute, et aucune commande n'a alimente l'historique.
    expect(useEditorStore.getState().document.pages[0]!.nodes).toHaveLength(2)
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  it('cree un noeud image avec le chemin choisi une fois le fichier selectionne', async () => {
    const chooseImage = vi.fn(async () => '/Users/lilou/Images/photo.png')
    render(<Canvas api={{ ...apiFactice, chooseImage }} />)
    useEditorStore.getState().setTool('image')

    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 60, clientY: 50 })
    fireEvent.pointerUp(window, { clientX: 60, clientY: 50 })

    await waitFor(() => expect(useEditorStore.getState().tool).toBe('select'))

    const state = useEditorStore.getState()
    expect(state.selection).toHaveLength(1)
    const created = state.document.pages[0]!.nodes.find((n) => n.id === state.selection[0])
    expect(created?.type).toBe('image')
    expect(created && 'src' in created ? created.src : undefined).toBe('/Users/lilou/Images/photo.png')
  })

  // Defaut n3 : le canevas doit reellement afficher l'image, pas un cadre
  // vide -- verifie ici a partir du document (plutot que du tracé complet,
  // deja couvert au-dessus) pour tester precisement le rendu de NodeView.
  it('affiche une <img> pour un noeud image dont le src est renseigne', () => {
    const doc = documentDeTest()
    const rect2 = doc.pages[0]!.nodes[1]!
    const image = {
      id: 'rect1',
      name: 'rect1',
      type: 'image' as const,
      frame: { x: 0, y: 0, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      src: '/Users/lilou/Images/photo.png',
      fit: 'cover' as const,
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [image, rect2] }] })

    render(<Canvas api={apiFactice} />)
    const img = screen.getByTestId('node-rect1').querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('file:///Users/lilou/Images/photo.png')
  })

  it('affiche un espace reserve (pas d image cassee) pour un noeud image dont le src est vide', () => {
    const doc = documentDeTest()
    const rect2 = doc.pages[0]!.nodes[1]!
    const image = {
      id: 'rect1',
      name: 'rect1',
      type: 'image' as const,
      frame: { x: 0, y: 0, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      src: '',
      fit: 'cover' as const,
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [image, rect2] }] })

    render(<Canvas api={apiFactice} />)
    expect(screen.getByTestId('node-rect1').querySelector('img')).toBeNull()
  })
})

describe('Canvas - nettoyage au demontage (Critical, round de correction 1)', () => {
  it('retire les ecouteurs window si le composant est demonte en plein glissement', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })
    // Pas de pointerup : le geste est abandonne en plein vol par le demontage.

    unmount()

    const countCalls = (spy: typeof addSpy, type: string) =>
      spy.mock.calls.filter(([eventType]) => eventType === type).length

    expect(countCalls(removeSpy, 'pointermove')).toBe(countCalls(addSpy, 'pointermove'))
    expect(countCalls(removeSpy, 'pointerup')).toBe(countCalls(addSpy, 'pointerup'))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('un pointerup tardif apres demontage et chargement d un autre document n execute aucune commande fantome', () => {
    const { unmount } = render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 10 })

    unmount()

    // Exactement le scenario cite pour justifier le garde-fou "un seul
    // geste actif" : un nouveau document est charge avant que le pointerup
    // du geste abandonne n'arrive.
    useEditorStore.getState().load(documentDeTest())

    fireEvent.pointerUp(window, { clientX: 20, clientY: 30 })

    const state = useEditorStore.getState()
    expect(state.history.canUndo).toBe(false)
    expect(state.document.pages[0]!.nodes[0]!.frame).toMatchObject({ x: 0, y: 0 })
  })
})

describe('Canvas - suppression multiple (points a traiter, round de correction 1)', () => {
  it('supprime toute la selection en une seule commande : un seul undo restaure les trois noeuds a leur position exacte', () => {
    const doc = documentDeTest()
    const [rect1, rect2] = doc.pages[0]!.nodes
    const rect3 = { ...rect1!, id: 'rect3', name: 'rect3', frame: { x: 200, y: 200, w: 50, h: 50 } }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [rect1!, rect2!, rect3] }] })

    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerDown(screen.getByTestId('node-rect2'), { shiftKey: true })
    fireEvent.pointerDown(screen.getByTestId('node-rect3'), { shiftKey: true })
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2', 'rect3'])

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useEditorStore.getState().document.pages[0]!.nodes).toHaveLength(0)
    expect(useEditorStore.getState().history.canUndo).toBe(true)

    useEditorStore.getState().undo()

    const state = useEditorStore.getState()
    expect(state.history.canUndo).toBe(false)
    expect(state.document.pages[0]!.nodes.map((n) => n.id)).toEqual(['rect1', 'rect2', 'rect3'])
    expect(state.document.pages[0]!.nodes[2]!.frame).toMatchObject({ x: 200, y: 200 })
  })
})

// --- Tests ajoutes par la refonte visuelle et ergonomique ---

describe('Canvas - zone sombre (refonte visuelle, correction du defaut fonctionnel principal)', () => {
  it('le clic direct sur la zone sombre desselectionne', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    expect(useEditorStore.getState().selection).toEqual(['rect1'])

    // La scene (data-testid="canvas-scene") est le conteneur racine du
    // canevas : un clic qui la touche ELLE, directement (pas un
    // descendant comme le plan de travail ou un noeud), doit
    // desselectionner -- avant la refonte, cette zone etait inerte.
    fireEvent.pointerDown(screen.getByTestId('canvas-scene'))
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('le plan de travail garde son propre data-testid et sa propre gestion du clic', () => {
    render(<Canvas api={apiFactice} />)
    expect(screen.getByTestId('canvas-background')).toBeTruthy()
    expect(screen.getByTestId('canvas-scene')).toBeTruthy()
  })
})

describe('Canvas - etat vide (refonte visuelle)', () => {
  it("affiche le message d etat vide quand la page n a aucun noeud", () => {
    useEditorStore.getState().load(createDocument('Document vide'))
    render(<Canvas api={apiFactice} />)
    expect(screen.getByText('Le plan de travail est vide')).toBeTruthy()
  })

  it('ne montre plus le message d etat vide des qu un noeud existe', () => {
    render(<Canvas api={apiFactice} />) // documentDeTest() (charge par beforeEach) contient deja rect1/rect2
    expect(screen.queryByText('Le plan de travail est vide')).toBeNull()
  })
})

describe('Canvas - raccourcis d outils (refonte visuelle : V/F/R/E/T/I)', () => {
  it.each([
    ['v', 'select'],
    ['f', 'frame'],
    ['r', 'rect'],
    ['e', 'ellipse'],
    ['t', 'text'],
    ['i', 'image'],
  ] as const)('la touche %s active l outil %s', (touche, outilAttendu) => {
    render(<Canvas api={apiFactice} />)
    useEditorStore.getState().setTool('select')
    fireEvent.keyDown(window, { key: touche })
    expect(useEditorStore.getState().tool).toBe(outilAttendu)
  })

  it('un raccourci d outil reste inactif quand le focus est dans un champ de saisie', () => {
    render(
      <>
        <input data-testid="champ-externe" />
        <Canvas api={apiFactice} />
      </>,
    )
    useEditorStore.getState().setTool('select')
    const input = screen.getByTestId('champ-externe')
    input.focus()
    fireEvent.keyDown(input, { key: 'r' })
    expect(useEditorStore.getState().tool).toBe('select')
  })
})

describe('Canvas - zoom a la molette (refonte visuelle)', () => {
  it('Ctrl + molette modifie le zoom', () => {
    render(<Canvas api={apiFactice} />)
    const zoomAvant = useEditorStore.getState().zoom
    fireEvent.wheel(screen.getByTestId('canvas-scene'), { ctrlKey: true, deltaY: -100 })
    expect(useEditorStore.getState().zoom).not.toBe(zoomAvant)
  })

  it('la molette sans Ctrl ne modifie pas le zoom (panoramique, pas defilement de page)', () => {
    render(<Canvas api={apiFactice} />)
    const zoomAvant = useEditorStore.getState().zoom
    fireEvent.wheel(screen.getByTestId('canvas-scene'), { deltaX: 20, deltaY: 30 })
    expect(useEditorStore.getState().zoom).toBe(zoomAvant)
  })
})

// Finition v1 : la geometrie produite par un GESTE (creation, deplacement,
// redimensionnement) est arrondie a l'entier en unites de page au moment ou
// la commande est construite -- un zoom non entier (screenToPage divise par
// le zoom) produisait sinon des flottants a dix decimales dans le document
// (ex. X 81.4489051094 constate a l'usage a zoom 0.64).
describe('Canvas - arrondi de la geometrie a un zoom non entier (finition v1)', () => {
  it('un trace produit des coordonnees et des dimensions entieres', () => {
    render(<Canvas api={apiFactice} />)
    act(() => {
      useEditorStore.getState().setZoom(0.64)
      useEditorStore.getState().setTool('rect')
    })

    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 80 })
    fireEvent.pointerUp(window, { clientX: 100, clientY: 80 })

    const state = useEditorStore.getState()
    const createdId = state.selection[0]!
    const created = state.document.pages[0]!.nodes.find((n) => n.id === createdId)!

    expect(Number.isInteger(created.frame.x)).toBe(true)
    expect(Number.isInteger(created.frame.y)).toBe(true)
    expect(Number.isInteger(created.frame.w)).toBe(true)
    expect(Number.isInteger(created.frame.h)).toBe(true)
  })

  it('un deplacement produit un delta entier', () => {
    render(<Canvas api={apiFactice} />)
    act(() => {
      useEditorStore.getState().setZoom(0.64)
    })

    const el = screen.getByTestId('node-rect1')
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 13 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 13 })

    const frame = useEditorStore.getState().document.pages[0]!.nodes[0]!.frame
    expect(Number.isInteger(frame.x)).toBe(true)
    expect(Number.isInteger(frame.y)).toBe(true)
  })

  it('un redimensionnement produit une largeur et une hauteur entieres', () => {
    render(<Canvas api={apiFactice} />)
    act(() => {
      useEditorStore.getState().setZoom(0.64)
    })

    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    const handle = screen.getByTestId('handle-se')
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 65 })
    fireEvent.pointerUp(window, { clientX: 80, clientY: 65 })

    const frame = useEditorStore.getState().document.pages[0]!.nodes[0]!.frame
    expect(Number.isInteger(frame.x)).toBe(true)
    expect(Number.isInteger(frame.y)).toBe(true)
    expect(Number.isInteger(frame.w)).toBe(true)
    expect(Number.isInteger(frame.h)).toBe(true)
  })
})

// Finition v1 : l'ajustement automatique du plan de travail (computeFitTransform,
// voir viewport.ts) ne doit plus se recalculer qu'a l'ouverture d'un document
// (deja couvert par le zoom/pan par defaut apres load() ci-dessus et dans
// editorStore.test.ts) -- PAS a chaque redimensionnement de la fenetre, qui
// ecrasait silencieusement un zoom choisi a la main. Ces tests simulent un
// conteneur de taille reelle (jsdom ne fait jamais de mise en page) en
// substituant getBoundingClientRect.
describe('Canvas - ajustement au redimensionnement (finition v1)', () => {
  const container = { width: 900, height: 700 }

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: container.width,
      height: container.height,
      top: 0,
      left: 0,
      right: container.width,
      bottom: container.height,
      toJSON() {
        return {}
      },
    } as DOMRect)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('le redimensionnement de la fenetre ne change pas le zoom ni le panoramique courants', () => {
    render(<Canvas api={apiFactice} />)

    act(() => {
      useEditorStore.getState().setZoom(2.5)
      useEditorStore.getState().setPan({ x: 10, y: 10 })
    })

    fireEvent(window, new Event('resize'))

    expect(useEditorStore.getState().zoom).toBe(2.5)
    expect(useEditorStore.getState().pan).toEqual({ x: 10, y: 10 })
  })

  it('le bouton "Ajuster a la fenetre" (requestFitToWindow) recalcule le zoom d ajustement', () => {
    render(<Canvas api={apiFactice} />)

    act(() => {
      useEditorStore.getState().setZoom(2.5)
    })

    act(() => {
      useEditorStore.getState().requestFitToWindow()
    })

    const device = useEditorStore.getState().document.pages[0]!.device
    const { zoom: zoomAttendu } = computeFitTransform(container, device)

    expect(useEditorStore.getState().zoom).toBeCloseTo(zoomAttendu, 5)
    expect(useEditorStore.getState().zoom).not.toBe(2.5)
  })
})

// v2 (addendum navigation §4, §5, §8). Document dedie : deux ecrans
// ('ecranA' en x=0, 'ecranB' en x=500), 'ecranA' contient un noeud
// ('bouton') sans lien. jsdom ne fait jamais de mise en page reelle
// (getBoundingClientRect() du canevas rend des zeros ici, aucun mock) --
// avec le zoom/pan par defaut apres load() (1 / {0,0}), les coordonnees
// ecran des evenements de pointeur SONT directement des coordonnees de
// page, comme dans le reste de cette suite (voir le trace de rectangle
// plus haut, qui compare deja `created.frame` a `clientX`/`clientY` tels
// quels).
describe('Canvas - plusieurs ecrans (v2, addendum navigation §4)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function documentDeuxEcrans(): CalqueDocument {
    const doc = createDocument('Document de test')
    const bouton: RectNode = {
      id: 'bouton',
      name: 'bouton',
      type: 'rect',
      frame: { x: 10, y: 10, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
    }
    const ecranA = createScreenNode('ecranA', device, { x: 0, y: 0, w: device.width, h: device.height }, [bouton])
    const ecranB = createScreenNode('ecranB', device, { x: 500, y: 0, w: device.width, h: device.height })
    return { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecranA, ecranB] }] }
  }

  it('affiche les deux ecrans, chacun avec sa propre etiquette', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    const ecranA = doc.pages[0]!.nodes[0]!
    const ecranB = doc.pages[0]!.nodes[1]!
    expect(screen.getByTestId(`screen-label-${ecranA.id}`).textContent).toContain('ecranA')
    expect(screen.getByTestId(`screen-label-${ecranB.id}`).textContent).toContain('ecranB')
    // Le noeud du premier ecran reste rendu et selectionnable normalement.
    expect(screen.getByTestId('node-bouton')).toBeTruthy()
  })

  it("l etiquette de l ecran actif (celui de la selection) est en accent", () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    const ecranA = doc.pages[0]!.nodes[0]!
    fireEvent.pointerDown(screen.getByTestId('node-bouton'))
    expect(useEditorStore.getState().activeScreenId).toBe(ecranA.id)
    expect(screen.getByTestId(`screen-label-${ecranA.id}`).className).toContain('calque-canvas-label-active')
  })

  it("la poignee de lien produit une seule commande, et lie le noeud a l ecran cible", () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    const ecranB = doc.pages[0]!.nodes[1]!

    // Selectionne 'bouton' pour faire apparaitre la poignee de lien.
    fireEvent.pointerDown(screen.getByTestId('node-bouton'))
    const poignee = screen.getByTestId('link-handle')

    fireEvent.pointerDown(poignee, { clientX: 60, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100 })
    // Relache a l'interieur d'ecranB (x:500..893, y:0..852) : le point de
    // relachement suit celui du dernier pointermove (meme convention que
    // les autres gestes de ce fichier, ex. deplacement/redimensionnement
    // plus haut).
    fireEvent.pointerMove(window, { clientX: 600, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 600, clientY: 100 })

    const state = useEditorStore.getState()
    expect(state.history.undoLabels).toHaveLength(1)
    const ecranA = state.document.pages[0]!.nodes[0] as FrameNode
    expect(tapNavigation(ecranA.children[0]!.interactions)?.target).toBe(ecranB.id)
  })

  it('relacher la poignee de lien hors de tout ecran n execute aucune commande', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    fireEvent.pointerDown(screen.getByTestId('node-bouton'))
    const poignee = screen.getByTestId('link-handle')

    fireEvent.pointerDown(poignee, { clientX: 60, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 2000, clientY: 2000 })
    fireEvent.pointerUp(window, { clientX: 2000, clientY: 2000 })

    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  it('relacher la poignee de lien sur l ecran qui contient deja le noeud n execute aucune commande', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    fireEvent.pointerDown(screen.getByTestId('node-bouton'))
    const poignee = screen.getByTestId('link-handle')

    fireEvent.pointerDown(poignee, { clientX: 60, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 })
    // Relache a l'interieur d'ecranA lui-meme (le noeud source y vit deja).
    fireEvent.pointerUp(window, { clientX: 100, clientY: 100 })

    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })
})

// Correctif parentage (v2, addendum navigation) : un element trace ou
// glisse a l'interieur d'un ecran en devient vraiment l'enfant -- avant ce
// correctif, il restait un simple frere de premier niveau, pose par-dessus
// visuellement seulement (voir le rapport v2-parentage-report.md). Meme
// convention de coordonnees que la suite « plusieurs ecrans » plus haut :
// zoom/pan par defaut apres load() (1 / {0,0}) et getBoundingClientRect()
// a zero sous jsdom font que les coordonnees ecran des evenements SONT des
// coordonnees de page.
describe('Canvas - correctif parentage (tracer et glisser entre ecrans)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function documentDeuxEcrans(): CalqueDocument {
    const doc = createDocument('Document de test')
    const bouton: RectNode = {
      id: 'bouton',
      name: 'bouton',
      type: 'rect',
      frame: { x: 10, y: 10, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
    }
    const ecranA = createScreenNode('ecranA', device, { x: 0, y: 0, w: device.width, h: device.height }, [bouton])
    const ecranB = createScreenNode('ecranB', device, { x: 500, y: 0, w: device.width, h: device.height })
    return { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecranA, ecranB] }] }
  }

  it('tracer a l interieur d un ecran en fait un enfant de CET ecran, aux bonnes coordonnees relatives', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)
    useEditorStore.getState().setTool('rect')

    const background = screen.getByTestId('canvas-background')
    // (550,50) est a l'interieur d'ecranB (500..893, 0..852).
    fireEvent.pointerDown(background, { clientX: 550, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 600, clientY: 150 })
    fireEvent.pointerUp(window, { clientX: 600, clientY: 150 })

    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes).toHaveLength(2) // aucun 3e noeud de premier niveau
    const ecranB = state.document.pages[0]!.nodes[1] as FrameNode
    expect(ecranB.children).toHaveLength(1)
    expect(ecranB.children[0]!.frame).toMatchObject({ x: 50, y: 50, w: 50, h: 100 })
  })

  it('tracer sur le fond, hors de tout ecran, cree un noeud de premier niveau (cas legitime)', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)
    useEditorStore.getState().setTool('rect')

    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 2000, clientY: 2000 })
    fireEvent.pointerMove(window, { clientX: 2050, clientY: 2040 })
    fireEvent.pointerUp(window, { clientX: 2050, clientY: 2040 })

    const state = useEditorStore.getState()
    expect(state.document.pages[0]!.nodes).toHaveLength(3)
    const nouveau = state.document.pages[0]!.nodes[2]!
    expect(nouveau.frame).toMatchObject({ x: 2000, y: 2000, w: 50, h: 40 })
  })

  it('glisser un element de l ecran 1 vers l ecran 2 le reparente sans qu il bouge visuellement, en une seule commande', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    const el = screen.getByTestId('node-bouton')
    fireEvent.pointerDown(el, { clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 100 })

    // Toujours au-dessus d'ecranA (son ecran d'origine) : aucun indice
    // visuel de reparentage.
    expect(useEditorStore.getState().dragPreview).toMatchObject({ targetScreenId: null })

    // (700,100) fait passer le centre du bouton deplace a l'interieur
    // d'ecranB (500..893, 0..852) : l'indice visuel s'allume dessus.
    fireEvent.pointerMove(window, { clientX: 700, clientY: 100 })
    const ecranBId = (doc.pages[0]!.nodes[1] as FrameNode).id
    expect(useEditorStore.getState().dragPreview).toMatchObject({ targetScreenId: ecranBId })

    fireEvent.pointerUp(window, { clientX: 700, clientY: 100 })

    const state = useEditorStore.getState()
    expect(state.history.undoLabels).toHaveLength(1)
    const ecranAApres = state.document.pages[0]!.nodes[0] as FrameNode
    const ecranBApres = state.document.pages[0]!.nodes[1] as FrameNode
    expect(ecranAApres.children).toHaveLength(0)
    expect(ecranBApres.children).toHaveLength(1)
    // Absolu inchange : (10,10) + (680,80) = (690,90), relatif a ecranB
    // (500,0) -> (190,90). Le noeud n'a pas "saute" visuellement.
    expect(ecranBApres.children[0]!.frame).toEqual({ x: 190, y: 90, w: 50, h: 50 })

    state.undo()
    const apresAnnuler = useEditorStore.getState().document
    const ecranAAnnule = apresAnnuler.pages[0]!.nodes[0] as FrameNode
    const ecranBAnnule = apresAnnuler.pages[0]!.nodes[1] as FrameNode
    expect(ecranAAnnule.children).toHaveLength(1)
    expect(ecranAAnnule.children[0]!.frame).toEqual({ x: 10, y: 10, w: 50, h: 50 })
    expect(ecranBAnnule.children).toHaveLength(0)
  })

  it('un element lie conserve son lien apres un reparentage par glissement', () => {
    const doc = documentDeuxEcrans()
    const ecranC = createScreenNode('ecranC', device, { x: 1000, y: 0, w: device.width, h: device.height })
    const docAvecLien: CalqueDocument = { ...doc, pages: [{ ...doc.pages[0]!, nodes: [...doc.pages[0]!.nodes, ecranC] }] }
    const avecLien = setLinkCommand(docAvecLien.pages[0]!.id, 'bouton', ecranC.id).apply(docAvecLien)
    useEditorStore.getState().load(avecLien)
    render(<Canvas api={apiFactice} />)

    const el = screen.getByTestId('node-bouton')
    fireEvent.pointerDown(el, { clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 700, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 700, clientY: 100 })

    const state = useEditorStore.getState()
    const ecranBApres = state.document.pages[0]!.nodes[1] as FrameNode
    expect(ecranBApres.children).toHaveLength(1)
    expect(tapNavigation(ecranBApres.children[0]!.interactions)?.target).toBe(ecranC.id)
  })

  it('un ecran glisse sur un autre ecran n est jamais reparente', () => {
    const doc = documentDeuxEcrans()
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)

    const ecranAId = (doc.pages[0]!.nodes[0] as FrameNode).id
    const el = screen.getByTestId(`screen-label-${ecranAId}`) // l'etiquette est la poignee de deplacement
    fireEvent.pointerDown(el, { clientX: 20, clientY: 20 })
    fireEvent.pointerMove(window, { clientX: 520, clientY: 20 }) // ecranA glisse sur ecranB
    expect(useEditorStore.getState().dragPreview).toMatchObject({ targetScreenId: null })
    fireEvent.pointerUp(window, { clientX: 520, clientY: 20 })

    const state = useEditorStore.getState()
    expect(state.history.undoLabels).toHaveLength(1)
    // Toujours deux noeuds de premier niveau, ni l'un ni l'autre imbrique.
    expect(state.document.pages[0]!.nodes.map((n) => n.id)).toEqual(doc.pages[0]!.nodes.map((n) => n.id))
    const ecranAApres = state.document.pages[0]!.nodes[0] as FrameNode
    expect(ecranAApres.children).toHaveLength(1) // son contenu (bouton) l'a suivi, inchange
    expect(ecranAApres.frame).toMatchObject({ x: 500, y: 0 }) // simple deplacement, pas de reparentage
  })
})

// Correctif parentage (suite) : une fois au moins un ecran cree, ce dernier
// est rendu par un NodeView qui recouvre EXACTEMENT l'ancien
// "canvas-background" (memes bornes, page.device) -- sans capture dediee,
// un clic reel avec un outil de creation actif atterrirait sur le NodeView
// de l'ecran (useNodeInteraction, qui stoppe la propagation puis ne fait
// rien tant que l'outil n'est pas 'select'), et le tracer resterait
// inoperant des qu'un ecran existe. `canvas-create-overlay` capture le
// geste par-dessus tout, uniquement quand un outil de creation est actif.
describe('Canvas - capture du tracer par-dessus les ecrans (correctif parentage)', () => {
  it("l'overlay de creation n'existe pas en mode select (n'interfere pas avec la selection normale)", () => {
    render(<Canvas api={apiFactice} />)
    expect(screen.queryByTestId('canvas-create-overlay')).toBeNull()
  })

  it("avec un ecran deja present, tracer via l'overlay (au-dessus de l'ecran) cree bien un enfant de CET ecran", () => {
    const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }
    const doc = createDocument('Document de test')
    const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height })
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecran1] }] })
    render(<Canvas api={apiFactice} />)
    act(() => {
      useEditorStore.getState().setTool('rect')
    })

    const overlay = screen.getByTestId('canvas-create-overlay')
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 150 })
    fireEvent.pointerUp(window, { clientX: 100, clientY: 150 })

    const state = useEditorStore.getState()
    const ecran1Apres = state.document.pages[0]!.nodes[0] as FrameNode
    expect(ecran1Apres.children).toHaveLength(1)
    expect(ecran1Apres.children[0]!.frame).toMatchObject({ x: 50, y: 50, w: 50, h: 100 })
  })
})

// Selection par rectangle (marquee).
describe('Canvas - selection par rectangle', () => {
  it('trace sur le fond : selectionne les noeuds coupes, une seule fois, sans commande', () => {
    render(<Canvas api={apiFactice} />)
    const bg = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(bg, { clientX: 90, clientY: 90 }) // rect2 est a (100,100,50,50)
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 })
    expect(screen.getByTestId('marquee-rect')).toBeTruthy()
    expect(useEditorStore.getState().selection).toEqual(['rect2'])
    fireEvent.pointerUp(window, { clientX: 200, clientY: 200 })
    expect(screen.queryByTestId('marquee-rect')).toBeNull()
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    expect(useEditorStore.getState().selection).toEqual(['rect2'])
  })
  it('un rectangle qui couvre tout selectionne tous les noeuds', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('canvas-background'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 300 })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
  })
  it('Maj ajoute a la selection existante', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(screen.getByTestId('canvas-background'), { clientX: 90, clientY: 90, shiftKey: true })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['rect1', 'rect2'])
  })
  it('un simple clic dans le vide deselectionne', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.pointerDown(screen.getByTestId('node-rect1'))
    fireEvent.pointerUp(window)
    fireEvent.pointerDown(screen.getByTestId('canvas-background'), { clientX: 400, clientY: 400 })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual([])
  })
  it('tracer depuis le corps d un ecran selectionne ses enfants coupes ; un clic selectionne l ecran', () => {
    const doc = createDocument('Document de test')
    const appareil: DevicePreset = { id: 'd', label: 'd', width: 393, height: 852, pixelRatio: 3 }
    const bouton: RectNode = { id: 'bouton', name: 'bouton', type: 'rect', frame: { x: 10, y: 10, w: 50, h: 50 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }
    const ecran = createScreenNode('ecranA', appareil, { x: 0, y: 0, w: 393, h: 852 }, [bouton])
    doc.pages[0]!.nodes = [ecran]
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)
    const ecranA = doc.pages[0]!.nodes[0] as FrameNode
    const enfant = ecranA.children[0]!
    const el = screen.getByTestId(`node-${ecranA.id}`)
    fireEvent.pointerDown(el, { clientX: ecranA.frame.x + 1, clientY: ecranA.frame.y + 1 })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual([ecranA.id])
    fireEvent.pointerDown(el, { clientX: ecranA.frame.x + 1, clientY: ecranA.frame.y + 1 })
    fireEvent.pointerMove(window, { clientX: ecranA.frame.x + ecranA.frame.w, clientY: ecranA.frame.y + ecranA.frame.h })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toContain(enfant.id)
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
  })
})

// Edition de texte au double-clic.
describe('Canvas - edition de texte sur le canevas', () => {
  function docAvecTexteEtBouton(): CalqueDocument {
    const doc = createDocument('Doc')
    const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
    const texte = { ...base, id: 't1', name: 'Texte', type: 'text' as const, frame: { x: 10, y: 10, w: 100, h: 20 }, characters: 'Salut', style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700, lineHeight: 24, letterSpacing: 0, color: { r: 1, g: 0, b: 0, a: 1 }, align: 'left' as const } }
    const bouton = { ...base, id: 'b1', name: 'Bouton', type: 'component' as const, kind: 'button' as const, frame: { x: 10, y: 50, w: 120, h: 44 }, props: { ...COMPONENT_DEFINITIONS.button.props, label: 'Valider' } }
    doc.pages[0]!.nodes = [texte, bouton]
    return doc
  }
  beforeEach(() => useEditorStore.getState().load(docAvecTexteEtBouton()))

  it('rend le texte avec son style (couleur, taille, graisse)', () => {
    render(<Canvas api={apiFactice} />)
    const el = screen.getByTestId('node-t1')
    expect(el.style.color).toBe('rgb(255, 0, 0)')
    expect(el.style.fontSize).toBe('20px')
    expect(el.style.fontWeight).toBe('700')
  })
  it('double-clic : ouvre l editeur ; Entree valide en UNE commande annulable', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.doubleClick(screen.getByTestId('node-t1'))
    const ed = screen.getByTestId('inline-text-editor') as HTMLTextAreaElement
    expect(ed.value).toBe('Salut')
    fireEvent.change(ed, { target: { value: 'Bonjour' } })
    fireEvent.keyDown(ed, { key: 'Enter' })
    expect(screen.queryByTestId('inline-text-editor')).toBeNull()
    const st = useEditorStore.getState()
    expect((st.document.pages[0]!.nodes[0] as { characters: string }).characters).toBe('Bonjour')
    expect(st.history.undoLabels).toHaveLength(1)
    st.undo()
    expect((useEditorStore.getState().document.pages[0]!.nodes[0] as { characters: string }).characters).toBe('Salut')
  })
  it('Echap annule sans commande ; perdre le focus valide', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.doubleClick(screen.getByTestId('node-t1'))
    let ed = screen.getByTestId('inline-text-editor') as HTMLTextAreaElement
    fireEvent.change(ed, { target: { value: 'X' } })
    fireEvent.keyDown(ed, { key: 'Escape' })
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    fireEvent.doubleClick(screen.getByTestId('node-t1'))
    ed = screen.getByTestId('inline-text-editor') as HTMLTextAreaElement
    fireEvent.change(ed, { target: { value: 'Blur' } })
    fireEvent.blur(ed)
    expect((useEditorStore.getState().document.pages[0]!.nodes[0] as { characters: string }).characters).toBe('Blur')
  })
  it('double-clic sur un bouton edite son libelle', () => {
    render(<Canvas api={apiFactice} />)
    fireEvent.doubleClick(screen.getByTestId('node-b1'))
    const ed = screen.getByTestId('inline-text-editor') as HTMLTextAreaElement
    expect(ed.value).toBe('Valider')
    fireEvent.change(ed, { target: { value: 'Envoyer' } })
    fireEvent.keyDown(ed, { key: 'Enter' })
    const b = useEditorStore.getState().document.pages[0]!.nodes[1] as { props: { label: string } }
    expect(b.props.label).toBe('Envoyer')
  })
  it('un rectangle n a pas d editeur au double-clic', () => {
    useEditorStore.getState().load(documentDeTest())
    render(<Canvas api={apiFactice} />)
    fireEvent.doubleClick(screen.getByTestId('node-rect1'))
    expect(screen.queryByTestId('inline-text-editor')).toBeNull()
  })
})

describe('Canvas - un texte trace s edite aussitot', () => {
  it('l outil Texte ouvre l editeur sur le nouveau noeud ; Entree valide la frappe', () => {
    render(<Canvas api={apiFactice} />)
    useEditorStore.getState().setTool('text')
    const background = screen.getByTestId('canvas-background')
    fireEvent.pointerDown(background, { clientX: 300, clientY: 300 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 330 })
    fireEvent.pointerUp(window, { clientX: 400, clientY: 330 })
    const editeur = screen.getByTestId('inline-text-editor') as HTMLTextAreaElement
    fireEvent.change(editeur, { target: { value: 'Bonjour' } })
    fireEvent.keyDown(editeur, { key: 'Enter' })
    const id = useEditorStore.getState().selection[0]!
    const noeud = useEditorStore.getState().document.pages[0]!.nodes.find((n) => n.id === id)
    expect(noeud).toMatchObject({ type: 'text', characters: 'Bonjour' })
    expect(useEditorStore.getState().editingTextId).toBeNull()
  })
})

describe('Canvas - Maj + corps d ecran', () => {
  it('Maj + simple clic sur un ecran bascule sa presence, Maj + trace ajoute sans le retirer', () => {
    const doc = createDocument('d')
    const dev: DevicePreset = { id: 'd', label: 'd', width: 393, height: 852, pixelRatio: 3 }
    const r: RectNode = { id: 'r1', name: 'r1', type: 'rect', frame: { x: 10, y: 10, w: 50, h: 50 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }
    const ecran = createScreenNode('E', dev, { x: 0, y: 0, w: 393, h: 852 }, [r])
    doc.pages[0]!.nodes = [ecran]
    useEditorStore.getState().load(doc)
    render(<Canvas api={apiFactice} />)
    useEditorStore.getState().select(['r1'])
    const el = screen.getByTestId(`node-${ecran.id}`)
    fireEvent.pointerDown(el, { clientX: 200, clientY: 400, shiftKey: true })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['r1', ecran.id])
    fireEvent.pointerDown(el, { clientX: 200, clientY: 400, shiftKey: true })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['r1'])
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, shiftKey: true })
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(window)
    expect(useEditorStore.getState().selection).toEqual(['r1'])
  })
})
