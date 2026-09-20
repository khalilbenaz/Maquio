import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { InspectorPanel } from '../src/renderer/panels/InspectorPanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'

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
    render(<InspectorPanel />)
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
    render(<InspectorPanel />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('Y') as HTMLInputElement
    champ.focus()
    fireEvent.change(champ, { target: { value: '77' } })
    fireEvent.keyDown(champ, { key: 'Enter' })
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.frame.y).toBe(77)
  })

  it('une valeur inchangee a la validation n emet aucune commande (corollaire de la decision 2)', () => {
    render(<InspectorPanel />)
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
    render(<InspectorPanel />)
    act(() => {
      useEditorStore.getState().select(['rect1'])
    })
    const champ = screen.getByLabelText('Opacite') as HTMLInputElement
    expect(champ.value).toBe('1')

    fireEvent.change(champ, { target: { value: '2' } })
    fireEvent.blur(champ)

    expect(useEditorStore.getState().history.undoLabels).toHaveLength(0)
    expect(useEditorStore.getState().document.pages[0]!.nodes[0]!.opacity).toBe(1)
    expect(champ.value).toBe('1')
    expect(champ.getAttribute('aria-invalid')).toBe('true')
  })

  it('une saisie non numerique sur un champ numerique (x) ne produit aucune commande et revient a la valeur du document', () => {
    render(<InspectorPanel />)
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
    render(<InspectorPanel />)
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
    render(<InspectorPanel />)
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
    render(<InspectorPanel />)

    expect(screen.queryByLabelText('Rayon d angle')).toBeNull()
    expect(screen.getByLabelText('Famille de police')).toBeTruthy()
  })
})
