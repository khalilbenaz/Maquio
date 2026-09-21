import { describe, expect, it } from 'vitest'
import { documentSchema, nodeSchema } from './schema'
import type { CalqueDocument, DevicePreset, EllipseNode, FrameNode, ImageNode, LineNode, Page, RectNode, TextNode } from './types'

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

// Round de correction 1 (Tache 5) : la non-negativite de w/h est un invariant
// du MODELE (rectSchema), pas des commandes, car parseDocument, un Node deja
// invalide passe a createNodeCommand, ou un futur patch de Claude Code
// contournent tous la couche commandes sans jamais contourner nodeSchema.
// w: 0 reste accepte : une dimension nulle est un etat transitoire legitime
// (debut de trace d'une forme au canvas).
describe('rectSchema (via nodeSchema) : w/h non negatifs', () => {
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

  it('rejette une largeur negative et accepte une largeur nulle', () => {
    expect(() => nodeSchema.parse({ ...baseRect(), frame: { x: 0, y: 0, w: -10, h: 10 } })).toThrow()
    expect(() => nodeSchema.parse({ ...baseRect(), frame: { x: 0, y: 0, w: 0, h: 10 } })).not.toThrow()
  })

  it('rejette une hauteur negative et accepte une hauteur nulle', () => {
    expect(() => nodeSchema.parse({ ...baseRect(), frame: { x: 0, y: 0, w: 10, h: -10 } })).toThrow()
    expect(() => nodeSchema.parse({ ...baseRect(), frame: { x: 0, y: 0, w: 10, h: 0 } })).not.toThrow()
  })

  it('documentSchema rejette un document dont un noeud a une largeur negative, et accepte une largeur nulle', () => {
    const buildDoc = (frame: { x: number; y: number; w: number; h: number }) => ({
      version: 1,
      id: 'doc1',
      name: 'Test',
      pages: [
        {
          id: 'p1',
          name: 'Page 1',
          device: { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 },
          nodes: [{ ...baseRect(), frame }],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    })

    expect(() => documentSchema.parse(buildDoc({ x: 0, y: 0, w: -10, h: 10 }))).toThrow()
    expect(() => documentSchema.parse(buildDoc({ x: 0, y: 0, w: 0, h: 10 }))).not.toThrow()
  })
})

// Round de correction 1 (Tache 10) : un `gap` negatif produirait un
// chevauchement silencieux entre enfants d'une mise en page automatique,
// decouvert seulement en generant du code ou en rendant l'ecran. Meme
// frontiere que rectSchema ci-dessus (nodeSchema / documentSchema), pour les
// memes consommateurs (parseDocument, import Figma, futurs patchs de Claude
// Code). Zero reste accepte : un espacement nul est un etat legitime.
describe('layoutSchema (via nodeSchema) : gap et padding non negatifs', () => {
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

  it('rejette un gap negatif et accepte un gap nul', () => {
    const negatif = baseFrame()
    negatif.layout = { ...negatif.layout, gap: -8 }
    expect(() => nodeSchema.parse(negatif)).toThrow()

    const nul = baseFrame()
    nul.layout = { ...nul.layout, gap: 0 }
    expect(() => nodeSchema.parse(nul)).not.toThrow()
  })

  it('rejette chaque cote de padding negatif et accepte un padding nul', () => {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const negatif = baseFrame()
      negatif.layout = { ...negatif.layout, padding: { ...negatif.layout.padding, [side]: -4 } }
      expect(() => nodeSchema.parse(negatif)).toThrow()
    }

    const nul = baseFrame()
    nul.layout = { ...nul.layout, padding: { top: 0, right: 0, bottom: 0, left: 0 } }
    expect(() => nodeSchema.parse(nul)).not.toThrow()
  })
})

// Round de correction 1 (Tache 10) : un rayon d'arrondi negatif n'a pas de
// sens (`BorderRadius.circular(-8)` dans du Dart genere serait la premiere
// occasion de le decouvrir). Verifie sur frame ET rect, qui portent chacun
// leur propre `cornerRadius` dans le schema.
describe('cornerRadius (via nodeSchema, frame et rect) : non negatif', () => {
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
      mode: 'absolute',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      alignMain: 'start',
      alignCross: 'start',
    },
    fills: [],
    strokes: [],
    cornerRadius: 0,
    clipsContent: false,
    children: [],
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

  it('rejette un cornerRadius negatif sur une frame et accepte zero', () => {
    expect(() => nodeSchema.parse({ ...baseFrame(), cornerRadius: -8 })).toThrow()
    expect(() => nodeSchema.parse({ ...baseFrame(), cornerRadius: 0 })).not.toThrow()
  })

  it('rejette un cornerRadius negatif sur un rect et accepte zero', () => {
    expect(() => nodeSchema.parse({ ...baseRect(), cornerRadius: -8 })).toThrow()
    expect(() => nodeSchema.parse({ ...baseRect(), cornerRadius: 0 })).not.toThrow()
  })
})

