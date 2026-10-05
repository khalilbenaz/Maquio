// Dessin en direct : pendant une creation d'application, les ecrans que
// Claude est en train de dessiner s'affichent sur le canevas (apercu en
// lecture seule), avant d'etre appliques au document en un seul geste.
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, createDocument, createScreenNode } from '@maquio/core'
import type { Node } from '@maquio/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { apiFactice } from './helpers/apiFactice'

const texte: Node = {
  id: 'titre', name: 'Titre', type: 'text', frame: { x: 20, y: 80, w: 200, h: 30 }, visible: true, locked: false, opacity: 1, rotation: 0,
  characters: 'Bonjour Salma',
  style: { fontFamily: 'Inter', fontSize: 22, fontWeight: 700, lineHeight: 28, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
}

describe('Canvas — apercu du dessin de Claude', () => {
  beforeEach(() => useEditorStore.getState().load(createDocument('Vide')))

  it('affiche les ecrans en cours de dessin, sans les ajouter au document', () => {
    const ecran = createScreenNode('Écran Accueil', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [texte])
    render(<Canvas api={apiFactice} />)
    act(() => useEditorStore.getState().setClaudePreview({ screens: [{ ...ecran, id: 'accueil' }], currentId: 'accueil' }))
    expect(screen.getByTestId('preview-node-titre').textContent).toBe('Bonjour Salma')
    expect(screen.getByText(/Claude dessine/)).toBeTruthy()
    expect(useEditorStore.getState().document.pages[0]!.nodes.some((n) => n.id === 'accueil')).toBe(false)
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  it('n intercepte aucun clic et disparait quand l apercu est efface', () => {
    const ecran = createScreenNode('Écran Accueil', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [texte])
    render(<Canvas api={apiFactice} />)
    act(() => useEditorStore.getState().setClaudePreview({ screens: [{ ...ecran, id: 'accueil' }], currentId: null }))
    expect((screen.getByTestId('preview-node-titre') as HTMLElement).style.pointerEvents).toBe('none')
    act(() => useEditorStore.getState().setClaudePreview(null))
    expect(screen.queryByTestId('preview-node-titre')).toBeNull()
  })
})

describe('Canvas — apercu sur un document vierge', () => {
  beforeEach(() => useEditorStore.getState().load(createDocument('Vide')))

  it('masque l etat « plan de travail vide » pendant le dessin', () => {
    render(<Canvas api={apiFactice} />)
    const avant = screen.queryByText('Le plan de travail est vide') !== null
    const ecran = createScreenNode('Écran Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [texte])
    act(() => useEditorStore.getState().setClaudePreview({ screens: [{ ...ecran, id: 'accueil' }], currentId: 'accueil' }))
    expect(screen.queryByText('Le plan de travail est vide')).toBeNull()
    act(() => useEditorStore.getState().setClaudePreview(null))
    expect(screen.queryByText('Le plan de travail est vide') !== null).toBe(avant)
  })
})
