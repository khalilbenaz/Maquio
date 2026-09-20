// Traducteur Figma -> document Calque (Tache 10).
//
// Fonction pure : pas de reseau, pas d'acces disque, pas d'horodatage, et
// surtout jamais crypto.randomUUID() (voir README de tache : deux appels
// sur le meme fichier Figma doivent rendre deux documents strictement
// identiques). Les identifiants de noeud, de page et de document sont ceux
// de Figma, repris tels quels.
import {
  DEVICE_PRESETS,
  DOCUMENT_VERSION,
  type CalqueDocument,
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
} from '@calque/core'
import type {
  FigmaAlignCross,
  FigmaAlignMain,
  FigmaColor,
  FigmaFileResponse,
  FigmaNode,
  FigmaRect,
} from './figma-types'

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

export function figmaToDocument(file: FigmaFileResponse): { document: CalqueDocument; report: ImportReport } {
  const ctx: TranslateContext = { warnings: [], nodesImported: 0 }

  const tokens = buildTokens(file, ctx)

  const canvases = (file.document.children ?? []).filter((n) => n.type === 'CANVAS')
  const pages: Page[] = canvases.map((canvas) => translatePage(canvas, ctx))

  const document: CalqueDocument = {
    version: DOCUMENT_VERSION,
    id: file.document.id,
    name: file.document.name,
    pages,
    tokens,
  }

  return { document, report: { nodesImported: ctx.nodesImported, warnings: ctx.warnings } }
}

function translatePage(canvas: FigmaNode, ctx: TranslateContext): Page {
  const topLevelNodes = canvas.children ?? []
  const rootBox = topLevelNodes[0]?.absoluteBoundingBox
  const device = pickClosestDevice(rootBox)
  const origin = { x: 0, y: 0 }
  const nodes = topLevelNodes.map((n) => translateNode(n, origin, ctx))
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

function toColor(c: FigmaColor): Color {
  return { r: c.r, g: c.g, b: c.b, a: c.a }
}

function extractSolidColor(fills: FigmaNode['fills']): Color | undefined {
  const solid = (fills ?? []).find((f) => f.visible !== false && f.type === 'SOLID' && f.color !== undefined)
  return solid?.color ? toColor(solid.color) : undefined
}

// Traduit les remplissages d'un noeud. Seul le type SOLID a un equivalent
// dans le modele Calque (Fill = solid | none) : tout autre type de peinture
// (degrade, image, ...) est une perte reelle et produit un avertissement
// (point 10), plutot qu'une approximation silencieuse.
function translateFills(node: FigmaNode, ctx: TranslateContext): Fill[] {
  const result: Fill[] = []
  for (const paint of node.fills ?? []) {
    if (paint.visible === false) continue
    if (paint.type === 'SOLID' && paint.color !== undefined) {
      result.push({ type: 'solid', color: toColor(paint.color) })
    } else {
      ctx.warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        reason: `Remplissage Figma de type "${paint.type}" non pris en charge (seul SOLID est traduit) : ignore`,
      })
    }
  }
  return result
}

// Traduit les traits d'un noeud. Figma porte l'epaisseur au niveau du
// noeud (strokeWeight), partagee par tous ses traits, contrairement au
// modele Calque ou chaque Stroke porte sa propre largeur.
function translateStrokes(node: FigmaNode, ctx: TranslateContext): Stroke[] {
  const width = node.strokeWeight ?? 0
  const result: Stroke[] = []
  for (const paint of node.strokes ?? []) {
    if (paint.visible === false) continue
    if (paint.type === 'SOLID' && paint.color !== undefined) {
      result.push({ color: toColor(paint.color), width })
    } else {
      ctx.warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        reason: `Trait Figma de type "${paint.type}" non pris en charge (seul SOLID est traduit) : ignore`,
      })
    }
  }
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
// stretch) : approxime en 'start', avec avertissement (point 7 et 10).
function translateAlignCross(
  node: FigmaNode,
  ctx: TranslateContext,
): Layout['alignCross'] {
  const v: FigmaAlignCross | undefined = node.counterAxisAlignItems
  switch (v) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'BASELINE':
      ctx.warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        reason:
          'Alignement transverse Figma "BASELINE" approxime en "start" (aucun equivalent dans le modele Calque)',
      })
      return 'start'
    case 'MIN':
    default:
      return 'start'
  }
}

// Point 7 : layoutMode HORIZONTAL/VERTICAL -> row/column, absent ou NONE ->
// absolute ; itemSpacing -> gap ; les quatre padding* -> padding.
function translateLayout(node: FigmaNode, ctx: TranslateContext): Layout {
  const mode: Layout['mode'] =
    node.layoutMode === 'HORIZONTAL' ? 'row' : node.layoutMode === 'VERTICAL' ? 'column' : 'absolute'
  return {
    mode,
    gap: node.itemSpacing ?? 0,
    padding: {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    },
    alignMain: translateAlignMain(node.primaryAxisAlignItems),
    alignCross: translateAlignCross(node, ctx),
  }
}

function translateTextAlign(node: FigmaNode, ctx: TranslateContext): TextStyle['align'] {
  const v = node.style?.textAlignHorizontal
  switch (v) {
    case 'CENTER':
      return 'center'
    case 'RIGHT':
      return 'right'
    case 'JUSTIFIED':
      ctx.warnings.push({
        nodeId: node.id,
        nodeName: node.name,
        reason: 'Alignement de texte Figma "JUSTIFIED" non pris en charge, approxime en "left"',
      })
      return 'left'
    case 'LEFT':
    default:
      return 'left'
  }
}

