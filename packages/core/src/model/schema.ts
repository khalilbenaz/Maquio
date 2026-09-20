// Schemas Zod, miroir des types de types.ts.
// Les objets sont stricts : une cle inconnue est refusee.
// Attention : le mirroring des unions de litteraux (LayoutMode, alignMain,
// alignCross, TextStyle.align, ImageNode.fit, les `type` de noeud) n'est PAS
// garanti par le compilateur. `satisfies z.ZodType<X>` verifie qu'un schema
// est un sur-ensemble valide de X, mais accepte un schema plus etroit (une
// branche de litteraux manquante) sans erreur. C'est schema.test.ts, qui
// enumere explicitement chaque valeur attendue, qui detecte cette derive.
import { z } from 'zod'
import type {
  CalqueDocument,
  Color,
  DesignTokens,
  DevicePreset,
  EllipseNode,
  Fill,
  FrameNode,
  ImageNode,
  Layout,
  LineNode,
  Node,
  NodeBase,
  Page,
  Rect,
  RectNode,
  Stroke,
  TextNode,
  TextStyle,
} from './types'

// w/h bornes a 0..Infinity : une dimension nulle est un etat transitoire
// legitime (debut de trace d'une forme au canvas), mais une dimension
// negative n'a de sens pour aucun consommateur du modele (fichier .calque,
// generateurs de code par plateforme, patchs de Claude Code) et doit etre
// rejetee ici, a la seule frontiere que ces consommateurs traversent tous.
const rectSchema: z.ZodType<Rect> = z
  .object({
    x: z.number(),
    y: z.number(),
    w: z.number().min(0),
    h: z.number().min(0),
  })
  .strict()

// Composantes bornees a 0..1 : ce ne sont pas des octets (0..255). La
// contrainte est reelle (pas seulement documentaire) car les generateurs de
// code par plateforme convertissent directement ces valeurs ; une valeur
// hors bornes doit etre rejetee ici plutot que de produire du code genere
// incorrect, loin de sa cause.
const colorSchema: z.ZodType<Color> = z
  .object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1),
  })
  .strict()

const fillSchema: z.ZodType<Fill> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: colorSchema }).strict(),
  z.object({ type: z.literal('none') }).strict(),
])

// width: bornee a 0..Infinity (Round de correction 1, Tache 10) : un trait
// n'a pas de sens avec une epaisseur negative. Ce n'etait pas borne jusqu'ici
// faute de frontiere reelle qui aurait pu laisser passer une telle valeur ;
// l'import Figma (packages/figma) en est desormais une.
const strokeSchema: z.ZodType<Stroke> = z
  .object({
    color: colorSchema,
    width: z.number().min(0),
  })
  .strict()

// gap et padding.* : bornes a 0..Infinity (Round de correction 1, Tache 10)
// pour la meme raison que Rect.w/h — un espacement ou une marge negatifs
// n'ont pas de sens dans ce modele et ne se decouvriraient sinon qu'en lisant
// un chevauchement silencieux dans l'UI ou dans du code genere.
const layoutSchema: z.ZodType<Layout> = z
  .object({
    mode: z.union([z.literal('absolute'), z.literal('row'), z.literal('column')]),
    gap: z.number().min(0),
    padding: z
      .object({
        top: z.number().min(0),
        right: z.number().min(0),
        bottom: z.number().min(0),
        left: z.number().min(0),
      })
      .strict(),
    alignMain: z.union([
      z.literal('start'),
      z.literal('center'),
      z.literal('end'),
      z.literal('space-between'),
    ]),
    alignCross: z.union([z.literal('start'), z.literal('center'), z.literal('end'), z.literal('stretch')]),
  })
  .strict()

// fontSize et lineHeight : bornes a 0..Infinity (Round de correction 1,
// Tache 10), meme raisonnement que gap/padding/cornerRadius. letterSpacing
// reste volontairement non borne : un crenage negatif (lettres rapprochees)
// est un usage typographique legitime, contrairement a une taille de police
// ou un interligne negatifs qui n'ont pas de sens.
const textStyleSchema: z.ZodType<TextStyle> = z
  .object({
    fontFamily: z.string(),
    fontSize: z.number().min(0),
    fontWeight: z.number(),
    lineHeight: z.number().min(0),
    letterSpacing: z.number(),
    color: colorSchema,
    align: z.union([z.literal('left'), z.literal('center'), z.literal('right')]),
  })
  .strict()

