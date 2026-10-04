// Document compact pour les fichiers temoins des composants : deux ecrans
// relies (Connexion -> Accueil), couvrant les trois grandes familles de
// sortie (Scaffold avec barre et barre basse, formulaire, liste). Identifiants
// STABLES : les sorties (cles de style React Native, etc.) en dependent.
import type { CalqueDocument, ComponentNode, FrameNode, Node } from '@calque/core'
import { docOf, linked, make, parent, screen } from '../helpers/composants'

type Renumbered = { nodes: Node[]; map: Map<string, string> }

function renumber(nodes: Node[], map: Map<string, string>, counter: { n: number }): Node[] {
  return nodes.map((node) => {
    const id = `n${++counter.n}`
    map.set(node.id, id)
    const next = { ...node, id } as Node
    if (next.type === 'frame') return { ...next, children: renumber(next.children, map, counter) }
    return next
  })
}

function retarget(nodes: Node[], map: Map<string, string>): Node[] {
  return nodes.map((node) => {
    let next: Node = node
    if (next.interactions) next = { ...next, interactions: next.interactions.map((i) => (i.action.type === 'navigate' ? { ...i, action: { ...i.action, target: map.get(i.action.target) ?? i.action.target } } : i)) }
    if (next.type === 'component' && (next.kind === 'bottomNav' || next.kind === 'tabs')) {
      const items = (next.props.items as { target?: string }[]).map((item) =>
        item.target === undefined ? item : { ...item, target: map.get(item.target) ?? item.target },
      )
      next = { ...next, props: { ...next.props, items } } as ComponentNode
    }
    if (next.type === 'frame') return { ...next, children: retarget(next.children, map) }
    return next
  })
}

export function documentComposants(): CalqueDocument {
  const accueil = screen('Accueil', [], 500)
  const connexion = screen('Connexion', [
    make('appBar', {}, { title: 'Connexion', leading: 'none', centerTitle: true }),
    make('textField', { x: 16, y: 120, w: 361 }, { label: 'E-mail', placeholder: 'nom@exemple.fr', leadingIcon: 'email' }),
    make('textField-password', { x: 16, y: 200, w: 361 }),
    make('switch', { x: 16, y: 280, w: 361 }, { label: 'Se souvenir de moi' }),
    linked(make('button', { x: 16, y: 340, w: 361, h: 48 }, { label: 'Se connecter' }), accueil.id),
    make('button-text', { x: 16, y: 400, w: 361, h: 44 }, { label: 'Mot de passe oublié' }),
  ])
  const liste = parent(make('listView', { x: 0, y: 56, w: 393, h: 216 }) as FrameNode, [
    make('listTile', { w: 393, h: 72 }, { title: 'Alice', subtitle: 'Bonjour !' }),
    make('listTile', { w: 393, h: 72 }, { title: 'Bruno', subtitle: 'À demain' }),
  ])
  const accueilComplet: FrameNode = {
    ...accueil,
    children: [
      make('appBar', {}, { title: 'Messages', leading: 'back', actions: ['search'] }),
      liste,
      make('fab', { x: 321, y: 690 }),
      make('bottomNav', { y: 772 }, {
        items: [
          { label: 'Accueil', icon: 'home', target: accueil.id },
          { label: 'Connexion', icon: 'person', target: connexion.id },
        ],
      }),
    ],
  }
  const doc = docOf(connexion, accueilComplet)
  const map = new Map<string, string>()
  const stable = renumber(doc.pages[0]!.nodes, map, { n: 0 })
  const nodes = retarget(stable, map)
  return { ...doc, id: 'doc-composants', pages: [{ ...doc.pages[0]!, id: 'page-1', nodes }] }
}

export type { Renumbered }
