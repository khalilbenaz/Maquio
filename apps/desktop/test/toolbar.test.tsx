import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { moveNodeCommand } from '@calque/core'
import { Toolbar } from '../src/renderer/panels/Toolbar'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('Toolbar', () => {
  it('desactive annuler quand l historique est vide', () => {
    render(<Toolbar api={apiFactice} />)
    expect(screen.getByLabelText('Annuler').hasAttribute('disabled')).toBe(true)
  })

  it('liste les quatre cibles d export avec leur maturite, obtenues via l API', async () => {
    render(<Toolbar api={apiFactice} />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    expect(await screen.findByText(/SwiftUI/)).toHaveTextContent('aperçu')
    expect(screen.getByText(/Flutter/)).toHaveTextContent('complet')
    expect(screen.getByText(/React Native/)).toHaveTextContent('complet')
    expect(screen.getByText(/Jetpack Compose/)).toHaveTextContent('aperçu')
  })

  it('active annuler avec l intitule de la prochaine action annulable, une fois qu une commande a ete executee', () => {
    render(<Toolbar api={apiFactice} />)
    // Appel direct au magasin (hors fireEvent) : voir la note sur act() dans
    // inspector.test.tsx -- necessaire pour que le DOM interroge juste apres
    // reflete deja l historique mis a jour.
    act(() => {
      useEditorStore.getState().execute(moveNodeCommand(useEditorStore.getState().pageId, 'rect1', 10, 10))
    })

    const bouton = screen.getByLabelText('Annuler')
    expect(bouton.hasAttribute('disabled')).toBe(false)
    expect(bouton.getAttribute('title')).toContain('Déplacer')
  })

  it('desactive retablir tant qu aucun undo n a ete effectue', () => {
    render(<Toolbar api={apiFactice} />)
    expect(screen.getByLabelText('Rétablir').hasAttribute('disabled')).toBe(true)
  })

  it('affiche les six outils de creation et change l outil actif au clic', () => {
    render(<Toolbar api={apiFactice} />)
    for (const label of ['Sélection', 'Frame', 'Rectangle', 'Ellipse', 'Texte', 'Image']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByLabelText('Rectangle'))
    expect(useEditorStore.getState().tool).toBe('rect')
  })

  it('affiche le pourcentage de zoom et repond aux boutons de zoom', () => {
    render(<Toolbar api={apiFactice} />)
    expect(screen.getByText('100%')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Agrandir le zoom'))
    expect(useEditorStore.getState().zoom).toBeGreaterThan(1)
    fireEvent.click(screen.getByLabelText('Réinitialiser le zoom'))
    expect(useEditorStore.getState().zoom).toBe(1)
  })

  // Tache 17 : le bouton d import Figma est desormais actif, et ouvre le
  // dialogue d'import (import tout ou rien, voir FigmaImportDialog).
  it('le bouton d import Figma ouvre le dialogue d import', () => {
    render(<Toolbar api={apiFactice} />)
    const bouton = screen.getByLabelText('Importer depuis Figma')
    expect(bouton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(bouton)
    expect(screen.getByLabelText('Importer depuis Figma', { selector: 'section' })).toBeTruthy()
  })

  // Tache 17 : les cibles d export sont desormais actives et ouvrent le
  // dialogue d'export pre-selectionne sur la cible choisie.
  it('cliquer une cible d export ouvre le dialogue d export pour cette cible', async () => {
    render(<Toolbar api={apiFactice} />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    const cible = await screen.findByText(/SwiftUI/)
    expect(cible.hasAttribute('disabled')).toBe(false)
    fireEvent.click(cible)
    expect(screen.getByLabelText('Exporter le projet')).toBeTruthy()
  })

  // Correction round 2 (Critical) : sans ce bouton, aucun composant ne
  // permettait de saisir le jeton Figma -- l'import par l'API etait
  // inatteignable pour un utilisateur.
  it('le bouton Reglages ouvre le dialogue des reglages', () => {
    render(<Toolbar api={apiFactice} />)
    fireEvent.click(screen.getByLabelText('Réglages'))
    expect(screen.getByLabelText('Réglages', { selector: 'section' })).toBeTruthy()
  })
})