const nodeBaseShape = {
  id: z.string(),
  name: z.string(),
  frame: rectSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  // Meme borne 0..1 que colorSchema, pour la meme raison (conversion directe
  // par les generateurs de code par plateforme).
  opacity: z.number().min(0).max(1),
  rotation: z.number(),
} satisfies Record<keyof NodeBase, z.ZodTypeAny>

// `children` reference nodeSchema, defini plus bas : on differe sa lecture
// avec z.lazy pour permettre la recursion (frame.children peut contenir des
// frames). frameNodeSchema lui-meme reste un vrai ZodObject, requis par
// z.discriminatedUnion pour lire le litteral du champ `type`.
// Chaque schema de noeud garde son type ZodObject concret (via `satisfies`,
// pas `:`) car z.discriminatedUnion doit pouvoir lire le litteral du champ
// `type` sur chaque option ; un type largi en z.ZodType<X> le lui masque.
const frameNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('frame'),
    layout: layoutSchema,
    fills: z.array(fillSchema),
    strokes: z.array(strokeSchema),
    // Bornee a 0..Infinity (Round de correction 1, Tache 10) : un rayon
    // d'arrondi negatif n'a pas de sens et ne se decouvrirait sinon qu'en
    // lisant un `BorderRadius.circular(-8)` dans du code genere.
    cornerRadius: z.number().min(0),
    clipsContent: z.boolean(),
    children: z.lazy(() => z.array(nodeSchema)),
  })
  .strict() satisfies z.ZodType<FrameNode>

const textNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('text'),
    characters: z.string(),
    style: textStyleSchema,
  })
  .strict() satisfies z.ZodType<TextNode>

const rectNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('rect'),
    fills: z.array(fillSchema),
    strokes: z.array(strokeSchema),
    // Meme borne que FrameNode.cornerRadius, meme raison.
    cornerRadius: z.number().min(0),
  })
  .strict() satisfies z.ZodType<RectNode>

const ellipseNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('ellipse'),
    fills: z.array(fillSchema),
    strokes: z.array(strokeSchema),
  })
  .strict() satisfies z.ZodType<EllipseNode>

const imageNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('image'),
    src: z.string(),
    fit: z.union([z.literal('cover'), z.literal('contain'), z.literal('fill')]),
  })
  .strict() satisfies z.ZodType<ImageNode>

const lineNodeSchema = z
  .object({
    ...nodeBaseShape,
    type: z.literal('line'),
    stroke: strokeSchema,
  })
  .strict() satisfies z.ZodType<LineNode>

// Union discriminee sur `type`, recursive via frameNodeSchema (z.lazy) pour frame.children.
export const nodeSchema: z.ZodType<Node> = z.discriminatedUnion('type', [
  frameNodeSchema,
  textNodeSchema,
  rectNodeSchema,
  ellipseNodeSchema,
  imageNodeSchema,
  lineNodeSchema,
])

const devicePresetSchema: z.ZodType<DevicePreset> = z
  .object({
    id: z.string(),
    label: z.string(),
    width: z.number(),
    height: z.number(),
    pixelRatio: z.number(),
  })
  .strict()

const pageSchema: z.ZodType<Page> = z
  .object({
    id: z.string(),
    name: z.string(),
    device: devicePresetSchema,
    nodes: z.array(nodeSchema),
  })
  .strict()

const designTokensSchema: z.ZodType<DesignTokens> = z
  .object({
    colors: z.record(z.string(), colorSchema),
    typography: z.record(z.string(), textStyleSchema),
    spacing: z.record(z.string(), z.number()),
  })
  .strict()

export const documentSchema: z.ZodType<CalqueDocument> = z
  .object({
    version: z.number(),
    id: z.string(),
    name: z.string(),
    pages: z.array(pageSchema),
    tokens: designTokensSchema,
  })
  .strict()