function translateTextStyle(node: FigmaNode, ctx: TranslateContext): TextStyle {
  const style = node.style
  const color = extractSolidColor(node.fills) ?? { r: 0, g: 0, b: 0, a: 1 }
  const fontSize = style?.fontSize ?? 16
  return {
    fontFamily: style?.fontFamily ?? 'Inter',
    fontSize,
    fontWeight: style?.fontWeight ?? 400,
    lineHeight: style?.lineHeightPx ?? fontSize,
    letterSpacing: style?.letterSpacing ?? 0,
    color,
    align: translateTextAlign(node, ctx),
  }
}

// Heuristique "vecteur simple" (point 6) : un VECTOR dont une des deux
// dimensions de sa boite englobante absolue est nulle se comporte comme un
// simple segment de droite et est traduit en `line`. Tout le reste (formes
// vectorielles libres) est considere complexe et remplace par un espace
// reserve `image`, avec avertissement.
function isSimpleVector(node: FigmaNode): boolean {
  const box = node.absoluteBoundingBox
  if (!box) return false
  return box.width === 0 || box.height === 0
}

type NodeKind = 'frame' | 'text' | 'rect' | 'ellipse' | 'line' | 'image'

function classify(node: FigmaNode): { kind: NodeKind; warning?: string } {
  const t = node.type
  if (FRAME_LIKE_TYPES.has(t)) return { kind: 'frame' }
  if (t === 'TEXT') return { kind: 'text' }
  if (t === 'RECTANGLE') return { kind: 'rect' }
  if (t === 'ELLIPSE') return { kind: 'ellipse' }
  if (t === 'LINE') return { kind: 'line' }
  if (t === 'VECTOR') {
    if (isSimpleVector(node)) return { kind: 'line' }
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
  const box = node.absoluteBoundingBox ?? { x: parentOrigin.x, y: parentOrigin.y, width: 0, height: 0 }
  const frame: Rect = { x: box.x - parentOrigin.x, y: box.y - parentOrigin.y, w: box.width, h: box.height }
  const childOrigin = { x: box.x, y: box.y }

  const base = {
    id: node.id,
    name: node.name,
    frame,
    // `locked` n'a pas de source dans le sous-ensemble type de la reponse
    // Figma retenu pour cette tache (voir figma-types.ts) : un noeud importe
    // n'est jamais verrouille par defaut.
    locked: false,
    visible: node.visible ?? true,
    opacity: node.opacity ?? 1,
    rotation: node.rotation ?? 0,
  }

  const { kind, warning } = classify(node)
  if (warning) {
    ctx.warnings.push({ nodeId: node.id, nodeName: node.name, reason: warning })
  }
  ctx.nodesImported += 1

  switch (kind) {
    case 'frame': {
      const result: FrameNode = {
        ...base,
        type: 'frame',
        layout: translateLayout(node, ctx),
        fills: translateFills(node, ctx),
        strokes: translateStrokes(node, ctx),
        cornerRadius: node.cornerRadius ?? 0,
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
        style: translateTextStyle(node, ctx),
      }
      return result
    }
    case 'rect': {
      const result: RectNode = {
        ...base,
        type: 'rect',
        fills: translateFills(node, ctx),
        strokes: translateStrokes(node, ctx),
        cornerRadius: node.cornerRadius ?? 0,
      }
      return result
    }
    case 'ellipse': {
      const result: EllipseNode = {
        ...base,
        type: 'ellipse',
        fills: translateFills(node, ctx),
        strokes: translateStrokes(node, ctx),
      }
      return result
    }
    case 'line': {
      const strokes = translateStrokes(node, ctx)
      const stroke: Stroke = strokes[0] ?? { color: { r: 0, g: 0, b: 0, a: 1 }, width: node.strokeWeight ?? 1 }
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

    if (style.styleType === 'FILL') {
      const color = usedBy ? extractSolidColor(usedBy.fills) : undefined
      if (color) {
        tokens.colors[tokenName] = color
      } else {
        ctx.warnings.push({
          nodeId: styleId,
          nodeName: style.name,
          reason: `Style de couleur publie "${style.name}" non utilise par un remplissage SOLID d'un noeud du fichier : impossible d'en extraire la couleur`,
        })
      }
      continue
    }

    if (style.styleType === 'TEXT') {
      if (usedBy) {
        tokens.typography[tokenName] = translateTextStyle(usedBy, ctx)
      } else {
        ctx.warnings.push({
          nodeId: styleId,
          nodeName: style.name,
          reason: `Style de texte publie "${style.name}" non utilise par aucun noeud du fichier : impossible d'en extraire les proprietes`,
        })
      }
      continue
    }

    // EFFECT et GRID n'ont pas de categorie correspondante dans
    // DesignTokens : signale plutot que d'etre perdu en silence (point 10).
    ctx.warnings.push({
      nodeId: styleId,
      nodeName: style.name,
      reason: `Style publie de type "${style.styleType}" sans equivalent dans les tokens Calque (colors/typography/spacing) : ignore`,
    })
  }

  return tokens
}
