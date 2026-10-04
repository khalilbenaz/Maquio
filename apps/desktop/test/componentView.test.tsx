import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMPONENT_KINDS,
  DEVICE_PRESETS,
  createComponentNode,
  createContainerNode,
  createDocument,
  createNodeCommand,
  createScreenCommand,
  createScreenNode,
} from '@maquio/core'
import type { ComponentNode, ComponentPropsMap, FrameNode, Node } from '@maquio/core'
import { Canvas } from '../src/renderer/canvas/Canvas'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { apiFactice } from './helpers/apiFactice'

let ecran: FrameNode

beforeEach(() => {
  useEditorStore.getState().load(createDocument('Rendu'))
  ecran = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 })
  useEditorStore.getState().execute(createScreenCommand(useEditorStore.getState().pageId, ecran))
})

function ajouter<K extends ComponentNode['kind']>(kind: K, props: Partial<ComponentPropsMap[K]> = {}): ComponentNode {
  const node = createComponentNode(kind, { x: 10, y: 10, w: 328, h: 56 }, props) as ComponentNode
  const { pageId, execute } = useEditorStore.getState()
  execute(createNodeCommand(pageId, ecran.id, node))
  return node
}

function vue(node: Node): HTMLElement {
  return screen.getByTestId(`node-${node.id}`)
}

