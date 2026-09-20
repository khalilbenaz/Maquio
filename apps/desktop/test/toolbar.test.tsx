import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { moveNodeCommand } from '@calque/core'
import { Toolbar } from '../src/renderer/panels/Toolbar'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('Toolbar', () => {
  it('desactive annuler quand l historique est vide', () => {
    render(<Toolbar />)
    expect(screen.getByLabelText('Annuler').hasAttribute('disabled')).toBe(true)
  })

  it('liste les quatre cibles d export avec leur maturite', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    expect(screen.getByText(/SwiftUI/)).toHaveTextContent('aperçu')
    expect(screen.getByText(/Flutter/)).toHaveTextContent('complet')
    expect(screen.getByText(/React Native/)).toHaveTextContent('complet')
    expect(screen.getByText(/Jetpack Compose/)).toHaveTextContent('aperçu')
  })

  it('active annuler avec l intitule de la prochaine action annulable, une fois qu une commande a ete executee', () => {
    render(<Toolbar />)
    // Appel direct au magasin (hors fireEvent) : voir la note sur act() dans
    // inspector.test.tsx -- necessaire pour que le DOM interroge juste apres
    // reflete deja l historique mis a jour.
    act(() => {
      useEditorStore.getState().execute(moveNodeCommand(useEditorStore.getState().pageId, 'rect1', 10, 10))
    })

    const bouton = screen.getByLabelText('Annuler')
    expect(bouton.hasAttribute('disabled')).toBe(false)
    expect(bouton.getAttribute('title')).toContain('Deplacer')
  })

  it('desactive retablir tant qu aucun undo n a ete effectue', () => {
    render(<Toolbar />)
    expect(screen.getByLabelText('Retablir').hasAttribute('disabled')).toBe(true)
  })

  it('affiche les six outils de creation et change l outil actif au clic', () => {
    render(<Toolbar />)
    for (const label of ['Selection', 'Frame', 'Rectangle', 'Ellipse', 'Texte', 'Image']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByLabelText('Rectangle'))
    expect(useEditorStore.getState().tool).toBe('rect')
  })

  it('affiche le pourcentage de zoom et repond aux boutons de zoom', () => {
    render(<Toolbar />)
    expect(screen.getByText('100%')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Agrandir le zoom'))
    expect(useEditorStore.getState().zoom).toBeGreaterThan(1)
    fireEvent.click(screen.getByLabelText('Reinitialiser le zoom'))
    expect(useEditorStore.getState().zoom).toBe(1)
  })

  it('le bouton d import Figma est present mais desactive avec une infobulle explicative', () => {
    render(<Toolbar />)
    const bouton = screen.getByLabelText('Importer depuis Figma')
    expect(bouton.hasAttribute('disabled')).toBe(true)
    expect(bouton.getAttribute('title')).toMatch(/tache 17/)
  })

  it('les cibles d export sont presentes mais inertes (desactivees) a cette etape', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    const cible = screen.getByText(/SwiftUI/)
    expect(cible.hasAttribute('disabled')).toBe(true)
    expect(cible.getAttribute('title')).toMatch(/tache 17/)
  })
})
