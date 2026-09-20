import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentSchema } from '@calque/core'
import { describe, expect, it } from 'vitest'
import { figmaToDocument } from '../src/translate'
import type { FigmaFileResponse, FigmaNode } from '../src/figma-types'

const fixture = (n: string): FigmaFileResponse =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8'))

// Construit un FigmaFileResponse minimal dont l'unique noeud de page est
// celui fourni : sert aux tests de correspondance de type / mise en page qui
// n'ont pas besoin d'une fixture disque dediee.
const wrapAsFile = (node: FigmaNode): FigmaFileResponse => ({
  document: {
    id: '0:0',
    name: 'Doc',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Page',
        type: 'CANVAS',
        children: [node],
      },
    ],
  },
})

describe('figmaToDocument', () => {
  it('traduit une page, une frame, un texte et un rectangle', () => {
    const { document, report } = figmaToDocument(fixture('simple-file.json'))
    expect(document.pages).toHaveLength(1)
    const root = document.pages[0]!.nodes[0]!
    expect(root.type).toBe('frame')
    expect(root.frame).toEqual({ x: 0, y: 0, w: 393, h: 852 })
    expect(report.warnings).toEqual([])
    expect(report.nodesImported).toBe(4)
  })

  it('convertit les coordonnees absolues de Figma en coordonnees relatives au parent', () => {
    const { document } = figmaToDocument(fixture('simple-file.json'))
    const root = document.pages[0]!.nodes[0]! as { children: { frame: { x: number; y: number } }[] }
    expect(root.children[0]!.frame).toMatchObject({ x: 24, y: 60 })
  })

  it('traduit layoutMode en mise en page automatique', () => {
    const { document } = figmaToDocument(fixture('autolayout-file.json'))
    const root = document.pages[0]!.nodes[0]! as { layout: { mode: string; gap: number } }
    expect(root.layout.mode).toBe('column')
    expect(root.layout.gap).toBe(16)
  })

  it('aplatit un COMPONENT et une INSTANCE en frames', () => {
    const { document } = figmaToDocument(fixture('autolayout-file.json'))
    const types: string[] = []
    JSON.stringify(document, (k, v) => (k === 'type' ? (types.push(v as string), v) : v))
    expect(types).not.toContain('component')
    expect(types).not.toContain('instance')
  })

  it('remplace un noeud non convertible par un espace reserve et l annonce', () => {
    const { document, report } = figmaToDocument(fixture('unsupported-file.json'))
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]!.reason).toMatch(/BOOLEAN_OPERATION/)
    expect(document.pages[0]!.nodes[0]!.type).toBe('image')
  })

  it('alimente les tokens depuis les styles publies', () => {
    const { document } = figmaToDocument(fixture('simple-file.json'))
    expect(Object.keys(document.tokens.colors)).toContain('primary')
  })

  it('choisit le preset d appareil le plus proche de la frame racine', () => {
    const { document } = figmaToDocument(fixture('simple-file.json'))
    expect(document.pages[0]!.device.id).toBe('iphone15')
  })
})

// Point 4 du brief : documentSchema.parse ne doit jamais lever sur un
// document produit par le traducteur, quelle que soit la fixture.
describe('validite du document produit (point 4)', () => {
  it.each(['simple-file.json', 'autolayout-file.json', 'unsupported-file.json'])(
    'documentSchema.parse accepte le document issu de %s',
    (name) => {
      const { document } = figmaToDocument(fixture(name))
      expect(() => documentSchema.parse(document)).not.toThrow()
    },
  )
})

// Point 5 du brief : fonction pure et deterministe, jamais crypto.randomUUID.
describe('determinisme (point 5)', () => {
  it('deux traductions du meme fichier Figma rendent des documents identiques', () => {
    const file = fixture('simple-file.json')
    const first = figmaToDocument(file)
    const second = figmaToDocument(file)
    expect(first.document).toEqual(second.document)
    expect(first.report).toEqual(second.report)
  })

  it('reprend les identifiants Figma tels quels, sans en generer de nouveaux', () => {
    const { document } = figmaToDocument(fixture('simple-file.json'))
    const root = document.pages[0]!.nodes[0]!
    expect(root.id).toBe('1:1')
    expect(document.pages[0]!.id).toBe('0:1')
    expect(document.id).toBe('0:0')
  })
})

