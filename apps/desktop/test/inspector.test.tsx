import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createScreenNode, findNode } from '@calque/core'
import type { CalqueDocument, DevicePreset, FrameNode, ImageNode, RectNode } from '@calque/core'
import { InspectorPanel } from '../src/renderer/panels/InspectorPanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

// Note sur act() : useEditorStore.getState().select(...) est un appel
// direct au magasin, hors d'un gestionnaire d'evenement React (contrairement
// a fireEvent, deja enveloppe par la librairie). Avec useSyncExternalStore
// (zustand), la mise a jour est bien planifiee en priorite synchrone mais
// purgee au prochain passage de React, pas dans la meme pile d'appel -- il
// faut donc l'envelopper dans act() pour que le DOM interroge juste apres
// reflete deja la nouvelle selection. Les assertions elles-memes restent
// celles du cahier des charges.
describe('InspectorPanel', () => {
  it('n emet qu une commande a la validation du champ, pas a chaque frappe', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('X')
    fireEvent.change(champ, { target: { value: '12' } })
    fireEvent.change(champ, { target: { value: '123' } })
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    fireEvent.blur(champ)
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(1)
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.x).toBe(123)
  })

  it('valide aussi a la touche Entree', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('Y') as HTMLInputElement
    champ.focus()
    fireEvent.change(champ, { target: { value: '77' } })
    fireEvent.keyDown(champ, { key: 'Enter' })
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.y).toBe(77)
  })

  // Finition v1 : l'arrondi a l'entier ne s'applique qu'a la geometrie
  // produite par un GESTE (voir useDragInteraction.test.ts / canvas.test.tsx)
  // -- une valeur decimale saisie au clavier dans l'inspecteur doit rester
  // exactement ce que l'utilisateur a tape.
  it('une valeur decimale saisie au clavier est conservee telle quelle, sans arrondi', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('X') as HTMLInputElement
    fireEvent.change(champ, { target: { value: '12.5' } })
    fireEvent.blur(champ)
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.x).toBe(12.5)
  })

  // Finition v1 : l'affichage n'excede jamais deux decimales, sans jamais
  // arrondir la valeur STOCKEE dans le document -- seul ce qui est montre
  // dans le champ (avant toute frappe) est reformate.
  it("l affichage n excede jamais deux decimales, sans jamais arrondir la valeur du document", () => {
    const doc = documentDeTest()
    const rect1 = doc.pages[0]!.nodes[0] as RectNode
    const precis: RectNode = {
      ...rect1,
      frame: { x: 81.4489051094, y: 245.649635036, w: 233.2116, h: 202.1167 },
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [precis, doc.pages[0]!.nodes[1]!] }] })
    useEditorStore.getState().select(['rect1'])
    render(<InspectorPanel api={apiFactice} />)

    expect((screen.getByLabelText('X') as HTMLInputElement).value).toBe('81.45')
    expect((screen.getByLabelText('Y') as HTMLInputElement).value).toBe('245.65')
    expect((screen.getByLabelText('Largeur') as HTMLInputElement).value).toBe('233.21')
    expect((screen.getByLabelText('Hauteur') as HTMLInputElement).value).toBe('202.12')

    // La valeur STOCKEE, elle, reste exacte : l'arrondi est un
    // formatage d'affichage, pas une troncature de donnees.
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.x).toBe(81.4489051094)
  })

  it("un entier s affiche sans decimale inutile (233, pas 233.00)", () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('Largeur') as HTMLInputElement
    fireEvent.change(champ, { target: { value: '233' } })
    fireEvent.blur(champ)
    expect(champ.value).toBe('233')
  })

  it('une valeur inchangee a la validation n emet aucune commande (corollaire de la decision 2)', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('X') as HTMLInputElement
    expect(champ.value).toBe('0')
    // Aucune frappe qui change la valeur : un blur sans modification ne
    // doit produire aucune commande.
    fireEvent.blur(champ)
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)

    // Meme en retapant explicitement la valeur deja affichee.
    fireEvent.change(champ, { target: { value: '0' } })
    fireEvent.blur(champ)
    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
  })

  it('une saisie hors bornes (opacite hors 0..1) ne produit aucune commande et revient a la valeur du document', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('Opacité') as HTMLInputElement
    expect(champ.value).toBe('1')

    fireEvent.change(champ, { target: { value: '2' } })
    fireEvent.blur(champ)

    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.opacity).toBe(1)
    expect(champ.value).toBe('1')
    expect(champ.getAttribute('aria-invalid')).toBe('true')
  })

  it('une saisie non numerique sur un champ numerique (x) ne produit aucune commande et revient a la valeur du document', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('X') as HTMLInputElement

    fireEvent.change(champ, { target: { value: 'abc' } })
    fireEvent.blur(champ)

    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.x).toBe(0)
    expect(champ.value).toBe('0')
    expect(champ.getAttribute('aria-invalid')).toBe('true')
  })

  it('sur une selection multiple, un champ affiche une valeur vide quand les valeurs different, et l edition applique une seule commande composite', () => {
    render(<InspectorPanel api={apiFactice} />)
    act(() => {
      useEditorStore.getState().select(['rect1', 'rect2'])
    })
    const champ = screen.getByLabelText('X') as HTMLInputElement
    // rect1.x = 0, rect2.x = 100 dans documentDeTest : valeurs differentes.
    expect(champ.value).toBe('')

    fireEvent.change(champ, { target: { value: '5' } })
    fireEvent.blur(champ)

    const state = useEditorStore.getState()
    expect(state.history.undoLabels).toHaveLength(1)
    expect(state.document.pages[0]!.nodes[0]!.frame.x).toBe(5)
    expect(state.document.pages[0]!.nodes[1]!.frame.x).toBe(5)
  })

  it('n affiche aucun champ specifique quand rien n est selectionne', () => {
    render(<InspectorPanel api={apiFactice} />)
    expect(screen.queryByLabelText('X')).toBeNull()
  })

  it('n affiche pas le rayon d angle pour un noeud texte (champ sans objet)', () => {
    const doc = documentDeTest()
    const textNode = {
      id: 'text1',
      name: 'text1',
      type: 'text' as const,
      frame: { x: 0, y: 0, w: 100, h: 20 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      characters: 'Bonjour',
      style: {
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: { r: 0, g: 0, b: 0, a: 1 },
        align: 'left' as const,
      },
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [textNode] }] })
    useEditorStore.getState().select(['text1'])
    render(<InspectorPanel api={apiFactice} />)

    expect(screen.queryByLabelText("Rayon d'angle")).toBeNull()
    expect(screen.getByLabelText('Famille de police')).toBeTruthy()
  })

  it('permet de modifier le contenu d un noeud texte (champ Contenu), annulable', () => {
    const doc = documentDeTest()
    const textNode = {
      id: 'text1', name: 'text1', type: 'text' as const, frame: { x: 0, y: 0, w: 100, h: 20 },
      visible: true, locked: false, opacity: 1, rotation: 0, characters: 'Texte',
      style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 19, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' as const },
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [textNode] }] })
    useEditorStore.getState().select(['text1'])
    render(<InspectorPanel api={apiFactice} />)

    const champ = screen.getByLabelText('Contenu') as HTMLInputElement
    fireEvent.change(champ, { target: { value: 'Bonjour' } })
    fireEvent.blur(champ)

    expect((useEditorStore.getState().document.pages[0]!.nodes[0] as { characters: string }).characters).toBe('Bonjour')
    useEditorStore.getState().undo()
    expect((useEditorStore.getState().document.pages[0]!.nodes[0] as { characters: string }).characters).toBe('Texte')
  })

  // Round de correction 1 (Critical) : changer la couleur de remplissage ne
  // doit jamais tronquer le tableau `fills` a un seul element ni figer
  // l'alpha du premier a 1 -- perte de donnees silencieuse constatee en
  // revue, notamment pour un document qui aura plusieurs remplissages ou un
  // remplissage semi-transparent (import Figma, tache 17).
  it('changer la couleur de remplissage conserve les remplissages suivants du tableau', () => {
    const doc = documentDeTest()
    const rect1 = doc.pages[0]!.nodes[0] as RectNode
    const rect2 = doc.pages[0]!.nodes[1]!
    const deuxRemplissages: RectNode = {
      ...rect1,
      fills: [
        { type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } },
        { type: 'solid', color: { r: 0, g: 1, b: 0, a: 1 } },
      ],
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [deuxRemplissages, rect2] }] })
    useEditorStore.getState().select(['rect1'])
    render(<InspectorPanel api={apiFactice} />)

    const couleur = screen.getByLabelText('Couleur de remplissage') as HTMLInputElement
    fireEvent.change(couleur, { target: { value: '#0000ff' } })

    const fills = (useEditorStore.getState().document.pages[0]!.nodes[0] as RectNode).fills
    expect(fills).toHaveLength(2)
    expect(fills[1]).toEqual({ type: 'solid', color: { r: 0, g: 1, b: 0, a: 1 } })
    expect(fills[0]).toEqual({ type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 } })
  })

  it('changer la couleur de remplissage conserve l alpha courant', () => {
    const doc = documentDeTest()
    const rect1 = doc.pages[0]!.nodes[0] as RectNode
    const rect2 = doc.pages[0]!.nodes[1]!
    const remplissageSemiTransparent: RectNode = {
      ...rect1,
      fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 0.5 } }],
    }
    useEditorStore
      .getState()
      .load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [remplissageSemiTransparent, rect2] }] })
    useEditorStore.getState().select(['rect1'])
    render(<InspectorPanel api={apiFactice} />)

    const couleur = screen.getByLabelText('Couleur de remplissage') as HTMLInputElement
    fireEvent.change(couleur, { target: { value: '#00ff00' } })

    const fill = (useEditorStore.getState().document.pages[0]!.nodes[0] as RectNode).fills[0]
    expect(fill).toEqual({ type: 'solid', color: { r: 0, g: 1, b: 0, a: 0.5 } })
  })

  // Defaut n3 (« comment mettre l'image ? »), test requis par le brief :
  // l'inspecteur d'un noeud image expose le choix de fichier ET le mode
  // d'ajustement -- avant cette correction, rien n'existait pour
  // renseigner ou remplacer `src` une fois le noeud cree.
  it("l inspecteur d un noeud image expose le choix de fichier et le mode d ajustement", async () => {
    const doc = documentDeTest()
    const rect2 = doc.pages[0]!.nodes[1]!
    const image: ImageNode = {
      id: 'rect1',
      name: 'rect1',
      type: 'image',
      frame: { x: 0, y: 0, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      src: '',
      fit: 'cover',
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [image, rect2] }] })
    useEditorStore.getState().select(['rect1'])

    const chooseImage = vi.fn(async () => '/Users/lilou/Images/photo.png')
    render(<InspectorPanel api={{ ...apiFactice, chooseImage }} />)

    fireEvent.click(screen.getByText('Choisir une image…'))
    await waitFor(() => {
      const node = useEditorStore.getState().document.pages[0]!.nodes[0] as ImageNode
      expect(node.src).toBe('/Users/lilou/Images/photo.png')
    })
    expect(chooseImage).toHaveBeenCalledTimes(1)

    const modeAjustement = screen.getByLabelText("Mode d'ajustement") as HTMLSelectElement
    expect(modeAjustement.value).toBe('cover')
    fireEvent.change(modeAjustement, { target: { value: 'contain' } })

    const node = useEditorStore.getState().document.pages[0]!.nodes[0] as ImageNode
    expect(node.fit).toBe('contain')
  })

  it("l inspecteur d un noeud image n applique aucun changement si l utilisateur annule le choix de fichier", async () => {
    const doc = documentDeTest()
    const rect2 = doc.pages[0]!.nodes[1]!
    const image: ImageNode = {
      id: 'rect1',
      name: 'rect1',
      type: 'image',
      frame: { x: 0, y: 0, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      src: '',
      fit: 'cover',
    }
    useEditorStore.getState().load({ ...doc, pages: [{ ...doc.pages[0]!, nodes: [image, rect2] }] })
    useEditorStore.getState().select(['rect1'])

    const chooseImage = vi.fn(async () => null)
    render(<InspectorPanel api={{ ...apiFactice, chooseImage }} />)

    fireEvent.click(screen.getByText('Choisir une image…'))
    await waitFor(() => expect(chooseImage).toHaveBeenCalledTimes(1))

    const node = useEditorStore.getState().document.pages[0]!.nodes[0] as ImageNode
    expect(node.src).toBe('')
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })
})