describe('rendu canevas des composants', () => {
  it('rend un element par composant, marque de son kind', () => {
    const nodes = COMPONENT_KINDS.map((kind) => ajouter(kind))
    render(<Canvas api={apiFactice} />)
    for (const node of nodes) {
      const el = vue(node)
      expect(el.querySelector(`[data-component="${(node as ComponentNode).kind}"]`), (node as ComponentNode).kind).not.toBeNull()
    }
  })

  it('bouton : primaire plein, secondaire a contour, texte sans fond, desactive attenue', () => {
    const primaire = ajouter('button', { label: 'Valider' })
    const secondaire = ajouter('button', { label: 'Plus', variant: 'secondary' })
    const texte = ajouter('button', { label: 'Lien', variant: 'text' })
    const inactif = ajouter('button', { label: 'Non', disabled: true })
    render(<Canvas api={apiFactice} />)
    const interne = (n: Node) => vue(n).querySelector('[data-component] > div') as HTMLElement
    expect(vue(primaire)).toHaveTextContent('Valider')
    expect(interne(primaire).style.background).not.toBe('')
    expect(interne(primaire).style.background).not.toBe('transparent')
    expect(interne(secondaire).style.border).toContain('1px solid')
    expect(interne(texte).style.background).toBe('')
    expect(interne(texte).style.border).toBe('')
    expect(interne(inactif).style.color).toContain('0.38')
  })

  it('couleur personnalisee d un bouton', () => {
    const bouton = ajouter('button', { color: { r: 1, g: 0, b: 0, a: 1 } })
    render(<Canvas api={apiFactice} />)
    expect((vue(bouton).querySelector('[data-component] > div') as HTMLElement).style.background).toBe('rgb(255, 0, 0)')
  })

  it('champ de texte : mot de passe masque, erreur affichee, aide affichee', () => {
    const mdp = ajouter('textField', { label: 'Mot de passe', value: 'secret', password: true })
    const erreur = ajouter('textField', { label: 'E-mail', errorText: 'Adresse invalide' })
    const aide = ajouter('textField', { label: 'Nom', helperText: 'Votre nom' })
    render(<Canvas api={apiFactice} />)
    expect(vue(mdp)).toHaveTextContent('••••••')
    expect(vue(mdp)).not.toHaveTextContent('secret')
    expect(vue(erreur)).toHaveTextContent('Adresse invalide')
    expect(vue(aide)).toHaveTextContent('Votre nom')
  })

  it('interrupteur, case et radio refletent leur etat', () => {
    const on = ajouter('switch', { label: 'Wifi', checked: true })
    const off = ajouter('switch', { label: 'Bluetooth', checked: false })
    const case_ = ajouter('checkbox', { label: 'CGU', checked: true })
    const radio = ajouter('radio', { label: 'Choix A', selected: true })
    render(<Canvas api={apiFactice} />)
    expect(vue(on)).toHaveTextContent('Wifi')
    expect(vue(off)).toHaveTextContent('Bluetooth')
    expect(vue(case_).querySelector('[data-icon="check"]')).not.toBeNull()
    expect(vue(radio)).toHaveTextContent('Choix A')
  })

  it('liste deroulante : affiche l option choisie ; selecteur de date : la date ou une indication', () => {
    const liste = ajouter('dropdown', { options: ['A', 'B'], selectedIndex: 1 })
    const date = ajouter('datePicker', { value: '2026-10-03' })
    const vide = ajouter('datePicker', { value: '' })
    render(<Canvas api={apiFactice} />)
    expect(vue(liste)).toHaveTextContent('B')
    expect(vue(date)).toHaveTextContent('2026-10-03')
    expect(vue(vide)).toHaveTextContent('jj/mm/aaaa')
  })

  it('icone : dessine le glyphe demande a la taille demandee', () => {
    const icone = ajouter('icon', { name: 'home', size: 32 })
    render(<Canvas api={apiFactice} />)
    const svg = vue(icone).querySelector('[data-icon="home"]')!
    expect(svg.getAttribute('width')).toBe('32')
  })

  it('barre d application : titre, bouton de debut et actions', () => {
    const barre = ajouter('appBar', { title: 'Messages', leading: 'menu', actions: ['search', 'moreVert'] })
    render(<Canvas api={apiFactice} />)
    const el = vue(barre)
    expect(el).toHaveTextContent('Messages')
    expect(el.querySelector('[data-icon="menu"]')).not.toBeNull()
    expect(el.querySelector('[data-icon="search"]')).not.toBeNull()
    expect(el.querySelector('[data-icon="moreVert"]')).not.toBeNull()
    expect(el.querySelector('[data-icon="arrowBack"]')).toBeNull()
  })

  it('barre basse et onglets : tous les libelles', () => {
    const nav = ajouter('bottomNav')
    const onglets = ajouter('tabs', { items: [{ label: 'Un' }, { label: 'Deux' }], selectedIndex: 1 })
    render(<Canvas api={apiFactice} />)
    expect(vue(nav)).toHaveTextContent('Accueil')
    expect(vue(nav)).toHaveTextContent('Profil')
    expect(vue(onglets)).toHaveTextContent('Un')
    expect(vue(onglets)).toHaveTextContent('Deux')
  })

  it('boite de dialogue : titre, message et boutons ; snackbar : message et action', () => {
    const dialogue = ajouter('dialog', { title: 'Supprimer ?', message: 'Irreversible.', confirmLabel: 'Oui', cancelLabel: 'Non' })
    const snack = ajouter('snackbar', { message: 'Fait', actionLabel: 'Annuler' })
    render(<Canvas api={apiFactice} />)
    for (const texte of ['Supprimer ?', 'Irreversible.', 'Oui', 'Non']) expect(vue(dialogue)).toHaveTextContent(texte)
    expect(vue(snack)).toHaveTextContent('Fait')
    expect(vue(snack)).toHaveTextContent('Annuler')
  })

  it('element de liste, avatar, badge, puce : leur texte', () => {
    const tuile = ajouter('listTile', { title: 'Alice', subtitle: 'En ligne' })
    const avatar = ajouter('avatar', { initials: 'AL' })
    const badge = ajouter('badge', { text: '12' })
    const puce = ajouter('chip', { label: 'Promo' })
    render(<Canvas api={apiFactice} />)
    expect(vue(tuile)).toHaveTextContent('AliceEn ligne')
    expect(vue(avatar)).toHaveTextContent('AL')
    expect(vue(badge)).toHaveTextContent('12')
    expect(vue(puce)).toHaveTextContent('Promo')
  })

  it('curseur et progression : largeur proportionnelle a la valeur', () => {
    const curseur = ajouter('slider', { value: 25, min: 0, max: 100 })
    const barre = ajouter('progressBar', { value: 0.5 })
    render(<Canvas api={apiFactice} />)
    const remplissage = (n: Node) => vue(n).querySelector('[data-component] div div div, [data-component] div div') as HTMLElement
    expect(remplissage(curseur).innerHTML).toContain('25%')
    expect(vue(barre).innerHTML).toContain('50%')
  })

  it('separateur vertical et horizontal', () => {
    const h = ajouter('divider')
    const v = ajouter('divider', { vertical: true })
    render(<Canvas api={apiFactice} />)
    expect(vue(h).innerHTML).toContain('height: 1px')
    expect(vue(v).innerHTML).toContain('width: 1px')
  })
})

