import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentSchema } from '@calque/core'
import { describe, expect, it } from 'vitest'
import { figmaToDocument } from '../src/translate'
import type { FigmaFileResponse, FigmaNode } from '../src/figma-types'
import type { FrameNode } from '@calque/core'

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

// Meme chose que wrapAsFile, mais pour PLUSIEURS noeuds de premier niveau du
// canvas (v2, addendum navigation §3.1/§8 : une page Figma a plusieurs
// frames racines doit donner plusieurs ecrans Calque).
const wrapAsFileMulti = (nodes: FigmaNode[]): FigmaFileResponse => ({
  document: {
    id: '0:0',
    name: 'Doc',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Page',
        type: 'CANVAS',
        children: nodes,
      },
    ],
  },
})

// Reservee aux tests de donnees Figma hostiles/malformees (round de
// correction 1) : contourne intentionnellement le typage de FigmaNode pour
// simuler ce qu'une vraie reponse d'API malformee ferait a l'execution
// (name manquant, layoutMode hors de l'union litterale...). figma-types.ts
// n'est qu'un typage a la compilation, jamais verifie au runtime — c'est
// precisement ce que ces tests exercent.
const wrapAsFileUnsafe = (node: Record<string, unknown>): FigmaFileResponse =>
  ({
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
  }) as unknown as FigmaFileResponse

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

  // v2 (addendum navigation, §3.1 et §8 de l'addendum : "un import Figma a
  // plusieurs frames racines donne plusieurs ecrans"). Aucun traitement
  // special n'est necessaire cote traducteur : c'est une consequence directe
  // du modele v2 (une frame de premier niveau qui porte `device` EST un
  // ecran) -- ce test verifie que ce gain "gratuit" fonctionne reellement.
  it('une page a plusieurs frames racines donne plusieurs ecrans, chacun avec son propre device', () => {
    const { document } = figmaToDocument(
      wrapAsFileMulti([
        {
          id: 'ecran1',
          name: 'Connexion',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 393, height: 852 }, // iPhone 15
          children: [],
        },
        {
          id: 'ecran2',
          name: 'Accueil',
          type: 'FRAME',
          absoluteBoundingBox: { x: 500, y: 0, width: 412, height: 915 }, // Pixel 8
          children: [],
        },
      ]),
    )

    expect(document.pages).toHaveLength(1)
    const nodes = document.pages[0]!.nodes as FrameNode[]
    expect(nodes).toHaveLength(2)

    expect(nodes[0]!.id).toBe('ecran1')
    expect(nodes[0]!.device).toBeDefined()
    expect(nodes[0]!.device!.id).toBe('iphone15')
    // Position absolue (Figma) reprise telle quelle en (x, y) sur le plan
    // de travail (§3.1 : "frame.x et frame.y d'un ecran le positionnent sur
    // le plan de travail infini, ce qui donne gratuitement la disposition
    // cote a cote").
    expect(nodes[0]!.frame).toMatchObject({ x: 0, y: 0 })

    expect(nodes[1]!.id).toBe('ecran2')
    expect(nodes[1]!.device).toBeDefined()
    expect(nodes[1]!.device!.id).toBe('pixel8')
    expect(nodes[1]!.frame).toMatchObject({ x: 500, y: 0 })

    // Chaque ecran est individuellement valide au schema (device + frame
    // coherents), et le document entier l'est aussi (point 4 du brief v1).
    expect(() => documentSchema.parse(document)).not.toThrow()
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

// Correction Critical, round 1 : le relecteur a construit quatorze reponses
// Figma degenerees et documentSchema.parse levait sur cinq d'entre elles.
// Le traducteur assainit desormais a la frontiere plutot que de lever (voir
// sanitize.ts) ; ces tests reprennent les quatorze cas et verifient a la
// fois que le document produit reste valide et que chaque valeur reellement
// aberrante (par opposition a une simple absence, geree silencieusement)
// produit un avertissement portant le nodeId et la valeur d'origine.
describe('assainissement des donnees Figma hostiles (Critical, round 1)', () => {
  const cases: Array<{ label: string; file: FigmaFileResponse }> = [
    {
      label: 'absoluteBoundingBox absent',
      file: wrapAsFile({ id: 'n1', name: 'N1', type: 'RECTANGLE', fills: [], strokes: [] }),
    },
    {
      label: 'largeur negative',
      file: wrapAsFile({
        id: 'n2',
        name: 'N2',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: -50, height: 10 },
      }),
    },
    {
      label: 'hauteur negative',
      file: wrapAsFile({
        id: 'n3',
        name: 'N3',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: -50 },
      }),
    },
    {
      label: 'children vide',
      file: wrapAsFile({
        id: 'n4',
        name: 'N4',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        children: [],
      }),
    },
    {
      label: 'children absent',
      file: wrapAsFile({
        id: 'n5',
        name: 'N5',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
      }),
    },
    {
      label: 'opacity > 1',
      file: wrapAsFile({
        id: 'n6',
        name: 'N6',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        opacity: 2,
      }),
    },
    {
      label: 'opacity < 0',
      file: wrapAsFile({
        id: 'n7',
        name: 'N7',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        opacity: -1,
      }),
    },
    {
      label: 'composante de couleur > 1',
      file: wrapAsFile({
        id: 'n8',
        name: 'N8',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        fills: [{ type: 'SOLID', color: { r: 2, g: 0, b: 0, a: 1 } }],
      }),
    },
    {
      label: 'TEXT sans characters',
      file: wrapAsFile({
        id: 'n9',
        name: 'N9',
        type: 'TEXT',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400 },
      }),
    },
    {
      label: 'TEXT sans style',
      file: wrapAsFile({
        id: 'n10',
        name: 'N10',
        type: 'TEXT',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        characters: 'Bonjour',
      }),
    },
    {
      label: 'noeud sans name',
      file: wrapAsFileUnsafe({ id: 'n11', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }),
    },
    {
      label: 'CANVAS sans enfant',
      file: {
        document: {
          id: '0:0',
          name: 'Doc',
          type: 'DOCUMENT',
          children: [{ id: '0:1', name: 'Page vide', type: 'CANVAS', children: [] }],
        },
      },
    },
    {
      label: 'layoutMode inconnu',
      file: wrapAsFileUnsafe({
        id: 'n12',
        name: 'N12',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        layoutMode: 'DIAGONAL',
        children: [],
      }),
    },
    {
      label: 'imbrication a cinq niveaux',
      file: wrapAsFile(
        (() => {
          let n: FigmaNode = {
            id: 'deep-5',
            name: 'Niveau 5',
            type: 'RECTANGLE',
            absoluteBoundingBox: { x: 40, y: 40, width: 10, height: 10 },
          }
          for (let level = 4; level >= 1; level -= 1) {
            n = {
              id: `deep-${level}`,
              name: `Niveau ${level}`,
              type: 'FRAME',
              absoluteBoundingBox: {
                x: level * 10,
                y: level * 10,
                width: 100 - level * 10,
                height: 100 - level * 10,
              },
              children: [n],
            }
          }
          return n
        })(),
      ),
    },
  ]

  it.each(cases)('documentSchema.parse accepte le document malgre : $label', ({ file }) => {
    const { document } = figmaToDocument(file)
    expect(() => documentSchema.parse(document)).not.toThrow()
  })

  it('absoluteBoundingBox absent : positionne a (0,0) avec une taille nulle, avec avertissement', () => {
    const { document, report } = figmaToDocument(cases[0]!.file)
    const node = document.pages[0]!.nodes[0]! as { frame: { x: number; y: number; w: number; h: number } }
    expect(node.frame).toEqual({ x: 0, y: 0, w: 0, h: 0 })
    expect(report.warnings.some((w) => w.nodeId === 'n1' && /absoluteBoundingBox/.test(w.reason))).toBe(true)
  })

  it('largeur negative : ramenee a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[1]!.file)
    const node = document.pages[0]!.nodes[0]! as { frame: { w: number } }
    expect(node.frame.w).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'n2' && /-50/.test(w.reason))).toBe(true)
  })

  it('hauteur negative : ramenee a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[2]!.file)
    const node = document.pages[0]!.nodes[0]! as { frame: { h: number } }
    expect(node.frame.h).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'n3' && /-50/.test(w.reason))).toBe(true)
  })

  it('opacity > 1 : ramenee a 1 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[5]!.file)
    const node = document.pages[0]!.nodes[0]! as { opacity: number }
    expect(node.opacity).toBe(1)
    expect(report.warnings.some((w) => w.nodeId === 'n6' && /2/.test(w.reason))).toBe(true)
  })

  it('opacity < 0 : ramenee a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[6]!.file)
    const node = document.pages[0]!.nodes[0]! as { opacity: number }
    expect(node.opacity).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'n7' && /-1/.test(w.reason))).toBe(true)
  })

  it('composante de couleur > 1 : ramenee a 1 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[7]!.file)
    const node = document.pages[0]!.nodes[0]! as { fills: { type: string; color: { r: number } }[] }
    expect(node.fills[0]!.color.r).toBe(1)
    expect(report.warnings.some((w) => w.nodeId === 'n8' && /2/.test(w.reason))).toBe(true)
  })

  it('noeud sans name : nom de repli derive du type, avec avertissement', () => {
    const { document, report } = figmaToDocument(cases[10]!.file)
    const node = document.pages[0]!.nodes[0]!
    expect(node.name.length).toBeGreaterThan(0)
    expect(report.warnings.some((w) => w.nodeId === 'n11' && /[Nn]om/.test(w.reason))).toBe(true)
  })

  it('layoutMode inconnu : traite comme absolute, avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(cases[12]!.file)
    const node = document.pages[0]!.nodes[0]! as { layout: { mode: string } }
    expect(node.layout.mode).toBe('absolute')
    expect(report.warnings.some((w) => w.nodeId === 'n12' && /DIAGONAL/.test(w.reason))).toBe(true)
  })

  it('imbrication a cinq niveaux : la traduction descend jusqu au niveau le plus profond, sans avertissement', () => {
    const { document, report } = figmaToDocument(cases[13]!.file)
    let depth = 0
    let current: { children?: unknown[] } | undefined = document.pages[0]!.nodes[0] as { children?: unknown[] }
    while (current) {
      depth += 1
      current = current.children?.[0] as { children?: unknown[] } | undefined
    }
    expect(depth).toBe(5)
    expect(report.warnings).toEqual([])
  })

  it('children vide/absent et CANVAS sans enfant ne produisent aucun avertissement (etats Figma normaux)', () => {
    expect(figmaToDocument(cases[3]!.file).report.warnings).toEqual([])
    expect(figmaToDocument(cases[4]!.file).report.warnings).toEqual([])
    expect(figmaToDocument(cases[11]!.file).report.warnings).toEqual([])
  })
})