// Round de correction 1 (Tache 10) : une epaisseur de trait negative n'a pas
// de sens. Verifie via LineNode.stroke, qui est le seul endroit du modele ou
// un Stroke unique (pas un tableau) est directement au premier niveau d'un
// noeud.
describe('strokeSchema (via nodeSchema, LineNode.stroke) : width non negatif', () => {
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

  it('rejette une largeur de trait negative et accepte une largeur nulle', () => {
    expect(() => nodeSchema.parse({ ...baseLine(), stroke: { ...baseLine().stroke, width: -1 } })).toThrow()
    expect(() => nodeSchema.parse({ ...baseLine(), stroke: { ...baseLine().stroke, width: 0 } })).not.toThrow()
  })
})

// Round de correction 1 (Tache 10) : fontSize et lineHeight negatifs n'ont
// pas de sens. letterSpacing reste volontairement non borne (un crenage
// negatif est un usage typographique legitime) : verifie qu'il reste
// accepte, pour qu'une future borne ajoutee par erreur sur ce champ se voie
// immediatement dans ce test.
describe('textStyleSchema (via nodeSchema) : fontSize et lineHeight non negatifs, letterSpacing libre', () => {
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

  it('rejette un fontSize negatif et accepte zero', () => {
    const negatif = baseText()
    negatif.style = { ...negatif.style, fontSize: -16 }
    expect(() => nodeSchema.parse(negatif)).toThrow()

    const nul = baseText()
    nul.style = { ...nul.style, fontSize: 0 }
    expect(() => nodeSchema.parse(nul)).not.toThrow()
  })

  it('rejette un lineHeight negatif et accepte zero', () => {
    const negatif = baseText()
    negatif.style = { ...negatif.style, lineHeight: -1.4 }
    expect(() => nodeSchema.parse(negatif)).toThrow()

    const nul = baseText()
    nul.style = { ...nul.style, lineHeight: 0 }
    expect(() => nodeSchema.parse(nul)).not.toThrow()
  })

  it('accepte un letterSpacing negatif (crenage serre, usage typographique legitime)', () => {
    const serre = baseText()
    serre.style = { ...serre.style, letterSpacing: -0.5 }
    expect(() => nodeSchema.parse(serre)).not.toThrow()
  })
})

// v2 (addendum navigation, 2026-09-21) : FrameNode.device (§3.1) et
// NodeBase.link (§3.2). Les regles de validite d'un lien sont imposees ICI,
// par pageSchema (voir checkLinks dans schema.ts), en plus des commandes
// (setLinkCommand, teste dans commands/edits.test.ts) -- un document
// malforme (fichier .calque modifie a la main, patch de Claude Code) ne
// doit jamais pouvoir etre charge avec un lien invalide.
describe('FrameNode.device et NodeBase.link (v2, addendum navigation)', () => {
  const device: DevicePreset = { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }

  function rect(id: string, link?: { target: string }): RectNode {
    return {
      id,
      name: id,
      type: 'rect',
      frame: { x: 0, y: 0, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
      ...(link ? { link } : {}),
    }
  }

  function screen(id: string, children: RectNode[] = []): FrameNode {
    return {
      id,
      name: id,
      type: 'frame',
      frame: { x: 0, y: 0, w: device.width, h: device.height },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [],
      strokes: [],
      cornerRadius: 0,
      clipsContent: false,
      children,
      device,
    }
  }

  function documentWith(pageNodes: FrameNode[]): CalqueDocument {
    const page: Page = { id: 'page1', name: 'Page 1', device, nodes: pageNodes }
    return { version: 2, id: 'doc1', name: 'Doc', pages: [page], tokens: { colors: {}, typography: {}, spacing: {} } }
  }

  it('accepte une frame de premier niveau sans device (pas un ecran) comme avant cet addendum', () => {
    expect(() => nodeSchema.parse(screen('f1'))).not.toThrow()
    const { device: _d, ...sansDevice } = screen('f1')
    expect(() => nodeSchema.parse(sansDevice)).not.toThrow()
  })

  it("accepte un lien vers un ecran valide d'une autre frame de la meme page", () => {
    const doc = documentWith([screen('ecranA', [rect('bouton', { target: 'ecranB' })]), screen('ecranB')])
    expect(() => documentSchema.parse(doc)).not.toThrow()
  })

  it("refuse un lien vers une cible qui n'existe pas dans la page", () => {
    const doc = documentWith([screen('ecranA', [rect('bouton', { target: 'introuvable' })])])
    expect(() => documentSchema.parse(doc)).toThrow()
  })

  it("refuse un lien vers l'ecran qui contient le noeud lui-meme", () => {
    const doc = documentWith([screen('ecranA', [rect('bouton', { target: 'ecranA' })])])
    expect(() => documentSchema.parse(doc)).toThrow()
  })

  it('refuse un ecran qui se lie a lui-meme directement (pas seulement un de ses descendants)', () => {
    const auto = { ...screen('ecranA'), link: { target: 'ecranA' } }
    const doc = documentWith([auto, screen('ecranB')])
    expect(() => documentSchema.parse(doc)).toThrow()
  })

  it("refuse un lien vers une frame qui n'est pas un ecran (pas de device, meme si de premier niveau)", () => {
    const { device: _d, ...pasUnEcran } = screen('ordinaire')
    const doc = documentWith([screen('ecranA', [rect('bouton', { target: 'ordinaire' })]), pasUnEcran as FrameNode])
    expect(() => documentSchema.parse(doc)).toThrow()
  })
})
