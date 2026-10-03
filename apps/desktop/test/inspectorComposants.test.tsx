// Proprietes des composants mobiles dans l'inspecteur : chaque champ est
// derive du catalogue, emet UNE commande annulable a la validation, et une
// valeur que le modele refuse est signalee sans toucher au document.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEVICE_PRESETS,
  createComponentNode,
  createContainerNode,
  createDocument,
  createNodeCommand,
  createScreenCommand,
  createScreenNode,
  findNode,
} from '@calque/core'
import type { ComponentNode, FrameNode, Node } from '@calque/core'
import { InspectorPanel } from '../src/renderer/panels/InspectorPanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { apiFactice } from './helpers/apiFactice'

let accueil: FrameNode
let profil: FrameNode

beforeEach(() => {
  useEditorStore.getState().load(createDocument('Inspecteur'))
  accueil = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 })
  profil = createScreenNode('Profil', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 })
  const { pageId, execute } = useEditorStore.getState()
  execute(createScreenCommand(pageId, accueil))
  execute(createScreenCommand(pageId, profil))
})

function ajouter(node: Node, parent: FrameNode = accueil): Node {
  const { pageId, execute } = useEditorStore.getState()
  execute(createNodeCommand(pageId, parent.id, node))
  return node
}

function selectionner(...nodes: Node[]) {
  act(() => useEditorStore.getState().select(nodes.map((n) => n.id)))
}

function courant(id: string): Node {
  const { document: doc, pageId } = useEditorStore.getState()
  return findNode(doc.pages.find((p) => p.id === pageId)!.nodes, id)!
}

const props = (id: string) => (courant(id) as ComponentNode).props as Record<string, unknown>
const annulables = () => useEditorStore.getState().history.undoLabels.length

