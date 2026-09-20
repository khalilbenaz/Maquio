// Generateur SwiftUI en apercu (Tache 9) : traduit un CalqueDocument en
// une struct SwiftUI par page (Sources/Screens/<PascalCase>.swift).
//
// Couverture d'apercu (decision 4 du brief) : seuls frame, text, rect,
// ellipse et image sont couverts. Tout autre type de noeud (line
// aujourd'hui) est ignore a l'emission mais ajoute un avertissement dans
// ExportResult.warnings — jamais une sortie silencieusement incomplete.
//
// Correspondances (decision 2 du brief) :
//   - frame `absolute` -> ZStack(alignment: .topLeading) + .offset(x:y:)
//     et .frame(width:height:) sur les enfants directs
//   - frame `row`/`column` -> HStack/VStack avec spacing: et alignment:
//   - rect -> RoundedRectangle(cornerRadius:) (Rectangle() si radius nul)
//   - ellipse -> Circle() (largeur == hauteur) ou Ellipse()
//   - text -> Text("…") avec .font() et .foregroundColor()
//   - image -> Image("…") (ressource locale) ou AsyncImage(url:) (URL)
//
// Couleurs toujours litterales ici (decision 9 du brief : SwiftUI et
// Compose restent en apercu, pas de fichier de theme genere), avec un
// commentaire `// nom` quand la couleur correspond exactement a un token
// du document, pour rester tracable sans construire un vrai theme.
//
// Deterministe, comme les autres generateurs : aucun horodatage, aucun
// identifiant aleatoire.
import type {
  CalqueDocument,
  DesignTokens,
  EllipseNode,
  Fill,
  FrameNode,
  ImageNode,
  Node,
  Page,
  RectNode,
  Stroke,
  TextNode,
} from '@calque/core'
import { layoutPage } from '@calque/core'
import { formatNumber } from '../shared/format-number'
import { pad } from '../shared/indent'
import { unsupportedPropertyWarning } from '../shared/lost-property-warning'
import { toPascalCase } from '../shared/naming'
import { firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { PREVIEW_SUPPORTED_NODE_TYPES, unsupportedNodeWarning } from '../shared/preview-coverage'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { colorTokenComment, swiftColorExpr, swiftFontWeightExpr, swiftString } from './swift-utils'

const EXPORTER_ID = 'swiftui'

type RenderContext = { tokens: DesignTokens; warnings: string[] }

function alignmentExpr(align: 'start' | 'center' | 'end' | 'stretch', axis: 'horizontal' | 'vertical'): string {
  // SwiftUI n'a pas d'equivalent direct a `stretch` pour l'alignement
  // transverse d'un HStack/VStack (contrairement a CrossAxisAlignment de
  // Flutter) : approxime par le debut de l'axe (limitation documentee du
  // niveau d'apercu, cf. rapport de la Tache 9).
  if (axis === 'horizontal') {
    if (align === 'center') return '.center'
    if (align === 'end') return '.trailing'
    return '.leading'
  }
  if (align === 'center') return '.center'
  if (align === 'end') return '.bottom'
  return '.top'
}

// Rectangle/ellipse : base (RoundedRectangle/Rectangle/Circle/Ellipse) +
// .fill(...) + .frame(width:height:) + .overlay(bordure) si un stroke est
// present. Les modifiers forment une chaine plate a `depth + 1`.
function renderShapeLike(
  shapeExpr: string,
  fills: Fill[],
  strokes: Stroke[],
  w: number,
  h: number,
  ctx: RenderContext,
  depth: number,
  extraMods: string[],
): string[] {
  const fillColor = firstSolidFillColor(fills)
  const stroke = firstStroke(strokes)
  const modDepth = depth + 1

  const lines = [`${pad(depth)}${shapeExpr}`]
  if (fillColor) {
    lines.push(`${pad(modDepth)}.fill(${swiftColorExpr(fillColor, ctx.tokens)})${colorTokenComment(fillColor, ctx.tokens)}`)
  }
  lines.push(`${pad(modDepth)}.frame(width: ${formatNumber(w)}, height: ${formatNumber(h)})`)
  if (stroke) {
    lines.push(`${pad(modDepth)}.overlay(`)
    lines.push(`${pad(modDepth + 1)}${shapeExpr}`)
    lines.push(
      `${pad(modDepth + 2)}.stroke(${swiftColorExpr(stroke.color, ctx.tokens)}, lineWidth: ${formatNumber(stroke.width)})${colorTokenComment(stroke.color, ctx.tokens)}`,
    )
    lines.push(`${pad(modDepth)})`)
  }
  for (const mod of extraMods) lines.push(`${pad(modDepth)}${mod}`)
  return lines
}

function renderRect(node: RectNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const shapeExpr = node.cornerRadius > 0 ? `RoundedRectangle(cornerRadius: ${formatNumber(node.cornerRadius)})` : 'Rectangle()'
  return renderShapeLike(shapeExpr, node.fills, node.strokes, node.frame.w, node.frame.h, ctx, depth, extraMods)
}

function renderEllipse(node: EllipseNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const shapeExpr = node.frame.w === node.frame.h ? 'Circle()' : 'Ellipse()'
  return renderShapeLike(shapeExpr, node.fills, node.strokes, node.frame.w, node.frame.h, ctx, depth, extraMods)
}

function renderText(node: TextNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const modDepth = depth + 1
  const fontExpr = `.system(size: ${formatNumber(node.style.fontSize)}, weight: ${swiftFontWeightExpr(node.style.fontWeight)})`
  const lines = [
    `${pad(depth)}Text(${swiftString(node.characters)})`,
    `${pad(modDepth)}.font(${fontExpr})`,
    `${pad(modDepth)}.foregroundColor(${swiftColorExpr(node.style.color, ctx.tokens)})${colorTokenComment(node.style.color, ctx.tokens)}`,
  ]
  for (const mod of extraMods) lines.push(`${pad(modDepth)}${mod}`)
  return lines
}

function fitToAspect(fit: 'cover' | 'contain' | 'fill'): string | null {
  if (fit === 'cover') return 'fill'
  if (fit === 'contain') return 'fit'
  return null
}

function renderImage(node: ImageNode, depth: number, extraMods: string[]): string[] {
  const modDepth = depth + 1
  const aspect = fitToAspect(node.fit)

  if (isRemoteUrl(node.src)) {
    const lines = [
      `${pad(depth)}AsyncImage(url: URL(string: ${swiftString(node.src)})!) { image in`,
      `${pad(modDepth)}image.resizable()${aspect ? `.aspectRatio(contentMode: .${aspect})` : ''}`,
      `${pad(depth)}} placeholder: {`,
      `${pad(modDepth)}ProgressView()`,
      `${pad(depth)}}`,
      `${pad(depth)}.frame(width: ${formatNumber(node.frame.w)}, height: ${formatNumber(node.frame.h)})`,
    ]
    for (const mod of extraMods) lines.push(`${pad(depth)}${mod}`)
    return lines
  }

  const lines = [`${pad(depth)}Image(${swiftString(node.src)})`, `${pad(modDepth)}.resizable()`]
  if (aspect) lines.push(`${pad(modDepth)}.aspectRatio(contentMode: .${aspect})`)
  lines.push(`${pad(modDepth)}.frame(width: ${formatNumber(node.frame.w)}, height: ${formatNumber(node.frame.h)})`)
  for (const mod of extraMods) lines.push(`${pad(modDepth)}${mod}`)
  return lines
}

function renderFrame(frame: FrameNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const isRow = frame.layout.mode === 'row'

  // SwiftUI n'a pas d'Arrangement.SpaceBetween natif comme Compose : en
  // mode `space-between`, `gap` est ignore (comme partout ailleurs dans le
  // modele — @calque/core l'ignore deja) et l'espacement vient de
  // `Spacer()` interleaves entre les enfants plutot que d'un `spacing:`
  // fixe, qui romprait l'effet de repartition sur tout l'espace libre.
  const isSpaceBetween = frame.layout.alignMain === 'space-between'

  // Important 2 : contrairement a Flutter (`clipBehavior`) et React Native
  // (`overflow`), ce generateur `preview` ne decoupe pas le contenu qui
  // deborde -- jamais perdu en silence.
  if (frame.clipsContent) {
    ctx.warnings.push(unsupportedPropertyWarning('clipsContent', frame.id, EXPORTER_ID))
  }

  let header: string
  if (isAbsolute) {
    header = 'ZStack(alignment: .topLeading)'
  } else {
    // Important 1 : `stretch` est approxime par le debut de l'axe
    // (alignmentExpr, ci-dessus) faute d'equivalent SwiftUI direct --
    // jamais en silence.
    if (frame.layout.alignCross === 'stretch') {
      ctx.warnings.push(unsupportedPropertyWarning("alignCross: 'stretch'", frame.id, EXPORTER_ID))
    }
    const widget = isRow ? 'HStack' : 'VStack'
    const axis = isRow ? 'vertical' : 'horizontal'
    const spacing = isSpaceBetween ? 0 : frame.layout.gap
    header = `${widget}(alignment: ${alignmentExpr(frame.layout.alignCross, axis)}, spacing: ${formatNumber(spacing)})`
  }

  const childLines: string[] = []
  const visibleChildren = frame.children.filter((c) => c.visible)
  visibleChildren.forEach((child, index) => {
    const childExtra = isAbsolute
      ? [`.offset(x: ${formatNumber(child.frame.x)}, y: ${formatNumber(child.frame.y)})`, `.frame(width: ${formatNumber(child.frame.w)}, height: ${formatNumber(child.frame.h)})`]
      : []
    const rendered = renderNode(child, ctx, depth + 1, childExtra)
    if (rendered) childLines.push(...rendered)
    if (isSpaceBetween && index < visibleChildren.length - 1) childLines.push(`${pad(depth + 1)}Spacer()`)
  })

  const lines = [`${pad(depth)}${header} {`, ...childLines, `${pad(depth)}}`]

  const fillColor = firstSolidFillColor(frame.fills)
  const stroke = firstStroke(frame.strokes)

  if (!isAbsolute) {
    const { top, right, bottom, left } = frame.layout.padding
    if (top === right && right === bottom && bottom === left && top > 0) {
      lines.push(`${pad(depth)}.padding(${formatNumber(top)})`)
    } else if (!(top === 0 && right === 0 && bottom === 0 && left === 0)) {
      lines.push(
        `${pad(depth)}.padding(EdgeInsets(top: ${formatNumber(top)}, leading: ${formatNumber(left)}, bottom: ${formatNumber(bottom)}, trailing: ${formatNumber(right)}))`,
      )
    }
  }
  lines.push(`${pad(depth)}.frame(width: ${formatNumber(frame.frame.w)}, height: ${formatNumber(frame.frame.h)})`)
  if (fillColor) {
    lines.push(`${pad(depth)}.background(${swiftColorExpr(fillColor, ctx.tokens)})${colorTokenComment(fillColor, ctx.tokens)}`)
  }
  if (frame.cornerRadius > 0) lines.push(`${pad(depth)}.cornerRadius(${formatNumber(frame.cornerRadius)})`)
  if (stroke) {
    lines.push(`${pad(depth)}.overlay(`)
    lines.push(`${pad(depth + 1)}RoundedRectangle(cornerRadius: ${formatNumber(frame.cornerRadius)})`)
    lines.push(
      `${pad(depth + 2)}.stroke(${swiftColorExpr(stroke.color, ctx.tokens)}, lineWidth: ${formatNumber(stroke.width)})${colorTokenComment(stroke.color, ctx.tokens)}`,
    )
    lines.push(`${pad(depth)})`)
  }
  for (const mod of extraMods) lines.push(`${pad(depth)}${mod}`)

  return lines
}

function renderNode(node: Node, ctx: RenderContext, depth: number, extraMods: string[]): string[] | null {
  if (!node.visible) return null

  if (!PREVIEW_SUPPORTED_NODE_TYPES.has(node.type)) {
    ctx.warnings.push(unsupportedNodeWarning(node.type, EXPORTER_ID))
    return null
  }

  // Important 1 : contrairement a Flutter et React Native, ce generateur
  // `preview` n'implemente ni `.opacity()` ni `.rotationEffect()` -- jamais
  // perdu en silence, meme si le type de noeud lui-meme est couvert.
  if (node.opacity < 1) ctx.warnings.push(unsupportedPropertyWarning('opacity', node.id, EXPORTER_ID))
  if (node.rotation !== 0) ctx.warnings.push(unsupportedPropertyWarning('rotation', node.id, EXPORTER_ID))

  switch (node.type) {
    case 'frame':
      return renderFrame(node, ctx, depth, extraMods)
    case 'text':
      return renderText(node, ctx, depth, extraMods)
    case 'rect':
      return renderRect(node, ctx, depth, extraMods)
    case 'ellipse':
      return renderEllipse(node, ctx, depth, extraMods)
    case 'image':
      return renderImage(node, depth, extraMods)
    default:
      return null
  }
}

function renderPage(page: Page, tokens: DesignTokens, warnings: string[]): ExportedFile {
  const ctx: RenderContext = { tokens, warnings }

  const topLevel = page.nodes
    .map((n) => renderNode(n, ctx, 2, []))
    .filter((l): l is string[] => l !== null)

  const bodyLines =
    topLevel.length === 1
      ? topLevel[0]!
      : ['        VStack {', ...topLevel.flat(), '        }']

  const structName = toPascalCase(page.name)

  const lines = [
    'import SwiftUI',
    '',
    `struct ${structName}: View {`,
    '    var body: some View {',
    ...bodyLines,
    '    }',
    '}',
    '',
  ]

  return { path: `Sources/Screens/${structName}.swift`, contents: lines.join('\n') }
}

function exportSwiftUI(doc: CalqueDocument, _opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []

  for (const page of doc.pages) {
    const laidOutPage = layoutPage(page)
    files.push(renderPage(laidOutPage, doc.tokens, warnings))
  }

  return { files, warnings }
}

export const swiftuiExporter: Exporter = {
  id: 'swiftui',
  label: 'SwiftUI',
  maturity: 'preview',
  export: exportSwiftUI,
}