// Minor 1 (round 1) : FigmaNode.visible et FigmaPaint.visible sont declares
// et utilises par translate.ts mais n'etaient exerces par aucune fixture ni
// aucun test.
describe('visible sur un noeud et sur un remplissage (Minor 1, round 1)', () => {
  it('un noeud visible:false devient un noeud Calque avec visible:false', () => {
    const { document } = figmaToDocument(
      wrapAsFile({
        id: 'v1',
        name: 'Cache',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        visible: false,
        fills: [],
      }),
    )
    const node = document.pages[0]!.nodes[0]!
    expect(node.visible).toBe(false)
  })

  it('un noeud sans visible devient visible:true par defaut', () => {
    const { document } = figmaToDocument(
      wrapAsFile({
        id: 'v2',
        name: 'Par defaut',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        fills: [],
      }),
    )
    expect(document.pages[0]!.nodes[0]!.visible).toBe(true)
  })

  it('un remplissage visible:false est exclu sans avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'v3',
        name: 'Rect',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: false }],
      }),
    )
    const node = document.pages[0]!.nodes[0]! as { fills: unknown[] }
    expect(node.fills).toEqual([])
    expect(report.warnings).toEqual([])
  })

  it('un trait visible:false est exclu sans avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'v4',
        name: 'Rect trait',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 }, visible: false }],
      }),
    )
    const node = document.pages[0]!.nodes[0]! as { strokes: unknown[] }
    expect(node.strokes).toEqual([])
    expect(report.warnings).toEqual([])
  })
})