// Point 6 du brief : correspondances de types de noeuds.
describe('correspondances de types (point 6)', () => {
  it('LINE devient line', () => {
    const { document } = figmaToDocument(
      wrapAsFile({
        id: 'l1',
        name: 'Line',
        type: 'LINE',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 0 },
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 2,
      }),
    )
    expect(document.pages[0]!.nodes[0]!.type).toBe('line')
  })

  it('un VECTOR simple (une dimension nulle) devient line, sans avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'v1',
        name: 'Vec',
        type: 'VECTOR',
        absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 0 },
      }),
    )
    expect(document.pages[0]!.nodes[0]!.type).toBe('line')
    expect(report.warnings).toEqual([])
  })

  it('un VECTOR complexe devient un espace reserve image avec avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'v2',
        name: 'Vec2',
        type: 'VECTOR',
        absoluteBoundingBox: { x: 0, y: 0, width: 50, height: 50 },
      }),
    )
    expect(document.pages[0]!.nodes[0]!.type).toBe('image')
    expect(report.warnings[0]!.reason).toMatch(/VECTOR/)
  })

  it('GROUP et COMPONENT_SET deviennent frame', () => {
    for (const type of ['GROUP', 'COMPONENT_SET']) {
      const { document } = figmaToDocument(
        wrapAsFile({
          id: 'g1',
          name: 'G',
          type,
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
          children: [],
        }),
      )
      expect(document.pages[0]!.nodes[0]!.type).toBe('frame')
    }
  })

  it.each(['STAR', 'POLYGON', 'SLICE'])(
    '%s devient un espace reserve image avec avertissement nommant le type',
    (type) => {
      const { document, report } = figmaToDocument(
        wrapAsFile({
          id: 's1',
          name: 'S',
          type,
          absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        }),
      )
      expect(document.pages[0]!.nodes[0]!.type).toBe('image')
      expect(report.warnings[0]!.reason).toContain(type)
    },
  )
})

// Point 7 du brief : mise en page automatique (mode, gap, padding, alignements).
describe('mise en page automatique (point 7)', () => {
  it('mappe primaryAxisAlignItems et counterAxisAlignItems', () => {
    const { document } = figmaToDocument(
      wrapAsFile({
        id: 'f1',
        name: 'F',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        layoutMode: 'HORIZONTAL',
        itemSpacing: 4,
        paddingTop: 1,
        paddingRight: 2,
        paddingBottom: 3,
        paddingLeft: 4,
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'MAX',
        children: [],
      }),
    )
    const root = document.pages[0]!.nodes[0]! as {
      layout: { mode: string; gap: number; padding: unknown; alignMain: string; alignCross: string }
    }
    expect(root.layout).toMatchObject({
      mode: 'row',
      gap: 4,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      alignMain: 'space-between',
      alignCross: 'end',
    })
  })

  it('approxime BASELINE en start avec avertissement (point 10)', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'f2',
        name: 'F2',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        layoutMode: 'VERTICAL',
        counterAxisAlignItems: 'BASELINE',
        children: [],
      }),
    )
    const root = document.pages[0]!.nodes[0]! as { layout: { alignCross: string } }
    expect(root.layout.alignCross).toBe('start')
    expect(report.warnings.some((w) => /BASELINE/.test(w.reason))).toBe(true)
  })

  it('absence de layoutMode (ou NONE) donne le mode absolute', () => {
    const { document } = figmaToDocument(
      wrapAsFile({
        id: 'f3',
        name: 'F3',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [],
      }),
    )
    const root = document.pages[0]!.nodes[0]! as { layout: { mode: string } }
    expect(root.layout.mode).toBe('absolute')
  })
})

// Point 10 du brief : aucune perte silencieuse, chaque avertissement nomme
// le noeud et la raison en francais.
describe('avertissements explicites (point 10)', () => {
  it('chaque avertissement precise le noeud Figma concerne et une raison en francais', () => {
    const { report } = figmaToDocument(fixture('unsupported-file.json'))
    expect(report.warnings[0]).toMatchObject({ nodeId: '3:1', nodeName: 'Weird Shape' })
    expect(report.warnings[0]!.reason.length).toBeGreaterThan(0)
  })

  it('un remplissage Figma non SOLID est ignore avec avertissement', () => {
    const { report } = figmaToDocument(
      wrapAsFile({
        id: 'r1',
        name: 'Rect dégradé',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        fills: [{ type: 'GRADIENT_LINEAR' }],
      }),
    )
    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0]!.reason).toMatch(/GRADIENT_LINEAR/)
  })
})

// Point 11 du brief : nodesImported compte les noeuds Calque reellement
// produits, espaces reserves compris, hors pages et hors document.
describe('comptage des noeuds importes (point 11)', () => {
  it('compte 1 pour un espace reserve isole', () => {
    const { report } = figmaToDocument(fixture('unsupported-file.json'))
    expect(report.nodesImported).toBe(1)
  })

  it('compte recursivement les enfants des frames (root + COMPONENT + INSTANCE)', () => {
    const { report } = figmaToDocument(fixture('autolayout-file.json'))
    expect(report.nodesImported).toBe(3)
  })
})
