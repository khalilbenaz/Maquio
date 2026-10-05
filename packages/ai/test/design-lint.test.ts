import { describe, expect, it } from 'vitest'
import { createDocument } from '@maquio/core'
import type { FrameNode, Layout, MaquioDocument, Node } from '@maquio/core'
import { lintDesign, touchedNodeIds } from '../src/design-lint'
import type { DocumentPatch } from '../src/patch'

const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
const absolute = { mode: 'absolute' as const, gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start' as const, alignCross: 'start' as const }

function text(id: string, characters: string, frame: { x: number; y: number; w: number; h: number }, fontSize = 16, lineHeight = 22): Node {
  return {
    ...base, id, name: id, type: 'text', frame, characters,
    style: { fontFamily: 'Inter', fontSize, fontWeight: 400, lineHeight, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
  }
}

function button(id: string, frame: { x: number; y: number; w: number; h: number }): Node {
  return { ...base, id, name: id, type: 'component', frame, kind: 'button', props: { label: 'Envoyer', variant: 'primary', disabled: false } } as Node
}

function screen(children: Node[], layout: Layout = absolute): FrameNode {
  return {
    ...base, id: 'ecran', name: 'Écran', type: 'frame', frame: { x: 0, y: 0, w: 393, h: 852 },
    layout, fills: [], strokes: [], cornerRadius: 0, clipsContent: true, children,
    device: { id: 'iphone', label: 'iPhone', width: 393, height: 852, pixelRatio: 3 },
  }
}

function docWith(...nodes: Node[]): MaquioDocument {
  const doc = createDocument('T')
  return { ...doc, pages: [{ ...doc.pages[0]!, nodes }] }
}

const all = (_doc: MaquioDocument) => new Set<string>(['ecran', 'a', 'b', 'c'])

describe('lintDesign', () => {
  it('ne signale rien pour un ecran propre', () => {
    const doc = docWith(screen([text('a', 'Solde', { x: 20, y: 80, w: 200, h: 22 }), button('b', { x: 20, y: 760, w: 353, h: 52 })]))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc))).toEqual([])
  })

  it('signale deux textes freres qui se chevauchent', () => {
    const doc = docWith(screen([text('a', 'Mon portefeuille', { x: 20, y: 80, w: 200, h: 22 }), text('b', 'Solde', { x: 30, y: 85, w: 200, h: 22 })]))
    const issues = lintDesign(doc, doc.pages[0]!.id, all(doc))
    expect(issues.join('\n')).toMatch(/"a".*"b".*chevauch/)
  })

  it('signale un texte rogne par un cadre trop petit, avec la hauteur necessaire', () => {
    const long = 'Votre virement de 1 284,30 MAD vers Yassine El Amrani a bien été envoyé et sera crédité sous 24 heures'
    const doc = docWith(screen([text('a', long, { x: 20, y: 80, w: 200, h: 22 })]))
    const issues = lintDesign(doc, doc.pages[0]!.id, all(doc))
    expect(issues.join('\n')).toMatch(/"a".*rogné.*h >= \d+/)
  })

  it('signale un element qui sort de son ecran', () => {
    const doc = docWith(screen([button('b', { x: 300, y: 760, w: 200, h: 52 })]))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc)).join('\n')).toMatch(/"b".*dépasse/)
  })

  it('signale une cible tactile trop petite', () => {
    const doc = docWith(screen([button('b', { x: 20, y: 760, w: 120, h: 30 })]))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc)).join('\n')).toMatch(/"b".*44/)
  })

  it('ne controle que les noeuds touches par le patch', () => {
    const doc = docWith(screen([text('a', 'X', { x: 20, y: 80, w: 200, h: 22 }), text('b', 'Y', { x: 20, y: 80, w: 200, h: 22 })]))
    expect(lintDesign(doc, doc.pages[0]!.id, new Set(['c']))).toEqual([])
  })

  it('tient compte de l auto-layout : des enfants en colonne ne se chevauchent pas', () => {
    const column = { ...absolute, mode: 'column' as const, gap: 8, padding: { top: 80, right: 20, bottom: 0, left: 20 } }
    const doc = docWith(screen([text('a', 'Un', { x: 0, y: 0, w: 200, h: 22 }), text('b', 'Deux', { x: 0, y: 0, w: 200, h: 22 })], column))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc))).toEqual([])
  })
})

describe('touchedNodeIds', () => {
  it('rend les noeuds inseres (et leurs descendants) et les noeuds modifies', () => {
    const patch: DocumentPatch = {
      summary: 's',
      ops: [
        { op: 'insertNode', parentId: null, node: screen([text('a', 'X', { x: 0, y: 0, w: 10, h: 10 })]) },
        { op: 'updateNode', nodeId: 'b', patch: { name: 'B' } },
        { op: 'deleteNode', nodeId: 'c' },
      ],
    }
    expect([...touchedNodeIds(patch)].sort()).toEqual(['a', 'b', 'ecran'])
  })
})

describe('lintDesign : couleur d accent', () => {
  const accent = { r: 0.06, g: 0.46, b: 0.43, a: 1 }
  const withAccent = (doc: MaquioDocument): MaquioDocument => ({ ...doc, tokens: { ...doc.tokens, colors: { ...doc.tokens.colors, accent } } })

  it('signale un composant teintable sans "color" quand le document a un accent', () => {
    const doc = withAccent(docWith(screen([button('b', { x: 20, y: 760, w: 353, h: 52 })])))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc)).join('\n')).toMatch(/"b".*"color".*accent/)
  })

  it('accepte un composant qui porte une couleur', () => {
    const b = { ...button('b', { x: 20, y: 760, w: 353, h: 52 }), props: { label: 'Envoyer', variant: 'primary', disabled: false, color: accent } } as Node
    const doc = withAccent(docWith(screen([b])))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc))).toEqual([])
  })

  it('ne dit rien sans token d accent', () => {
    const doc = docWith(screen([button('b', { x: 20, y: 760, w: 353, h: 52 })]))
    expect(lintDesign(doc, doc.pages[0]!.id, all(doc))).toEqual([])
  })
})