// Minor 2 (round 1) : un meme noeud texte peut etre traduit normalement ET
// relu par buildTokens parce qu'un style publie TEXT pointe vers lui, ce qui
// appelait deux fois translateTextStyle et dupliquait l'avertissement
// JUSTIFIED/BASELINE. Les avertissements identiques (meme nodeId, meme
// reason) sont desormais deduppliques.
describe('deduplication des avertissements (Minor 2, round 1)', () => {
  it('ne duplique pas l avertissement JUSTIFIED quand un style publie TEXT pointe vers le meme noeud', () => {
    const file: FigmaFileResponse = {
      document: {
        id: '0:0',
        name: 'Doc',
        type: 'DOCUMENT',
        children: [
          {
            id: '0:1',
            name: 'Page',
            type: 'CANVAS',
            children: [
              {
                id: 't1',
                name: 'Corps de texte',
                type: 'TEXT',
                absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
                characters: 'Bonjour',
                style: {
                  fontFamily: 'Inter',
                  fontSize: 14,
                  fontWeight: 400,
                  textAlignHorizontal: 'JUSTIFIED',
                },
                styles: { text: 'TS1' },
              },
            ],
          },
        ],
      },
      styles: { TS1: { name: 'Body', styleType: 'TEXT' } },
    }

    const { report } = figmaToDocument(file)
    const justified = report.warnings.filter((w) => /JUSTIFIED/.test(w.reason))
    expect(justified).toHaveLength(1)
    expect(justified[0]!.nodeId).toBe('t1')
  })
})

