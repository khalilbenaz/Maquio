import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, PALETTE_CATEGORIES, PALETTE_ITEMS, createDocument, createScreenCommand, createScreenNode, findNode } from '@maquio/core'
import type { ComponentNode, FrameNode } from '@maquio/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { PalettePanel, PALETTE_MIME } from '../src/renderer/panels/PalettePanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { apiFactice } from './helpers/apiFactice'

function chargerDocumentAvecEcran(): FrameNode {
  const doc = createDocument('Palette')
  useEditorStore.getState().load(doc)
  const ecran = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 })
  useEditorStore.getState().execute(createScreenCommand(useEditorStore.getState().pageId, ecran))
  useEditorStore.getState().setActiveScreenId(ecran.id)
  return ecran
}

beforeEach(() => {
  chargerDocumentAvecEcran()
})

// jsdom n'a pas de DragEvent : RTL cree un Event generique qui ne porte ni
// clientX ni clientY. On les definit a la main, comme le ferait un vrai
// DragEvent.
function deposer(cible: Element, id: string, point: { x: number; y: number }, types: string[] = [PALETTE_MIME]) {
  const event = createEvent.drop(cible, {
    dataTransfer: { getData: (k: string) => (k === PALETTE_MIME ? id : ''), types },
  })
  Object.defineProperty(event, 'clientX', { value: point.x })
  Object.defineProperty(event, 'clientY', { value: point.y })
  fireEvent(cible, event)
}

function ecranCourant(): FrameNode {
  const { document: doc, pageId } = useEditorStore.getState()
  return doc.pages.find((p) => p.id === pageId)!.nodes[0] as FrameNode
}

describe('PalettePanel', () => {
  it('liste les sept familles et chaque element de palette', () => {
    render(<PalettePanel />)
    for (const categorie of PALETTE_CATEGORIES) {
      expect(screen.getByRole('heading', { name: categorie })).toBeInTheDocument()
    }
    for (const item of PALETTE_ITEMS) {
      expect(screen.getByTestId(`palette-item-${item.id}`)).toBeInTheDocument()
    }
  })

  it('filtre par recherche (libelle, mot-cle natif) sans casse ni accent', () => {
    render(<PalettePanel />)
    const champ = screen.getByRole('searchbox', { name: /rechercher un composant/i })
    fireEvent.change(champ, { target: { value: 'TOGGLE' } })
    expect(screen.getByTestId('palette-item-switch')).toBeInTheDocument()
    expect(screen.queryByTestId('palette-item-button')).toBeNull()

    fireEvent.change(champ, { target: { value: 'boite' } })
    expect(screen.getByTestId('palette-item-dialog')).toBeInTheDocument()
  })

  it('masque une famille sans resultat et annonce l absence de resultat', () => {
    render(<PalettePanel />)
    const champ = screen.getByRole('searchbox')
    fireEvent.change(champ, { target: { value: 'tiroir' } })
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull()
    fireEvent.change(champ, { target: { value: 'zzzzqq' } })
    expect(screen.getByText(/aucun composant/i)).toBeInTheDocument()
  })

  it('un clic ajoute le composant a l ecran actif, le selectionne, et s annule en un geste', () => {
    render(<PalettePanel />)
    fireEvent.click(screen.getByTestId('palette-item-switch'))
    const ecran = ecranCourant()
    expect(ecran.children).toHaveLength(1)
    const noeud = ecran.children[0] as ComponentNode
    expect(noeud.type).toBe('component')
    expect(noeud.kind).toBe('switch')
    expect(useEditorStore.getState().selection).toEqual([noeud.id])

    act(() => useEditorStore.getState().undo())
    expect(ecranCourant().children).toHaveLength(0)
  })

  it('le glisser pose l identifiant de l element dans le transfert', () => {
    render(<PalettePanel />)
    const data: Record<string, string> = {}
    fireEvent.dragStart(screen.getByTestId('palette-item-button'), {
      dataTransfer: { setData: (k: string, v: string) => (data[k] = v), effectAllowed: '' },
    })
    expect(data[PALETTE_MIME]).toBe('button')
  })
})

describe('depot d un composant sur le canevas', () => {
  it('cree le composant dans l ecran, centre sous le point de depot', () => {
    render(<Canvas api={apiFactice} />)
    const scene = screen.getByTestId('canvas-scene')
    // jsdom : rect {0,0}, zoom 1, pan 0 -> le point client EST le point de page.
    deposer(scene, 'button', { x: 200, y: 300 })
    const ecran = ecranCourant()
    const bouton = ecran.children[0] as ComponentNode
    expect(bouton.kind).toBe('button')
    expect(bouton.frame).toEqual({ x: 120, y: 276, w: 160, h: 48 })
    expect(useEditorStore.getState().selection).toEqual([bouton.id])
    expect(screen.getByTestId(`node-${bouton.id}`)).toBeInTheDocument()
  })

  it('ignore un depot qui ne vient pas de la palette', () => {
    render(<Canvas api={apiFactice} />)
    deposer(screen.getByTestId('canvas-scene'), '', { x: 200, y: 300 }, ['text/plain'])
    expect(ecranCourant().children).toHaveLength(0)
  })

  it('une barre d application deposee se colle en haut de l ecran', () => {
    render(<Canvas api={apiFactice} />)
    deposer(screen.getByTestId('canvas-scene'), 'appBar', { x: 200, y: 500 })
    const barre = ecranCourant().children[0]!
    expect(barre.frame).toEqual({ x: 0, y: 0, w: 393, h: 56 })
    expect(findNode([ecranCourant()], barre.id)).not.toBeNull()
  })
})
