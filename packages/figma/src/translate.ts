// Traducteur Figma -> document Maquio (Tache 10).
//
// Fonction pure : pas de reseau, pas d'acces disque, pas d'horodatage, et
// surtout jamais crypto.randomUUID() (deux appels sur le meme fichier Figma
// doivent rendre deux documents strictement identiques). Les identifiants de
// noeud, de page et de document sont ceux de Figma, repris tels quels.
//
// Assainissement (correction Critical, round 1) : `figma-types.ts` n'est
// qu'un typage a la compilation, jamais verifie au runtime. Toute valeur qui
// alimente une propriete du modele Maquio passe par les fonctions de
// sanitize.ts (point de passage unique), qui la ramenent a une valeur valide
// et emettent un ImportWarning si une correction reelle a ete necessaire.
// Un import ne s'arrete jamais au milieu a cause d'une reponse Figma
// malformee : voir sanitize.ts pour le detail des bornes appliquees.
import {
  DEVICE_PRESETS,
  DOCUMENT_VERSION,
  type MaquioDocument,
  type Color,
  type DesignTokens,
  type DevicePreset,
  type EllipseNode,
  type Fill,
  type FrameNode,
  type ImageNode,
  type Layout,
  type LineNode,
  type Node,
  type Page,
  type Rect,
  type RectNode,
  type Stroke,
  type TextNode,
  type TextStyle,
} from '@maquio/core'
import type { FigmaAlignCross, FigmaAlignMain, FigmaFileResponse, FigmaNode, FigmaRect } from './figma-types'
import { sanitizeBox, sanitizeColor, sanitizeName, sanitizeNumber, type WarnFn } from './sanitize'

export type ImportWarning = { nodeId: string; nodeName: string; reason: string }
export type ImportReport = { nodesImported: number; warnings: ImportWarning[] }

// Contexte mutable partage par toute la traduction d'un fichier : evite de
// faire remonter (warnings, compteur) a travers chaque niveau de recursion.
type TranslateContext = {
  warnings: ImportWarning[]
  nodesImported: number
}

const FRAME_LIKE_TYPES: ReadonlySet<string> = new Set([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'INSTANCE',
  'COMPONENT_SET',
])

function safeId(node: FigmaNode): string {
  return typeof node.id === 'string' && node.id !== '' ? node.id : '(id inconnu)'
}

function makeWarn(ctx: TranslateContext, nodeId: string, nodeName: string): WarnFn {
  return (_property, reason) => ctx.warnings.push({ nodeId, nodeName, reason })
}