// Round de correction 1 (deuxieme ruling) : gap, padding.*, cornerRadius
// (frame et rect), Stroke.width et TextStyle.fontSize/lineHeight sont
// desormais bornes a 0..Infinity dans nodeSchema (packages/core). Un cas
// hostile par borne, avec l'avertissement correspondant citant la valeur
// d'origine. letterSpacing reste volontairement libre (verifie separement).
describe('nouvelles bornes du modele (gap, padding, cornerRadius, strokeWidth, fontSize, lineHeight)', () => {
  it('un gap negatif est ramene a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b1',
        name: 'Root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        layoutMode: 'VERTICAL',
        itemSpacing: -16,
        children: [],
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { layout: { gap: number } }
    expect(node.layout.gap).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'b1' && /itemSpacing/.test(w.reason) && /-16/.test(w.reason))).toBe(
      true,
    )
  })

  it('chaque cote de padding negatif est ramene a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b2',
        name: 'Root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        layoutMode: 'VERTICAL',
        paddingTop: -1,
        paddingRight: -2,
        paddingBottom: -3,
        paddingLeft: -4,
        children: [],
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { layout: { padding: { top: number; right: number; bottom: number; left: number } } }
    expect(node.layout.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    for (const [property, value] of [
      ['paddingTop', '-1'],
      ['paddingRight', '-2'],
      ['paddingBottom', '-3'],
      ['paddingLeft', '-4'],
    ]) {
      expect(
        report.warnings.some((w) => w.nodeId === 'b2' && w.reason.includes(property!) && w.reason.includes(value!)),
      ).toBe(true)
    }
  })

  it('un cornerRadius negatif sur une frame est ramene a 0 avec avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b3',
        name: 'Root',
        type: 'FRAME',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
        cornerRadius: -8,
        children: [],
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { cornerRadius: number }
    expect(node.cornerRadius).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'b3' && /cornerRadius/.test(w.reason) && /-8/.test(w.reason))).toBe(
      true,
    )
  })

  it('un cornerRadius negatif sur un rect est ramene a 0 avec avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b4',
        name: 'Rect',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        cornerRadius: -5,
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { cornerRadius: number }
    expect(node.cornerRadius).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'b4' && /cornerRadius/.test(w.reason) && /-5/.test(w.reason))).toBe(
      true,
    )
  })

  it('un strokeWeight negatif est ramene a 0 avec avertissement', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b5',
        name: 'Rect trait',
        type: 'RECTANGLE',
        absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
        strokeWeight: -2,
        strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { strokes: { width: number }[] }
    expect(node.strokes[0]!.width).toBe(0)
    expect(
      report.warnings.some((w) => w.nodeId === 'b5' && /strokeWeight/.test(w.reason) && /-2/.test(w.reason)),
    ).toBe(true)
  })

  it('un fontSize negatif est ramene a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b6',
        name: 'Texte',
        type: 'TEXT',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
        characters: 'Bonjour',
        style: { fontFamily: 'Inter', fontSize: -16, fontWeight: 400 },
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { style: { fontSize: number } }
    expect(node.style.fontSize).toBe(0)
    expect(report.warnings.some((w) => w.nodeId === 'b6' && /fontSize/.test(w.reason) && /-16/.test(w.reason))).toBe(
      true,
    )
  })

  it('un lineHeightPx negatif est ramene a 0 avec avertissement citant la valeur d origine', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b7',
        name: 'Texte',
        type: 'TEXT',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
        characters: 'Bonjour',
        style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeightPx: -24 },
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { style: { lineHeight: number } }
    expect(node.style.lineHeight).toBe(0)
    expect(
      report.warnings.some((w) => w.nodeId === 'b7' && /lineHeightPx/.test(w.reason) && /-24/.test(w.reason)),
    ).toBe(true)
  })

  it('un letterSpacing negatif reste accepte sans avertissement (crenage serre, usage legitime)', () => {
    const { document, report } = figmaToDocument(
      wrapAsFile({
        id: 'b8',
        name: 'Texte',
        type: 'TEXT',
        absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
        characters: 'Bonjour',
        style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, letterSpacing: -0.5 },
      }),
    )
    expect(() => documentSchema.parse(document)).not.toThrow()
    const node = document.pages[0]!.nodes[0]! as { style: { letterSpacing: number } }
    expect(node.style.letterSpacing).toBe(-0.5)
    expect(report.warnings).toEqual([])
  })

})
