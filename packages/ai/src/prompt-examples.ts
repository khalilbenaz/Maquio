// Exemples de noeuds pour le prompt Claude Code (point 3 de la reparation
// du pont, defaut B).
//
// Diagnostic reel qui motive ce fichier : invite avec le seul VOCABULAIRE
// des operations (insertNode/updateNode/...), sans jamais montrer la forme
// exacte d'un noeud, Claude Code invente une forme plausible mais fausse
// (x/y/width/height a plat, "text"/"fontSize" a plat, type "rectangle") --
// rejetee par nodeSchema (voir packages/core/src/model/schema.ts :
// `frame: {x,y,w,h}` imbrique, `characters`/`style`, types "rect"/"line",
// pas "rectangle"). Le prompt decrivait les operations mais jamais la forme
// d'un noeud.
//
// Ruling explicite de la reparation : ces exemples sont DERIVES DU MODELE,
// jamais ecrits a la main dans une chaine de caracteres. Chacun est un
// litteral d'objet TYPE (Node['type'] correspondant), donc verifie par le
// compilateur contre packages/core/src/model/types.ts -- un champ requis
// ajoute au type casserait la compilation ici, pas seulement au premier
// patch rejete en silence. `nodeSchema.parse` (packages/core) revalide
// chaque exemple a l'IMPORT de ce module (pas seulement en test) : si
// schema.ts derive un jour de types.ts sans que ce fichier suive, le
// prompt lui-meme refuse de se construire plutot que d'envoyer a Claude
// Code un exemple que son propre validateur rejetterait.
import { nodeSchema } from '@calque/core'
import type { EllipseNode, FrameNode, ImageNode, LineNode, Node, RectNode, TextNode } from '@calque/core'

// Gabarit d'ecran (v2, addendum navigation §3.1) : une frame de PREMIER
// NIVEAU qui porte `device` EST un ecran -- aucun type de noeud dedie.
// Demontre a la fois la forme d'une frame (layout, fills, cornerRadius,
// clipsContent, children) et cette regle de structure, que le prompt
// textuel (voir prompt.ts) rappelle explicitement a cote de cet exemple.
const screenExample: FrameNode = {
  id: 'ecran-accueil',
  name: 'Écran Accueil',
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
  fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }],
  strokes: [],
  cornerRadius: 0,
  clipsContent: false,
  children: [],
  device: { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 },
}

// Frame ORDINAIRE (pas un ecran : pas de `device`) -- un conteneur imbrique
// classique, pour ne pas laisser croire que `device` est obligatoire sur
// toute frame.
const groupFrameExample: FrameNode = {
  id: 'groupe-en-tete',
  name: 'Groupe en-tête',
  type: 'frame',
  frame: { x: 0, y: 0, w: 393, h: 120 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  layout: {
    mode: 'row',
    gap: 8,
    padding: { top: 12, right: 16, bottom: 12, left: 16 },
    alignMain: 'space-between',
    alignCross: 'center',
  },
  fills: [{ type: 'none' }],
  strokes: [],
  cornerRadius: 0,
  clipsContent: false,
  children: [],
}

const textExample: TextNode = {
  id: 'titre-bienvenue',
  name: 'Titre Bienvenue',
  type: 'text',
  frame: { x: 16, y: 60, w: 361, h: 40 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  characters: 'Bienvenue',
  style: {
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 38,
    letterSpacing: 0,
    color: { r: 0, g: 0, b: 0, a: 1 },
    align: 'center',
  },
}

const rectExample: RectNode = {
  id: 'bouton-principal',
  name: 'Bouton principal',
  type: 'rect',
  frame: { x: 16, y: 780, w: 361, h: 48 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  fills: [{ type: 'solid', color: { r: 0.2, g: 0.4, b: 0.9, a: 1 } }],
  strokes: [],
  cornerRadius: 8,
}

const ellipseExample: EllipseNode = {
  id: 'avatar',
  name: 'Avatar',
  type: 'ellipse',
  frame: { x: 16, y: 16, w: 48, h: 48 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  fills: [{ type: 'solid', color: { r: 0.8, g: 0.8, b: 0.8, a: 1 } }],
  strokes: [{ color: { r: 0.7, g: 0.7, b: 0.7, a: 1 }, width: 1 }],
}

const imageExample: ImageNode = {
  id: 'photo-profil',
  name: 'Photo de profil',
  type: 'image',
  frame: { x: 16, y: 100, w: 120, h: 120 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  src: 'assets/photo.png',
  fit: 'cover',
}

const lineExample: LineNode = {
  id: 'separateur',
  name: 'Séparateur',
  type: 'line',
  frame: { x: 16, y: 400, w: 361, h: 0 },
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  stroke: { color: { r: 0.85, g: 0.85, b: 0.85, a: 1 }, width: 1 },
}

// Un exemple par type de noeud EXACT (les six seuls types valides, voir
// packages/core/src/model/types.ts : Node = FrameNode | TextNode | RectNode
// | EllipseNode | ImageNode | LineNode) -- validees ci-dessous via
// nodeSchema.parse, jamais admises telles quelles sans repasser par le
// meme validateur que celui qui juge les patchs reels.
export const NODE_EXAMPLES: readonly Node[] = [
  screenExample,
  groupFrameExample,
  textExample,
  rectExample,
  ellipseExample,
  imageExample,
  lineExample,
].map((node) => nodeSchema.parse(node))
