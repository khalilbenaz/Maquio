// Projet d'exemple contenant TOUS les composants mobiles : trois ecrans relies
// par des liens (boutons, element de liste, entrees de la barre basse, tiroir),
// avec barre d'application, tiroir, barre de navigation basse, bouton flottant,
// feuille basse, boite de dialogue et snackbar. Sert de garde-fou « vrai
// compilateur » (flutter analyze, tsc, swiftc, Gradle) et d'exemple livre dans
// `exemples/tous-les-composants.calque`.
import {
  COMPONENT_KINDS,
  DEVICE_PRESETS,
  PALETTE_ITEMS,
  createDocument,
  createScreenNode,
  layoutPage,
} from '@calque/core'
import type { CalqueDocument, ComponentNode, FrameNode, Node, Rect } from '@calque/core'

const item = (id: string) => PALETTE_ITEMS.find((i) => i.id === id)!

// Noeud de palette place dans un cadre, avec un nom et des surcharges de props.
function make(id: string, frame: Partial<Rect>, name?: string, props: Record<string, unknown> = {}): Node {
  const entry = item(id)
  const node = entry.build({ x: 0, y: 0, w: entry.size.w, h: entry.size.h, ...frame })
  const withProps = node.type === 'component' ? ({ ...node, props: { ...node.props, ...props } } as ComponentNode) : node
  return name === undefined ? withProps : { ...withProps, name }
}

function within(frame: FrameNode, children: Node[], patch: Partial<FrameNode> = {}): FrameNode {
  return { ...frame, ...patch, children }
}

function text(name: string, characters: string, x: number, y: number, size = 20, weight = 600): Node {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'text',
    frame: { x, y, w: 300, h: size + 8 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    characters,
    style: {
      fontFamily: 'Roboto',
      fontSize: size,
      fontWeight: weight,
      lineHeight: size + 4,
      letterSpacing: 0,
      color: { r: 0.11, g: 0.1, b: 0.13, a: 1 },
      align: 'left',
    },
  }
}

// Identifiants STABLES (`ex-1`, `ex-2`...) : le fichier d'exemple livre dans
// `exemples/` doit etre reproductible octet pour octet, et les liens (cible
// d'un lien, d'une entree de barre) suivent la renumerotation.
function stabiliser(doc: CalqueDocument): CalqueDocument {
  const map = new Map<string, string>()
  let counter = 0
  const renumber = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      const id = `ex-${++counter}`
      map.set(node.id, id)
      return node.type === 'frame' ? { ...node, id, children: renumber(node.children) } : ({ ...node, id } as Node)
    })
  const retarget = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      let next: Node = node
      if (next.link) next = { ...next, link: { target: map.get(next.link.target) ?? next.link.target } }
      if (next.type === 'component' && (next.kind === 'bottomNav' || next.kind === 'tabs')) {
        const items = (next.props.items as { target?: string }[]).map((item) =>
          item.target === undefined ? item : { ...item, target: map.get(item.target) ?? item.target },
        )
        next = { ...next, props: { ...next.props, items } } as ComponentNode
      }
      return next.type === 'frame' ? { ...next, children: retarget(next.children) } : next
    })
  const page = doc.pages[0]!
  const nodes = retarget(renumber(page.nodes))
  return { ...doc, id: 'exemple-tous-les-composants', pages: [{ ...page, id: 'page-1', nodes }] }
}

export function documentExempleComplet(): CalqueDocument {
  return stabiliser(construireExemple())
}