describe('Inspecteur : proprietes d un composant', () => {
  it('affiche la section du composant avec ses champs, derives du catalogue', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    expect(screen.getByRole('heading', { name: /Bouton/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Libellé')).toHaveValue('Bouton')
    expect(screen.getByLabelText('Variante')).toHaveValue('primary')
    expect(screen.getByLabelText('Désactivé')).not.toBeChecked()
  })

  it('texte : une commande a la validation, annulable', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    const avant = annulables()
    const champ = screen.getByLabelText('Libellé')
    fireEvent.change(champ, { target: { value: 'Connexion' } })
    expect(annulables()).toBe(avant)
    fireEvent.blur(champ)
    expect(annulables()).toBe(avant + 1)
    expect(props(bouton.id).label).toBe('Connexion')

    act(() => useEditorStore.getState().undo())
    expect(props(bouton.id).label).toBe('Bouton')
  })

  it('variante et case a cocher : commit immediat', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    fireEvent.change(screen.getByLabelText('Variante'), { target: { value: 'text' } })
    expect(props(bouton.id).variant).toBe('text')
    fireEvent.click(screen.getByLabelText('Désactivé'))
    expect(props(bouton.id).disabled).toBe(true)
  })

  it('icone optionnelle : choisie puis retiree (la cle disparait)', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    fireEvent.change(screen.getByLabelText('Icône'), { target: { value: 'home' } })
    expect(props(bouton.id).icon).toBe('home')
    fireEvent.change(screen.getByLabelText('Icône'), { target: { value: '' } })
    expect('icon' in props(bouton.id)).toBe(false)
  })

  it('couleur optionnelle : personnalisee puis reinitialisee', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#ff0000' } })
    expect(props(bouton.id).color).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    fireEvent.click(screen.getByRole('button', { name: /couleur du thème/i }))
    expect('color' in props(bouton.id)).toBe(false)
  })

  it('selection multiple de meme kind : un seul geste annulable', () => {
    const a = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    const b = ajouter(createComponentNode('button', { x: 0, y: 60, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(a, b)
    const avant = annulables()
    fireEvent.change(screen.getByLabelText('Variante'), { target: { value: 'secondary' } })
    expect(annulables()).toBe(avant + 1)
    expect(props(a.id).variant).toBe('secondary')
    expect(props(b.id).variant).toBe('secondary')
    act(() => useEditorStore.getState().undo())
    expect(props(a.id).variant).toBe('primary')
    expect(props(b.id).variant).toBe('primary')
  })

  it('selection de kinds differents : pas de section de composant', () => {
    const a = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    const b = ajouter(createComponentNode('switch', { x: 0, y: 60, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(a, b)
    expect(screen.queryByLabelText('Variante')).toBeNull()
    expect(screen.getByLabelText('X')).toBeInTheDocument()
  })

  it('une valeur refusee par le modele est signalee et le document reste intact', () => {
    const curseur = ajouter(createComponentNode('slider', { x: 0, y: 0, w: 328, h: 40 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(curseur)
    const avant = annulables()
    const champ = screen.getByLabelText('Valeur')
    fireEvent.change(champ, { target: { value: '500' } })
    fireEvent.blur(champ)
    expect(screen.getByRole('alert')).toHaveTextContent(/entre min et max/)
    expect(annulables()).toBe(avant)
    expect(props(curseur.id).value).toBe(40)
  })

  it('entier : une saisie decimale est arrondie', () => {
    const colonnes = ajouter({ ...createContainerNode('grid', { x: 0, y: 0, w: 300, h: 300 }) })
    render(<InspectorPanel api={apiFactice} />)
    selectionner(colonnes)
    const champ = screen.getByLabelText('Colonnes')
    fireEvent.change(champ, { target: { value: '3.4' } })
    fireEvent.blur(champ)
    expect((courant(colonnes.id) as FrameNode).container).toEqual({ kind: 'grid', columns: 3 })
  })

  it('liste de chaines : une option par ligne', () => {
    const liste = ajouter(createComponentNode('dropdown', { x: 0, y: 0, w: 328, h: 56 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(liste)
    const zone = screen.getByLabelText('Options')
    fireEvent.change(zone, { target: { value: 'Rouge\nVert\n\nBleu' } })
    fireEvent.blur(zone)
    expect(props(liste.id).options).toEqual(['Rouge', 'Vert', 'Bleu'])
  })

  it('liste vide refusee (au moins une option)', () => {
    const liste = ajouter(createComponentNode('dropdown', { x: 0, y: 0, w: 328, h: 56 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(liste)
    const zone = screen.getByLabelText('Options')
    fireEvent.change(zone, { target: { value: '' } })
    fireEvent.blur(zone)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect((props(liste.id).options as string[]).length).toBe(3)
  })

  it('actions de barre d application : ajouter, changer, retirer', () => {
    const barre = ajouter(createComponentNode('appBar', { x: 0, y: 0, w: 393, h: 56 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(barre)
    fireEvent.click(screen.getByRole('button', { name: /ajouter une action/i }))
    expect((props(barre.id).actions as string[]).length).toBe(2)
    fireEvent.change(screen.getByLabelText('Action 2'), { target: { value: 'settings' } })
    expect(props(barre.id).actions).toEqual(['search', 'settings'])
    fireEvent.click(screen.getByRole('button', { name: /retirer l.action 1/i }))
    expect(props(barre.id).actions).toEqual(['settings'])
  })

  it('entrees de navigation : libelle, icone, ecran cible ; ajout et retrait', () => {
    const nav = ajouter(createComponentNode('bottomNav', { x: 0, y: 772, w: 393, h: 80 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(nav)
    const libelle = screen.getByLabelText('Entrée 1 : libellé')
    fireEvent.change(libelle, { target: { value: 'Maison' } })
    fireEvent.blur(libelle)
    const items = () => props(nav.id).items as { label: string; icon: string; target?: string }[]
    expect(items()[0]!.label).toBe('Maison')

    fireEvent.change(screen.getByLabelText('Entrée 1 : icône'), { target: { value: 'favorite' } })
    expect(items()[0]!.icon).toBe('favorite')

    const cible = screen.getByLabelText('Entrée 2 : écran cible')
    // Toutes les entrees peuvent viser n'importe quel ecran, y compris l'ecran courant.
    expect(within(cible).getAllByRole('option').map((o) => o.textContent)).toEqual(['(aucun)', 'Accueil', 'Profil'])
    fireEvent.change(cible, { target: { value: profil.id } })
    expect(items()[1]!.target).toBe(profil.id)
    fireEvent.change(cible, { target: { value: '' } })
    expect('target' in items()[1]!).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /ajouter une entrée/i }))
    expect(items()).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /retirer l.entrée 4/i }))
    expect(items()).toHaveLength(3)
  })

  it('une barre ne peut pas descendre sous 2 entrees (erreur du modele signalee)', () => {
    const nav = ajouter(
      createComponentNode('bottomNav', { x: 0, y: 772, w: 393, h: 80 }, {
        items: [{ label: 'A', icon: 'home' }, { label: 'B', icon: 'star' }],
      }),
    )
    render(<InspectorPanel api={apiFactice} />)
    selectionner(nav)
    fireEvent.click(screen.getByRole('button', { name: /retirer l.entrée 2/i }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect((props(nav.id).items as unknown[]).length).toBe(2)
  })

  it('« Au clic → » reste disponible sur un composant (liens existants reutilises)', () => {
    const bouton = ajouter(createComponentNode('button', { x: 0, y: 0, w: 160, h: 48 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(bouton)
    fireEvent.change(screen.getByLabelText('Au clic →'), { target: { value: profil.id } })
    expect(courant(bouton.id).link).toEqual({ target: profil.id })
  })
})

describe('Inspecteur : conteneurs semantiques', () => {
  it('une carte expose son elevation ; la valeur est modifiable et annulable', () => {
    const carte = ajouter(createContainerNode('card', { x: 0, y: 0, w: 300, h: 200 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(carte)
    expect(screen.getByLabelText('Type de conteneur')).toHaveValue('card')
    const champ = screen.getByLabelText('Élévation')
    fireEvent.change(champ, { target: { value: '8' } })
    fireEvent.blur(champ)
    expect((courant(carte.id) as FrameNode).container).toEqual({ kind: 'card', elevation: 8 })
    act(() => useEditorStore.getState().undo())
    expect((courant(carte.id) as FrameNode).container).toEqual({ kind: 'card', elevation: 2 })
  })

  it('une frame ordinaire devient un conteneur, puis redevient une frame', () => {
    const { container: _retire, ...ordinaire } = createContainerNode('card', { x: 0, y: 0, w: 300, h: 200 })
    const noeud = ajouter(ordinaire)
    render(<InspectorPanel api={apiFactice} />)
    selectionner(noeud)
    expect(screen.getByLabelText('Type de conteneur')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Type de conteneur'), { target: { value: 'scrollView' } })
    expect((courant(noeud.id) as FrameNode).container).toEqual({ kind: 'scrollView', axis: 'vertical' })
    fireEvent.change(screen.getByLabelText('Type de conteneur'), { target: { value: '' } })
    expect('container' in (courant(noeud.id) as FrameNode)).toBe(false)
  })

  it('l axe d une liste est un choix', () => {
    const liste = ajouter(createContainerNode('listView', { x: 0, y: 0, w: 300, h: 300 }))
    render(<InspectorPanel api={apiFactice} />)
    selectionner(liste)
    fireEvent.change(screen.getByLabelText('Axe'), { target: { value: 'horizontal' } })
    expect((courant(liste.id) as FrameNode).container).toMatchObject({ kind: 'listView', axis: 'horizontal' })
    fireEvent.click(screen.getByLabelText('Séparateurs'))
    expect((courant(liste.id) as FrameNode).container).toMatchObject({ dividers: true })
  })
})
