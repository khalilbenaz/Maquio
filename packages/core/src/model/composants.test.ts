// Noeuds `component`, conteneurs semantiques et migration v3 (composants
// mobiles) : schema, validation des props par kind, liens des barres de
// navigation, et ouverture des anciens documents.
import { describe, expect, it } from 'vitest'
import { tapLink } from './interactions'
import {
  COMPONENT_KINDS,
  PALETTE_ITEMS,
  createComponentNode,
  createContainerNode,
  createDocument,
  createScreenNode,
  documentSchema,
  nodeSchema,
  parseDocument,
  serializeDocument,
  DEVICE_PRESETS,
} from '../index'
import type { CalqueDocument, ComponentNode, FrameNode, Node } from '../index'

const RECT = { x: 0, y: 0, w: 100, h: 40 }

function screenWith(children: Node[]) {
  return createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, children)
}

function docWith(...screens: FrameNode[]): CalqueDocument {
  const doc = createDocument('Test')
  return { ...doc, pages: [{ ...doc.pages[0]!, nodes: screens }] }
}

describe('nodeSchema : component', () => {
  it('accepte un composant de chaque kind avec ses valeurs par defaut', () => {
    for (const kind of COMPONENT_KINDS) {
      const node = createComponentNode(kind, RECT)
      expect(nodeSchema.safeParse(node).success, kind).toBe(true)
    }
  })

  it('refuse un kind inconnu', () => {
    const node = { ...createComponentNode('button', RECT), kind: 'hologramme' }
    expect(nodeSchema.safeParse(node).success).toBe(false)
  })

  it('refuse des props qui ne correspondent pas au kind, avec un chemin props.*', () => {
    const base = createComponentNode('button', RECT) as ComponentNode
    const node = { ...base, props: { ...base.props, variant: 'ghost' } }
    const result = nodeSchema.safeParse(node)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === 'props' && i.path[1] === 'variant')).toBe(true)
  })

  it('refuse les props d un autre kind (switch sans label)', () => {
    const node = { ...createComponentNode('switch', RECT), props: { checked: true } }
    expect(nodeSchema.safeParse(node).success).toBe(false)
  })

  it('refuse une cle inconnue au niveau du noeud', () => {
    expect(nodeSchema.safeParse({ ...createComponentNode('button', RECT), bogus: 1 }).success).toBe(false)
  })

  it('un composant ne porte pas d enfants', () => {
    expect(nodeSchema.safeParse({ ...createComponentNode('button', RECT), children: [] }).success).toBe(false)
  })

  it('accepte un lien de navigation sur un composant (reutilise NodeBase.link)', () => {
    const target = screenWith([])
    const button = { ...createComponentNode('button', RECT), interactions: [tapLink(target.id)] }
    const source = createScreenNode('Source', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [button])
    expect(documentSchema.safeParse(docWith(target, source)).success).toBe(true)
  })

  it('valide aussi les props des composants imbriques dans une frame', () => {
    const bad = { ...createComponentNode('slider', RECT), props: { value: 500, min: 0, max: 100, disabled: false } }
    const doc = docWith(screenWith([bad as Node]))
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })
})

describe('frame.container', () => {
  it('accepte chaque conteneur par defaut', () => {
    for (const item of PALETTE_ITEMS.filter((i) => ['card', 'listView', 'grid', 'scrollView', 'safeArea', 'bottomSheet', 'drawer'].includes(i.id))) {
      expect(nodeSchema.safeParse(item.build({ x: 0, y: 0, w: 100, h: 100 })).success, item.id).toBe(true)
    }
  })

  it('refuse un conteneur inconnu ou mal forme', () => {
    const card = createContainerNode('card', RECT)
    expect(nodeSchema.safeParse({ ...card, container: { kind: 'tiroir-magique' } }).success).toBe(false)
    expect(nodeSchema.safeParse({ ...card, container: { kind: 'card', elevation: -1 } }).success).toBe(false)
    expect(nodeSchema.safeParse({ ...card, container: { kind: 'grid', columns: 0 } }).success).toBe(false)
  })

  it('un conteneur peut contenir des composants', () => {
    const card = { ...createContainerNode('card', { x: 0, y: 0, w: 300, h: 200 }), children: [createComponentNode('button', RECT)] }
    expect(nodeSchema.safeParse(card).success).toBe(true)
  })
})

describe('cibles de navigation des barres (bottomNav, tabs)', () => {
  it('accepte une entree qui vise un ecran existant, y compris l ecran qui la contient', () => {
    const other = screenWith([])
    const nav = createComponentNode('bottomNav', { x: 0, y: 772, w: 393, h: 80 })
    const items = (nav as { props: { items: { label: string; icon: string; target?: string }[] } }).props.items
    items[0]!.target = other.id
    const screen = createScreenNode('Courant', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [nav])
    items[1]!.target = screen.id
    expect(documentSchema.safeParse(docWith(other, screen)).success).toBe(true)
  })

  it('refuse une entree qui vise un ecran inexistant', () => {
    const nav = createComponentNode('tabs', RECT)
    ;(nav as { props: { items: { label: string; target?: string }[] } }).props.items[0]!.target = 'fantome'
    expect(documentSchema.safeParse(docWith(screenWith([nav]))).success).toBe(false)
  })
})

describe('migration v1/v2 -> v3', () => {
  function jsonAtVersion(version: number, doc: CalqueDocument): string {
    return JSON.stringify({ ...doc, version })
  }

  it('ouvre un document v2 (ecrans et liens) : le lien devient tap -> navigate, version 4', () => {
    const target = screenWith([])
    const rect = {
      id: 'r',
      name: 'r',
      type: 'rect' as const,
      frame: RECT,
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
      link: { target: target.id },
    } as unknown as Node
    const source = createScreenNode('Source', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, [rect])
    const v2 = docWith(target, source)
    const migre = parseDocument(jsonAtVersion(2, v2))
    expect(migre.version).toBe(4)
    const migrated = (migre.pages[0]!.nodes[1] as FrameNode).children[0]!
    expect('link' in migrated).toBe(false)
    expect(migrated.interactions).toEqual([tapLink(target.id)])
    expect(migre.tokens).toEqual(v2.tokens)
  })

  it('ouvre un document v1 : ecran enveloppe puis version 4', () => {
    const doc = createDocument('v1')
    const page = doc.pages[0]!
    const v1: CalqueDocument = { ...doc, pages: [{ ...page, nodes: [{ id: 'r', name: 'r', type: 'rect', frame: RECT, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 }] }] }
    const migre = parseDocument(jsonAtVersion(1, v1))
    expect(migre.version).toBe(4)
    const top = migre.pages[0]!.nodes[0] as FrameNode
    expect(top.type).toBe('frame')
    expect(top.device).toBeDefined()
    expect(top.children.map((c) => c.id)).toEqual(['r'])
  })

  it('un document v3 avec composants fait l aller-retour sans perte', () => {
    const container = {
      ...createContainerNode('card', { x: 0, y: 100, w: 300, h: 200 }),
      children: [createComponentNode('textField', RECT), createComponentNode('switch', { x: 0, y: 50, w: 100, h: 40 })],
    }
    const doc = docWith(screenWith([createComponentNode('appBar', { x: 0, y: 0, w: 393, h: 56 }), container]))
    const relu = parseDocument(serializeDocument(doc))
    expect(relu).toEqual(doc)
  })

  it('refuse toujours un document plus recent que v4', () => {
    expect(() => parseDocument(JSON.stringify({ ...createDocument('X'), version: 5 }))).toThrow(/récente/)
  })
})
