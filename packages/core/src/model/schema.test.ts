import { describe, expect, it } from 'vitest'
import { nodeSchema } from './schema'
import type { EllipseNode, FrameNode, ImageNode, LineNode, RectNode, TextNode } from './types'

describe('nodeSchema', () => {
  it('accepte une frame avec enfants imbriques', () => {
    const frame = {
      id: 'f1', name: 'Ecran', type: 'frame',
      frame: { x: 0, y: 0, w: 393, h: 852 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'column', gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'stretch' },
      fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }],
      strokes: [], cornerRadius: 0, clipsContent: true,
      children: [{ id: 't1', name: 'Titre', type: 'text', frame: { x: 0, y: 0, w: 100, h: 20 }, visible: true, locked: false, opacity: 1, rotation: 0, characters: 'Bonjour', style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' } }],
    }
    expect(nodeSchema.parse(frame)).toEqual(frame)
  })

  it('rejette un type de noeud inconnu', () => {
    expect(() => nodeSchema.parse({ type: 'hologramme' })).toThrow()
  })
})

// Garde contre la derive schema/type : `satisfies z.ZodType<X>` ne detecte
// pas une union de litteraux trop etroite (verifie manuellement en revue).
// Ces tests enumerent donc explicitement chaque valeur de chaque union de
// litteraux du modele, pour qu'un litteral ajoute au type et oublie dans le
// schema (ou l'inverse) fasse echouer un test plutot que de passer inapercu.
describe('unions de litteraux (garde contre la derive schema/type)', () => {
  // Annotees avec le type cible (pas `as const`) pour que chaque champ union
  // (mode, alignMain, alignCross, align, fit) garde le type union complet
  // (ex. LayoutMode) plutot qu'un litteral fige a une seule valeur : c'est ce
  // qui permet a la fois d'assigner n'importe quelle valeur valide dans la
  // boucle, et de faire echouer la compilation (via @ts-expect-error) sur une
  // valeur inventee.
  const baseFrame = (): FrameNode => ({
    id: 'f1',
    name: 'Ecran',
    type: 'frame',
    frame: { x: 0, y: 0, w: 393, h: 852 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    layout: {
      mode: 'column',
      gap: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      alignMain: 'start',
      alignCross: 'stretch',
    },
    fills: [],
    strokes: [],
    cornerRadius: 0,
    clipsContent: true,
    children: [],
  })

  const baseText = (): TextNode => ({
    id: 't1',
    name: 'Titre',
    type: 'text',
    frame: { x: 0, y: 0, w: 100, h: 20 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    characters: 'Bonjour',
    style: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      align: 'left',
    },
  })

  const baseRect = (): RectNode => ({
    id: 'r1',
    name: 'Rect',
    type: 'rect',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
    cornerRadius: 0,
  })

  const baseEllipse = (): EllipseNode => ({
    id: 'e1',
    name: 'Ellipse',
    type: 'ellipse',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
  })

  const baseImage = (): ImageNode => ({
    id: 'i1',
    name: 'Image',
    type: 'image',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    src: 'https://exemple.test/x.png',
    fit: 'cover',
  })

  const baseLine = (): LineNode => ({
    id: 'l1',
    name: 'Ligne',
    type: 'line',
    frame: { x: 0, y: 0, w: 10, h: 0 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    stroke: { color: { r: 0, g: 0, b: 0, a: 1 }, width: 1 },
  })

  it('type de noeud : accepte chaque variante et rejette une valeur inventee', () => {
    expect(() => nodeSchema.parse(baseFrame())).not.toThrow()
    expect(() => nodeSchema.parse(baseText())).not.toThrow()
    expect(() => nodeSchema.parse(baseRect())).not.toThrow()
    expect(() => nodeSchema.parse(baseEllipse())).not.toThrow()
    expect(() => nodeSchema.parse(baseImage())).not.toThrow()
    expect(() => nodeSchema.parse(baseLine())).not.toThrow()
    expect(() => nodeSchema.parse({ ...baseFrame(), type: 'hologramme' })).toThrow()
  })

  it('LayoutMode : accepte chaque valeur et rejette une valeur inventee', () => {
    for (const mode of ['absolute', 'row', 'column'] as const) {
      const frame = baseFrame()
      frame.layout = { ...frame.layout, mode }
      expect(() => nodeSchema.parse(frame)).not.toThrow()
    }
    const invalide = baseFrame()
    // @ts-expect-error valeur volontairement invalide pour le test
    invalide.layout = { ...invalide.layout, mode: 'diagonale' }
    expect(() => nodeSchema.parse(invalide)).toThrow()
  })

  it('Layout.alignMain : accepte chaque valeur et rejette une valeur inventee', () => {
    for (const alignMain of ['start', 'center', 'end', 'space-between'] as const) {
      const frame = baseFrame()
      frame.layout = { ...frame.layout, alignMain }
      expect(() => nodeSchema.parse(frame)).not.toThrow()
    }
    const invalide = baseFrame()
    // @ts-expect-error valeur volontairement invalide pour le test
    invalide.layout = { ...invalide.layout, alignMain: 'milieu' }
    expect(() => nodeSchema.parse(invalide)).toThrow()
  })

  it('Layout.alignCross : accepte chaque valeur et rejette une valeur inventee', () => {
    for (const alignCross of ['start', 'center', 'end', 'stretch'] as const) {
      const frame = baseFrame()
      frame.layout = { ...frame.layout, alignCross }
      expect(() => nodeSchema.parse(frame)).not.toThrow()
    }
    const invalide = baseFrame()
    // @ts-expect-error valeur volontairement invalide pour le test
    invalide.layout = { ...invalide.layout, alignCross: 'etire' }
    expect(() => nodeSchema.parse(invalide)).toThrow()
  })

  it('TextStyle.align : accepte chaque valeur et rejette une valeur inventee', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const text = baseText()
      text.style = { ...text.style, align }
      expect(() => nodeSchema.parse(text)).not.toThrow()
    }
    const invalide = baseText()
    // @ts-expect-error valeur volontairement invalide pour le test
    invalide.style = { ...invalide.style, align: 'justifie' }
    expect(() => nodeSchema.parse(invalide)).toThrow()
  })

  it('ImageNode.fit : accepte chaque valeur et rejette une valeur inventee', () => {
    for (const fit of ['cover', 'contain', 'fill'] as const) {
      const image = baseImage()
      image.fit = fit
      expect(() => nodeSchema.parse(image)).not.toThrow()
    }
    const invalide = baseImage()
    // @ts-expect-error valeur volontairement invalide pour le test
    invalide.fit = 'etire'
    expect(() => nodeSchema.parse(invalide)).toThrow()
  })
})

describe('colorSchema (via nodeSchema) : composantes bornees a 0..1', () => {
  it('rejette une composante hors bornes', () => {
    const text = {
      id: 't1', name: 'Titre', type: 'text' as const,
      frame: { x: 0, y: 0, w: 100, h: 20 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      characters: 'Bonjour',
      style: {
        fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0,
        color: { r: 500, g: 0, b: 0, a: 1 },
        align: 'left' as const,
      },
    }
    expect(() => nodeSchema.parse(text)).toThrow()
  })

  it('rejette une opacite hors bornes', () => {
    const text = {
      id: 't1', name: 'Titre', type: 'text' as const,
      frame: { x: 0, y: 0, w: 100, h: 20 },
      visible: true, locked: false, opacity: 1.5, rotation: 0,
      characters: 'Bonjour',
      style: {
        fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0,
        color: { r: 0, g: 0, b: 0, a: 1 },
        align: 'left' as const,
      },
    }
    expect(() => nodeSchema.parse(text)).toThrow()
  })
})
