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
// Exporte (Round de correction 1, Taches 12/13) : packages/ai en a besoin
// pour valider le champ "tokens" d'un patch Claude Code (setTokens) sans en
// dupliquer les bornes - une duplication qui deriverait de ce schema
// laisserait passer dans un patch ce que le modele refuse partout ailleurs.
export const colorSchema: z.ZodType<Color> = z
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
// Exporte pour la meme raison que colorSchema ci-dessus.
export const textStyleSchema: z.ZodType<TextStyle> = z
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

// v2 (addendum navigation, §3.2) : cible d'un lien -- l'identifiant d'un
// ecran de la MEME page. L'existence de la cible, son appartenance a la
// page et le refus d'un lien vers l'ecran qui contient le noeud ne peuvent
// PAS etre verifies ici (un schema de noeud n'a pas de vue sur le reste du
// document) : c'est pageSchema, plus bas, qui l'impose via superRefine, et
// setLinkCommand qui l'impose cote commandes.
const linkSchema: z.ZodType<{ target: string }> = z.object({ target: z.string() }).strict()

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
  link: linkSchema.optional(),
} satisfies Record<keyof NodeBase, z.ZodTypeAny>

// Deplace ici (avant frameNodeSchema, qui en a desormais besoin pour son
// champ `device` optionnel -- v2, addendum navigation §3.1) depuis sa
// position d'origine plus bas dans ce fichier, aux cotes de pageSchema.
const devicePresetSchema: z.ZodType<DevicePreset> = z
  .object({
    id: z.string(),
    label: z.string(),
    width: z.number(),
    height: z.number(),
    pixelRatio: z.number(),
  })
  .strict()

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
    // v2 (addendum navigation, §3.1) : present <=> cette frame de premier
    // niveau EST un ecran. Optionnel ici (nodeSchema est partage par toutes
    // les profondeurs de l'arbre) : c'est pageSchema qui interprete sa
    // presence/absence au premier niveau.
    device: devicePresetSchema.optional(),
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

// v2 (addendum navigation, §3.2) : verifie tout lien porte par un noeud de
// cette page -- cible existante, de la meme page, differente de l'ecran qui
// contient le noeud. Parcours ecrit a la main (pas tree.ts : model/ ne doit
// dependre d'aucune couche superieure) ; `containingScreenId` suit l'ecran
// de premier niveau (frame + `device`) sous lequel la recursion se trouve,
// null tant qu'on n'en a pas encore traverse un (noeud de premier niveau
// sans `device`, ou l'un de ses descendants).
function checkLinks(page: Page, ctx: z.RefinementCtx): void {
  const screenIds = new Set(
    page.nodes.filter((n): n is FrameNode => n.type === 'frame' && n.device !== undefined).map((n) => n.id),
  )

  function visit(node: Node, containingScreenId: string | null, path: (string | number)[]): void {
    if (node.link !== undefined) {
      const { target } = node.link
      if (!screenIds.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'link', 'target'],
          message: `Cible de lien invalide : "${target}" n'est pas un écran de cette page`,
        })
      } else if (target === containingScreenId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, 'link', 'target'],
          message: "Cible de lien invalide : un nœud ne peut pas être lié à l'écran qui le contient",
        })
      }
    }
    if (node.type === 'frame') {
      node.children.forEach((child, i) => visit(child, containingScreenId, [...path, 'children', i]))
    }
  }

  page.nodes.forEach((top, i) => {
    const screenId = top.type === 'frame' && top.device !== undefined ? top.id : null
    visit(top, screenId, ['nodes', i])
  })
}

const pageSchema: z.ZodType<Page> = z
  .object({
    id: z.string(),
    name: z.string(),
    device: devicePresetSchema,
    nodes: z.array(nodeSchema),
  })
  .strict()
  .superRefine(checkLinks)

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