describe('rendu canevas des conteneurs semantiques', () => {
  function conteneur(kind: Parameters<typeof createContainerNode>[0], enfants: Node[] = []): FrameNode {
    const node = { ...createContainerNode(kind, { x: 10, y: 100, w: 300, h: 300 }), children: enfants }
    const { pageId, execute } = useEditorStore.getState()
    execute(createNodeCommand(pageId, ecran.id, node))
    return node
  }

  it('carte : ombre proportionnelle a l elevation', () => {
    const carte = conteneur('card')
    render(<Canvas api={apiFactice} />)
    expect(vue(carte).style.boxShadow).not.toBe('')
    expect(vue(carte).getAttribute('data-node-type')).toBe('card')
  })

  it('feuille basse : poignee ; tiroir : ombre laterale', () => {
    const feuille = conteneur('bottomSheet')
    const tiroir = conteneur('drawer')
    render(<Canvas api={apiFactice} />)
    expect(vue(feuille).querySelector('[data-container-decor="handle"]')).not.toBeNull()
    expect(vue(tiroir).style.boxShadow).toContain('4px')
  })

  it('liste avec separateurs : un filet entre chaque paire d enfants', () => {
    const a = createComponentNode('listTile', { x: 0, y: 0, w: 300, h: 72 })
    const b = createComponentNode('listTile', { x: 0, y: 72, w: 300, h: 72 })
    const c = createComponentNode('listTile', { x: 0, y: 144, w: 300, h: 72 })
    const liste = {
      ...createContainerNode('listView', { x: 10, y: 100, w: 300, h: 300 }, { dividers: true }),
      children: [a, b, c],
    }
    useEditorStore.getState().execute(createNodeCommand(useEditorStore.getState().pageId, ecran.id, liste))
    render(<Canvas api={apiFactice} />)
    expect(vue(liste).querySelectorAll('[data-container-decor="divider"]')).toHaveLength(2)
  })

  it('grille : les enfants sont repartis en colonnes sur le canevas (mise en page appliquee)', () => {
    const cellules = [0, 1, 2, 3].map(() => createComponentNode('avatar', { x: 0, y: 0, w: 10, h: 40 }))
    const grille = { ...createContainerNode('grid', { x: 0, y: 100, w: 360, h: 300 }), children: cellules }
    useEditorStore.getState().execute(createNodeCommand(useEditorStore.getState().pageId, ecran.id, grille))
    render(<Canvas api={apiFactice} />)
    const frames = cellules.map((c) => {
      const el = vue(c)
      return { left: el.style.left, top: el.style.top }
    })
    // 2 colonnes : 2 cellules par ligne, deux lignes.
    expect(frames[0]!.top).toBe(frames[1]!.top)
    expect(frames[0]!.left).not.toBe(frames[1]!.left)
    expect(frames[2]!.top).not.toBe(frames[0]!.top)
  })
})