function construireExemple(): CalqueDocument {
  const device = DEVICE_PRESETS.iphone15
  const frame = (x: number): Rect => ({ x, y: 0, w: device.width, h: device.height })
  const accueilBase = createScreenNode('Accueil', device, frame(0))
  const formulaireBase = createScreenNode('Formulaire', device, frame(500))
  const detailsBase = createScreenNode('Détails', device, frame(1000))

  const nav = (cible: Record<string, string>, selected: number): Node => {
    const base = make('bottomNav', { y: device.height - 80 }) as ComponentNode & { kind: 'bottomNav' }
    return {
      ...base,
      props: {
        selectedIndex: selected,
        items: [
          { label: 'Accueil', icon: 'home', target: cible.accueil },
          { label: 'Formulaire', icon: 'edit', target: cible.formulaire },
          { label: 'Détails', icon: 'info', target: cible.details },
        ],
      },
    } as ComponentNode
  }
  const cibles = { accueil: accueilBase.id, formulaire: formulaireBase.id, details: detailsBase.id }
  const link = (node: Node, target: string): Node => ({ ...node, link: { target } })

  // --- Accueil ---
  const drawer = within(make('drawer', {}, 'Tiroir') as FrameNode, [
    link(make('listTile', { w: 304, h: 56 }, 'Menu : formulaire', { title: 'Formulaire', subtitle: '', leadingIcon: 'edit', trailingIcon: 'chevronRight' }), cibles.formulaire),
    link(make('listTile', { w: 304, h: 56 }, 'Menu : détails', { title: 'Détails', subtitle: '', leadingIcon: 'info', trailingIcon: 'chevronRight' }), cibles.details),
    make('divider', { w: 304 }, 'Séparateur du tiroir'),
    make('listTile', { w: 304, h: 56 }, 'Menu : réglages', { title: 'Réglages', subtitle: '', leadingIcon: 'settings', trailingIcon: undefined }),
  ])
  const card = within(make('card', { x: 16, y: 120, w: 361, h: 232 }, 'Carte profil') as FrameNode, [
    make('avatar', { x: 0, y: 0 }, 'Avatar', { initials: 'LB' }),
    make('badge', { x: 36, y: 0 }, 'Badge', { text: '3' }),
    text('Nom', 'Lilou Benali', 64, 0, 18),
    make('chip', { x: 64, y: 32 }, 'Chip', { label: 'Premium' }),
    make('chip', { x: 168, y: 32 }, 'Chip filtre', { label: 'Actif', variant: 'filter', selected: true }),
    link(make('button', { x: 0, y: 88, w: 150, h: 44 }, 'Bouton primaire', { label: 'Voir détails', icon: 'arrowForward' }), cibles.details),
    make('button', { x: 160, y: 88, w: 150, h: 44 }, 'Bouton secondaire', { label: 'Modifier', variant: 'secondary' }),
    make('button', { x: 0, y: 140, w: 110, h: 44 }, 'Bouton texte', { label: 'Annuler', variant: 'text' }),
    make('button', { x: 120, y: 140, w: 150, h: 44 }, 'Bouton désactivé', { label: 'Indisponible', disabled: true }),
  ], { layout: { mode: 'absolute', gap: 0, padding: { top: 16, right: 16, bottom: 16, left: 16 }, alignMain: 'start', alignCross: 'start' } })
  const liste = within(make('listView', { x: 0, y: 440, w: 393, h: 216 }, 'Liste des messages') as FrameNode, [
    link(make('listTile', { w: 393, h: 72 }, 'Message 1', { title: 'Alice', subtitle: 'Bonjour !' }), cibles.details),
    make('listTile', { w: 393, h: 72 }, 'Message 2', { title: 'Bruno', subtitle: 'À demain', leadingIcon: 'email' }),
    make('listTile', { w: 393, h: 72 }, 'Message 3', { title: 'Camille', subtitle: 'Merci', leadingIcon: 'notifications' }),
  ], { container: { kind: 'listView', axis: 'vertical', dividers: true } })
  const rangee = within(make('row', { x: 16, y: 364, w: 361, h: 56 }, 'Rangée d’actions') as FrameNode, [
    make('icon', { w: 32, h: 32 }, 'Icône étoile', { name: 'star', size: 28 }),
    make('iconButton', {}, 'Bouton icône', { icon: 'favorite' }),
    make('iconButton', {}, 'Bouton icône plein', { icon: 'share', variant: 'filled' }),
    make('spacer', { w: 40, h: 40 }, 'Espaceur'),
    make('iconButton', {}, 'Bouton icône contour', { icon: 'edit', variant: 'outlined' }),
  ])
  const accueil = within(accueilBase, [
    make('appBar', {}, 'Barre d’application', { title: 'Accueil', leading: 'menu', actions: ['search', 'moreVert'] }),
    make('tabs', { y: 56 }, 'Onglets', { items: [{ label: 'Pour vous', icon: 'home' }, { label: 'Suivis' }, { label: 'Récents' }] }),
    text('Titre', 'Bienvenue', 16, 112 - 8, 20),
    card,
    rangee,
    liste,
    make('snackbar', { x: 16, y: 664 }, 'Snackbar', { message: 'Profil enregistré' }),
    link(make('fab', { x: 321, y: 668 }, 'Bouton flottant', { icon: 'add' }), cibles.formulaire),
    nav(cibles, 0),
    drawer,
  ])

  // --- Formulaire ---
  const champs = within(make('scrollView', { x: 0, y: 56, w: 393, h: 716 }, 'Formulaire défilant') as FrameNode, [
    make('textField', { w: 361 }, 'Champ e-mail', { label: 'E-mail', placeholder: 'nom@exemple.fr', leadingIcon: 'email' }),
    make('textField', { w: 361 }, 'Champ mot de passe', { label: 'Mot de passe', value: 'secret', password: true, leadingIcon: 'lock' }),
    make('textField', { w: 361, h: 120 }, 'Champ message', { label: 'Message', multiline: true, helperText: '280 caractères maximum' }),
    make('textField', { w: 361, h: 76 }, 'Champ en erreur', { label: 'Téléphone', value: '06', errorText: 'Numéro incomplet' }),
    make('checkbox', { w: 361 }, 'Case', { label: 'J’accepte les conditions' }),
    make('switch', { w: 361 }, 'Interrupteur', { label: 'Notifications' }),
    make('radio', { w: 361 }, 'Radio', { label: 'Livraison à domicile' }),
    make('slider', { w: 361 }, 'Curseur'),
    make('dropdown', { w: 361 }, 'Liste déroulante', { label: 'Pays', options: ['France', 'Maroc', 'Belgique'], selectedIndex: 1 }),
    make('datePicker', { w: 361 }, 'Date', { label: 'Date de naissance', value: '1990-04-12' }),
    make('progressBar', { w: 361 }, 'Progression'),
    make('spinner', {}, 'Chargement'),
    link(make('button', { w: 361, h: 48 }, 'Envoyer', { label: 'Envoyer' }), cibles.details),
  ], { layout: { mode: 'column', gap: 16, padding: { top: 16, right: 16, bottom: 16, left: 16 }, alignMain: 'start', alignCross: 'start' } })
  const formulaire = within(formulaireBase, [
    make('appBar', {}, 'Barre d’application', { title: 'Formulaire', leading: 'back', actions: [], centerTitle: true }),
    champs,
    make('dialog', { x: 56, y: 330 }, 'Confirmation', { title: 'Envoyer ?', message: 'Vos informations seront transmises.', confirmLabel: 'Envoyer', cancelLabel: 'Annuler' }),
    nav(cibles, 1),
  ])

  // --- Détails ---
  const cellule = (n: number): Node =>
    within(make('card', { w: 100, h: 90 }, `Cellule ${n}`, {}) as FrameNode, [text(`Cellule ${n}`, `Cellule ${n}`, 0, 0, 14, 500)], {
      layout: { mode: 'column', gap: 4, padding: { top: 12, right: 12, bottom: 12, left: 12 }, alignMain: 'start', alignCross: 'start' },
    })
  const grille = within(make('grid', { x: 0, y: 72, w: 393, h: 220 }, 'Grille') as FrameNode, [1, 2, 3, 4].map(cellule))
  const colonne = within(make('column', { x: 16, y: 304, w: 170, h: 130 }, 'Colonne') as FrameNode, [
    text('Ligne 1', 'Colonne : ligne 1', 0, 0, 14, 500),
    text('Ligne 2', 'Colonne : ligne 2', 0, 0, 14, 500),
    make('divider', { w: 120 }, 'Séparateur'),
  ])
  const pile = within(make('stack', { x: 206, y: 304, w: 171, h: 130 }, 'Pile') as FrameNode, [
    make('avatar', { x: 10, y: 10, w: 80, h: 80 }, 'Avatar pile', { initials: 'CD' }),
    make('badge', { x: 70, y: 8 }, 'Badge pile', { text: '9' }),
    make('divider', { x: 100, y: 10, w: 1, h: 100 }, 'Séparateur vertical', { vertical: true }),
  ])
  const zoneSure = within(make('safeArea', { x: 16, y: 450, w: 361, h: 60 }, 'Zone sûre') as FrameNode, [
    text('Zone sûre', 'Contenu dans la zone sûre', 0, 8, 14, 500),
  ])
  const feuille = within(make('bottomSheet', { y: 560, h: 220 }, 'Feuille basse') as FrameNode, [
    link(make('listTile', { w: 361, h: 56 }, 'Action : retour', { title: 'Retour à l’accueil', subtitle: '', leadingIcon: 'home', trailingIcon: undefined }), cibles.accueil),
    make('listTile', { w: 361, h: 56 }, 'Action : partager', { title: 'Partager', subtitle: '', leadingIcon: 'share', trailingIcon: undefined }),
  ])
  const details = within(detailsBase, [
    make('appBar', {}, 'Barre d’application', { title: 'Détails', leading: 'back', actions: ['share'] }),
    grille,
    colonne,
    pile,
    zoneSure,
    feuille,
    nav(cibles, 2),
  ])

  const doc = createDocument('Tous les composants', device)
  const page = { ...doc.pages[0]!, nodes: [accueil, formulaire, details] }
  // Positions deja materialisees, comme dans l'editeur.
  return { ...doc, pages: [layoutPage(page)] }
}

// Tous les `kind` de composant doivent apparaitre dans l'exemple : si le
// catalogue s'enrichit, ce garde-fou impose d'enrichir l'exemple.
export function kindsPresents(doc: CalqueDocument): Set<string> {
  const kinds = new Set<string>()
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === 'component') kinds.add(n.kind)
      if (n.type === 'frame') {
        if (n.container) kinds.add(n.container.kind)
        visit(n.children)
      }
    }
  }
  for (const p of doc.pages) visit(p.nodes)
  return kinds
}

export const TOUS_LES_KINDS: string[] = [...COMPONENT_KINDS]