// Deduplique les avertissements identiques (meme noeud, meme raison). Un
// meme noeud peut etre visite deux fois dans des roles differents — par
// exemple un noeud texte traduit normalement puis relu par buildTokens parce
// qu'un style publie de type TEXT pointe vers lui — sans que cela doive
// produire deux fois le meme avertissement (Minor, round 1).
function dedupeWarnings(warnings: ImportWarning[]): ImportWarning[] {
  const seen = new Set<string>()
  const result: ImportWarning[] = []
  for (const w of warnings) {
    const key = `${w.nodeId}\u0000${w.reason}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(w)
  }
  return result
}

export function figmaToDocument(file: FigmaFileResponse): { document: MaquioDocument; report: ImportReport } {
  const ctx: TranslateContext = { warnings: [], nodesImported: 0 }

  const tokens = buildTokens(file, ctx)

  const canvases = (file.document.children ?? []).filter((n) => n.type === 'CANVAS')
  const pages: Page[] = canvases.map((canvas) => translatePage(canvas, ctx))

  const document: MaquioDocument = {
    version: DOCUMENT_VERSION,
    id: file.document.id,
    name: file.document.name,
    pages,
    tokens,
  }

  return {
    document,
    report: { nodesImported: ctx.nodesImported, warnings: dedupeWarnings(ctx.warnings) },
  }
}

function translatePage(canvas: FigmaNode, ctx: TranslateContext): Page {
  const topLevelNodes = canvas.children ?? []
  const rootBox = topLevelNodes[0]?.absoluteBoundingBox
  const device = pickClosestDevice(rootBox)
  const origin = { x: 0, y: 0 }
  // v2 (addendum navigation, §3.1 et §8 de l'addendum) : chaque frame de
  // premier niveau devient naturellement un ECRAN Maquio (FrameNode.device)
  // -- une page Figma a plusieurs frames racines (un flux d'ecrans, usage
  // Figma courant) donne donc plusieurs ecrans, sans code dedie a l'import :
  // c'est directement une consequence du modele v2 (§3.1), pas un
  // traitement special du traducteur. Chaque frame recoit le preset le plus
  // proche de SA PROPRE boite englobante (pas necessairement celle de la
  // premiere, qui reste `device` ci-dessus, gabarit par defaut de la page).
  // Un noeud racine qui ne se traduit pas en 'frame' (rare) reste un noeud
  // de premier niveau ordinaire, sans device : pas un ecran (§3.1, "aucun
  // nouveau type de noeud").
  const nodes = topLevelNodes.map((figmaNode) => {
    const translated = translateNode(figmaNode, origin, ctx)
    if (translated.type !== 'frame') return translated
    return { ...translated, device: pickClosestDevice(figmaNode.absoluteBoundingBox) }
  })
  return { id: canvas.id, name: canvas.name, device, nodes }
}

// Point 9 : le preset le plus proche de la frame racine, par distance
// euclidienne entre (largeur, hauteur). Une correspondance exacte a une
// distance de 0 et gagne donc toujours face a toute approximation.
function pickClosestDevice(rootBox: FigmaRect | undefined): DevicePreset {
  const presets = Object.values(DEVICE_PRESETS)
  const first = presets[0]
  if (first === undefined) {
    throw new Error('DEVICE_PRESETS est vide : aucun preset disponible')
  }
  if (!rootBox) {
    return { ...first }
  }
  let best = first
  let bestDistance = Number.POSITIVE_INFINITY
  for (const preset of presets) {
    const dw = preset.width - rootBox.width
    const dh = preset.height - rootBox.height
    const distance = Math.sqrt(dw * dw + dh * dh)
    if (distance < bestDistance) {
      bestDistance = distance
      best = preset
    }
  }
  return { ...best }
}

function extractSolidColor(fills: FigmaNode['fills'], warn: WarnFn, property: string): Color | undefined {
  const solid = (fills ?? []).find((f) => f.visible !== false && f.type === 'SOLID' && f.color !== undefined)
  return solid?.color ? sanitizeColor(solid.color, warn, property) : undefined
}

// Traduit les remplissages d'un noeud. Seul le type SOLID a un equivalent
// dans le modele Maquio (Fill = solid | none) : tout autre type de peinture
// (degrade, image, ...) est une perte reelle et produit un avertissement,
// plutot qu'une approximation silencieuse. Un remplissage explicitement
// masque (`visible: false`) est exclu sans avertissement : c'est un usage
// normal de Figma, pas une anomalie.
function translateFills(node: FigmaNode, warn: WarnFn): Fill[] {
  const result: Fill[] = []
  const fills = node.fills ?? []
  fills.forEach((paint, i) => {
    if (paint.visible === false) return
    if (paint.type === 'SOLID' && paint.color !== undefined) {
      result.push({ type: 'solid', color: sanitizeColor(paint.color, warn, `fills[${i}].color`) })
    } else {
      warn(
        `fills[${i}]`,
        `Remplissage Figma de type "${paint.type}" non pris en charge (seul SOLID est traduit) : ignore`,
      )
    }
  })
  return result
}

// Traduit les traits d'un noeud. Figma porte l'epaisseur au niveau du
// noeud (strokeWeight), partagee par tous ses traits, contrairement au
// modele Maquio ou chaque Stroke porte sa propre largeur. Bornee a 0..
// Infinity (Round de correction 1, Tache 10, meme borne que Stroke.width
// dans nodeSchema).
function translateStrokes(node: FigmaNode, warn: WarnFn): Stroke[] {
  const width = sanitizeNumber(node.strokeWeight, 0, warn, 'strokeWeight', { min: 0 })
  const result: Stroke[] = []
  const strokes = node.strokes ?? []
  strokes.forEach((paint, i) => {
    if (paint.visible === false) return
    if (paint.type === 'SOLID' && paint.color !== undefined) {
      result.push({ color: sanitizeColor(paint.color, warn, `strokes[${i}].color`), width })
    } else {
      warn(
        `strokes[${i}]`,
        `Trait Figma de type "${paint.type}" non pris en charge (seul SOLID est traduit) : ignore`,
      )
    }
  })
  return result
}

function translateAlignMain(v: FigmaAlignMain | undefined): Layout['alignMain'] {
  switch (v) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'SPACE_BETWEEN':
      return 'space-between'
    case 'MIN':
    default:
      return 'start'
  }
}

// BASELINE n'a pas d'equivalent dans Layout.alignCross (start/center/end/
// stretch) : approxime en 'start', avec avertissement.
function translateAlignCross(v: FigmaAlignCross | undefined, warn: WarnFn): Layout['alignCross'] {
  switch (v) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'BASELINE':
      warn(
        'counterAxisAlignItems',
        'Alignement transverse Figma "BASELINE" approxime en "start" (aucun equivalent dans le modele Maquio)',
      )
      return 'start'
    case 'MIN':
    default:
      return 'start'
  }
}

// Point 7 : layoutMode HORIZONTAL/VERTICAL -> row/column, absent ou NONE ->
// absolute. Toute autre valeur est une donnee Figma invalide : traitee comme
// absente (absolute), avec avertissement citant la valeur d'origine.
function translateLayout(node: FigmaNode, warn: WarnFn): Layout {
  const rawMode = node.layoutMode
  let mode: Layout['mode']
  if (rawMode === undefined || rawMode === 'NONE') {
    mode = 'absolute'
  } else if (rawMode === 'HORIZONTAL') {
    mode = 'row'
  } else if (rawMode === 'VERTICAL') {
    mode = 'column'
  } else {
    warn(
      'layoutMode',
      `Valeur Figma inconnue pour "layoutMode" (${JSON.stringify(rawMode)}), traitee comme absence de mise en page automatique ("absolute")`,
    )
    mode = 'absolute'
  }

  // gap et padding.* : bornes a 0..Infinity (Round de correction 1, Tache 10,
  // meme borne que Layout.gap/padding.* dans nodeSchema).
  return {
    mode,
    gap: sanitizeNumber(node.itemSpacing, 0, warn, 'itemSpacing', { min: 0 }),
    padding: {
      top: sanitizeNumber(node.paddingTop, 0, warn, 'paddingTop', { min: 0 }),
      right: sanitizeNumber(node.paddingRight, 0, warn, 'paddingRight', { min: 0 }),
      bottom: sanitizeNumber(node.paddingBottom, 0, warn, 'paddingBottom', { min: 0 }),
      left: sanitizeNumber(node.paddingLeft, 0, warn, 'paddingLeft', { min: 0 }),
    },
    alignMain: translateAlignMain(node.primaryAxisAlignItems),
    alignCross: translateAlignCross(node.counterAxisAlignItems, warn),
  }
}

function translateTextAlign(node: FigmaNode, warn: WarnFn): TextStyle['align'] {
  const v = node.style?.textAlignHorizontal
  switch (v) {
    case 'CENTER':
      return 'center'
    case 'RIGHT':
      return 'right'
    case 'JUSTIFIED':
      warn('style.textAlignHorizontal', 'Alignement de texte Figma "JUSTIFIED" non pris en charge, approxime en "left"')
      return 'left'
    case 'LEFT':
    default:
      return 'left'
  }
}

// fontSize et lineHeight : bornes a 0..Infinity (Round de correction 1,
// Tache 10, meme borne que TextStyle.fontSize/lineHeight dans nodeSchema).
// letterSpacing reste volontairement libre (voir schema.ts) : un crenage
// negatif est un usage typographique legitime.
function translateTextStyle(node: FigmaNode, warn: WarnFn): TextStyle {
  const style = node.style
  const color = extractSolidColor(node.fills, warn, 'style.color') ?? { r: 0, g: 0, b: 0, a: 1 }
  const fontSize = sanitizeNumber(style?.fontSize, 16, warn, 'style.fontSize', { min: 0 })
  return {
    fontFamily: typeof style?.fontFamily === 'string' && style.fontFamily !== '' ? style.fontFamily : 'Inter',
    fontSize,
    fontWeight: sanitizeNumber(style?.fontWeight, 400, warn, 'style.fontWeight'),
    lineHeight: sanitizeNumber(style?.lineHeightPx, fontSize, warn, 'style.lineHeightPx', { min: 0 }),
    letterSpacing: sanitizeNumber(style?.letterSpacing, 0, warn, 'style.letterSpacing'),
    color,
    align: translateTextAlign(node, warn),
  }
}

// Heuristique "vecteur simple" (point 6) : un VECTOR dont une des deux
// dimensions de sa boite englobante absolue (deja assainie) est nulle se
// comporte comme un simple segment de droite et est traduit en `line`. Tout
// le reste (formes vectorielles libres) est considere complexe et remplace
// par un espace reserve `image`, avec avertissement.
function isSimpleVector(box: { width: number; height: number }): boolean {
  return box.width === 0 || box.height === 0
}

type NodeKind = 'frame' | 'text' | 'rect' | 'ellipse' | 'line' | 'image'

function classify(node: FigmaNode, box: { width: number; height: number }): { kind: NodeKind; warning?: string } {
  const t = node.type
  if (FRAME_LIKE_TYPES.has(t)) return { kind: 'frame' }
  if (t === 'TEXT') return { kind: 'text' }
  if (t === 'RECTANGLE') return { kind: 'rect' }
  if (t === 'ELLIPSE') return { kind: 'ellipse' }
  if (t === 'LINE') return { kind: 'line' }
  if (t === 'VECTOR') {
    if (isSimpleVector(box)) return { kind: 'line' }
    return {
      kind: 'image',
      warning: `Vecteur Figma complexe (type VECTOR) non pris en charge, remplace par un espace reserve image`,
    }
  }
  return {
    kind: 'image',
    warning: `Type de noeud Figma "${t}" non pris en charge, remplace par un espace reserve image`,
  }
}

function translateNode(node: FigmaNode, parentOrigin: { x: number; y: number }, ctx: TranslateContext): Node {
  const nodeId = safeId(node)

  // Le nom final n'est connu qu'apres assainissement, mais l'avertissement
  // sur son absence doit deja pouvoir s'emettre : on utilise le type Figma
  // brut comme nodeName pour cet unique avertissement, puis le nom resolu
  // pour tous les suivants.
  const name = sanitizeName(node.name, node.type, (property, reason) =>
    ctx.warnings.push({ nodeId, nodeName: node.type, reason }),
  )
  const warn = makeWarn(ctx, nodeId, name)

  const box = sanitizeBox(node.absoluteBoundingBox, parentOrigin, warn)
  const frame: Rect = { x: box.x - parentOrigin.x, y: box.y - parentOrigin.y, w: box.width, h: box.height }
  const childOrigin = { x: box.x, y: box.y }

  const base = {
    id: nodeId,
    name,
    frame,
    // `locked` n'a pas de source dans le sous-ensemble type de la reponse
    // Figma retenu pour cette tache (voir figma-types.ts) : un noeud importe
    // n'est jamais verrouille par defaut.
    locked: false,
    visible: node.visible ?? true,
    opacity: sanitizeNumber(node.opacity, 1, warn, 'opacity', { min: 0, max: 1 }),
    rotation: sanitizeNumber(node.rotation, 0, warn, 'rotation'),
  }

  const { kind, warning } = classify(node, box)
  if (warning) warn('type', warning)
  ctx.nodesImported += 1

  switch (kind) {
    case 'frame': {
      const result: FrameNode = {
        ...base,
        type: 'frame',
        layout: translateLayout(node, warn),
        fills: translateFills(node, warn),
        strokes: translateStrokes(node, warn),
        cornerRadius: sanitizeNumber(node.cornerRadius, 0, warn, 'cornerRadius', { min: 0 }),
        clipsContent: node.clipsContent ?? false,
        children: (node.children ?? []).map((child) => translateNode(child, childOrigin, ctx)),
      }
      return result
    }
    case 'text': {
      const result: TextNode = {
        ...base,
        type: 'text',
        characters: node.characters ?? '',
        style: translateTextStyle(node, warn),
      }
      return result
    }
    case 'rect': {
      const result: RectNode = {
        ...base,
        type: 'rect',
        fills: translateFills(node, warn),
        strokes: translateStrokes(node, warn),
        cornerRadius: sanitizeNumber(node.cornerRadius, 0, warn, 'cornerRadius', { min: 0 }),
      }
      return result
    }
    case 'ellipse': {
      const result: EllipseNode = {
        ...base,
        type: 'ellipse',
        fills: translateFills(node, warn),
        strokes: translateStrokes(node, warn),
      }
      return result
    }
    case 'line': {
      const strokes = translateStrokes(node, warn)
      const stroke: Stroke = strokes[0] ?? {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: sanitizeNumber(node.strokeWeight, 1, warn, 'strokeWeight', { min: 0 }),
      }
      const result: LineNode = { ...base, type: 'line', stroke }
      return result
    }
    case 'image': {
      const result: ImageNode = {
        ...base,
        type: 'image',
        src: '',
        fit: 'contain',
      }
      return result
    }
  }
}

// Normalise un nom de style publie Figma en nom de token : minuscules,
// separateurs '/' et espaces remplaces par '-' (point 8).
function normalizeStyleName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s/]+/g, '-')
}

// Cherche, pour chaque id de style publie, le premier noeud (ordre document)
// qui l'utilise reellement. La reponse Figma /v1/files ne porte la valeur
// concrete d'un style (couleur, police...) que sur les noeuds qui l'utilisent,
// jamais dans le catalogue de styles lui-meme.
function findFirstStyleUsage(root: FigmaNode): Map<string, FigmaNode> {
  const usage = new Map<string, FigmaNode>()
  const visit = (node: FigmaNode): void => {
    for (const styleId of Object.values(node.styles ?? {})) {
      if (!usage.has(styleId)) usage.set(styleId, node)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(root)
  return usage
}

// Point 8 : les styles publies alimentent DesignTokens (colors, typography).
// spacing n'a pas d'equivalent natif cote "styles" Figma (pas de concept de
// style d'espacement publie) : reste vide, jamais invente.
function buildTokens(file: FigmaFileResponse, ctx: TranslateContext): DesignTokens {
  const tokens: DesignTokens = { colors: {}, typography: {}, spacing: {} }
  const styles = file.styles ?? {}
  const usage = findFirstStyleUsage(file.document)

  for (const [styleId, style] of Object.entries(styles)) {
    const tokenName = normalizeStyleName(style.name)
    const usedBy = usage.get(styleId)
    const styleWarn = makeWarn(ctx, styleId, style.name)

    if (style.styleType === 'FILL') {
      const color = usedBy ? extractSolidColor(usedBy.fills, makeWarn(ctx, usedBy.id, usedBy.name), 'fill.color') : undefined
      if (color) {
        tokens.colors[tokenName] = color
      } else {
        styleWarn(
          'styles',
          `Style de couleur publie "${style.name}" non utilise par un remplissage SOLID d'un noeud du fichier : impossible d'en extraire la couleur`,
        )
      }
      continue
    }

    if (style.styleType === 'TEXT') {
      if (usedBy) {
        tokens.typography[tokenName] = translateTextStyle(usedBy, makeWarn(ctx, usedBy.id, usedBy.name))
      } else {
        styleWarn(
          'styles',
          `Style de texte publie "${style.name}" non utilise par aucun noeud du fichier : impossible d'en extraire les proprietes`,
        )
      }
      continue
    }

    // EFFECT et GRID n'ont pas de categorie correspondante dans
    // DesignTokens : signale plutot qu'ignore en silence.
    styleWarn(
      'styles',
      `Style publie de type "${style.styleType}" sans equivalent dans les tokens Maquio (colors/typography/spacing) : ignore`,
    )
  }

  return tokens
}