// v2 (addendum navigation §5, chemin 1 : « un nœud sélectionné expose « Au
// clic → » avec la liste des écrans de la page »).
describe('InspectorPanel - "Au clic →" (v2, addendum navigation)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function documentAvecDeuxEcrans(): { doc: CalqueDocument; ecranA: FrameNode; ecranB: FrameNode } {
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
    return { doc: { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecranA, ecranB] }] }, ecranA, ecranB }
  }

  it('liste les ecrans de la page, hors l ecran qui contient deja le noeud selectionne', () => {
    const { doc, ecranB } = documentAvecDeuxEcrans()
    useEditorStore.getState().load(doc)
    useEditorStore.getState().select(['bouton'])
    render(<InspectorPanel api={apiFactice} />)

    const champ = screen.getByLabelText('Au clic →') as HTMLSelectElement
    const options = Array.from(champ.options)
    const labels = options.map((o) => o.textContent)
    expect(labels).toContain('ecranB')
    expect(labels).not.toContain('ecranA')
    // La valeur reelle de l'option (celle transmise a setLinkCommand) est
    // l'identifiant de l'ecran, distinct de son libelle affiche.
    expect(options.find((o) => o.textContent === 'ecranB')?.value).toBe(ecranB.id)
    // Aucun lien pose encore : le champ n'a pas de selection (option
    // "(aucun)").
    expect(champ.value).toBe('')
  })

  it('choisir un ecran emet setLinkCommand, choisir "(aucun)" retire le lien', () => {
    const { doc, ecranB } = documentAvecDeuxEcrans()
    useEditorStore.getState().load(doc)
    useEditorStore.getState().select(['bouton'])
    render(<InspectorPanel api={apiFactice} />)

    const champ = screen.getByLabelText('Au clic →')
    fireEvent.change(champ, { target: { value: ecranB.id } })

    let state = useEditorStore.getState()
    expect(findNode(state.document.pages[0]!.nodes, 'bouton')?.link).toEqual({ target: ecranB.id })

    fireEvent.change(champ, { target: { value: '' } })
    state = useEditorStore.getState()
    expect(findNode(state.document.pages[0]!.nodes, 'bouton')?.link).toBeUndefined()
  })
})
