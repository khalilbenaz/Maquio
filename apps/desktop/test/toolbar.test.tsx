import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveNodeCommand } from '@calque/core'
import { Toolbar } from '../src/renderer/panels/Toolbar'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

describe('Toolbar', () => {
  it('desactive annuler quand l historique est vide', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    expect(screen.getByLabelText('Annuler').hasAttribute('disabled')).toBe(true)
  })

  it('liste les quatre cibles d export avec leur maturite, obtenues via l API', async () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    expect(await screen.findByText(/SwiftUI/)).toHaveTextContent('aperçu')
    expect(screen.getByText(/Flutter/)).toHaveTextContent('complet')
    expect(screen.getByText(/React Native/)).toHaveTextContent('complet')
    expect(screen.getByText(/Jetpack Compose/)).toHaveTextContent('aperçu')
  })

  it('active annuler avec l intitule de la prochaine action annulable, une fois qu une commande a ete executee', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
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
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    expect(screen.getByLabelText('Rétablir').hasAttribute('disabled')).toBe(true)
  })

  it('affiche les six outils de creation et change l outil actif au clic', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    for (const label of ['Sélection', 'Frame', 'Rectangle', 'Ellipse', 'Texte', 'Image']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    fireEvent.click(screen.getByLabelText('Rectangle'))
    expect(useEditorStore.getState().tool).toBe('rect')
  })

  it('affiche le pourcentage de zoom et repond aux boutons de zoom', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    expect(screen.getByText('100%')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Agrandir le zoom'))
    expect(useEditorStore.getState().zoom).toBeGreaterThan(1)
    fireEvent.click(screen.getByLabelText('Réinitialiser le zoom'))
    expect(useEditorStore.getState().zoom).toBe(1)
  })

  // Tache 17 : le bouton d import Figma est desormais actif, et ouvre le
  // dialogue d'import (import tout ou rien, voir FigmaImportDialog).
  it('le bouton d import Figma ouvre le dialogue d import', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    const bouton = screen.getByLabelText('Importer depuis Figma')
    expect(bouton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(bouton)
    expect(screen.getByLabelText('Importer depuis Figma', { selector: 'section' })).toBeTruthy()
  })

  // Tache 17 : les cibles d export sont desormais actives et ouvrent le
  // dialogue d'export pre-selectionne sur la cible choisie.
  it('cliquer une cible d export ouvre le dialogue d export pour cette cible', async () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    const cible = await screen.findByText(/SwiftUI/)
    expect(cible.hasAttribute('disabled')).toBe(false)
    fireEvent.click(cible)
    expect(screen.getByLabelText('Exporter le projet')).toBeTruthy()
  })

  // Correction round 2 (Critical) : sans ce bouton, aucun composant ne
  // permettait de saisir le jeton Figma -- l'import par l'API etait
  // inatteignable pour un utilisateur.
  //
  // Defaut n1 (« les reglages ont disparu »), mise a jour de ce test :
  // le dialogue des reglages n'est plus rendu PAR Toolbar lui-meme --
  // son ouverture remonte desormais a Editeur (App.tsx), pour que
  // ClaudePanel (frere de Toolbar, voir ClaudePanel.tsx) puisse ouvrir CE
  // MEME dialogue depuis son propre renvoi, plutot que d'en dupliquer un
  // second. Ce test verifie donc que le bouton declenche bien le
  // callback recu, pas qu'il rend lui-meme le dialogue.
  it('le bouton Reglages appelle onOpenSettings', () => {
    const onOpenSettings = vi.fn()
    render(<Toolbar api={apiFactice} onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByLabelText('Réglages'))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  // Defaut n1 : le bouton Reglages porte desormais un LIBELLE VISIBLE, au
  // meme format que ses voisins "Importer Figma"/"Exporter" -- avant
  // cette correction, seule une icone ronde isolee le distinguait, sans
  // rien qui le rattache visuellement a ce qu'il ouvre (rapporte par
  // l'utilisateur : "je ne le reconnais pas").
  it('le bouton Reglages porte un nom accessible ET un libelle visible, au meme format que ses voisins', () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    const bouton = screen.getByLabelText('Réglages')
    expect(bouton.textContent).toContain('Réglages')
    expect(bouton.className).toContain('toolbar-button-text')
    expect(bouton.className).toBe(screen.getByLabelText('Exporter').className)
  })

  // Defaut n2 (menu d'export coupe) : le menu se rend desormais dans un
  // portail sous document.body (voir ExporterMenu, Toolbar.tsx), plus
  // jamais a l'interieur de `.toolbar` (qui a `overflow-y: hidden`,
  // Toolbar.css) -- c'etait la cause du rognage constate ("on ne voit
  // que le bord arrondi superieur"). jsdom ne fait jamais de vraie mise
  // en page (getBoundingClientRect rend des zeros), donc ce test ne peut
  // pas verifier le calcul de position lui-meme (couvert visuellement
  // par la capture de la preuve de fin) -- il verifie la partie qui EST
  // observable sans mise en page reelle : le menu n'est plus un
  // descendant DOM de `.toolbar`.
  it('le menu d export se rend hors de la barre d outils (portail), jamais comme descendant du conteneur qui le rognait', async () => {
    render(<Toolbar api={apiFactice} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Exporter'))
    const menu = await screen.findByRole('menu', { name: "Cibles d'export" })
    const barreOutils = screen.getByLabelText("Barre d'outils")
    expect(barreOutils.contains(menu)).toBe(false)
    expect(document.body.contains(menu)).toBe(true)
  })
})
