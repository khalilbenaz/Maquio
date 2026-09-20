// Generateur Flutter (Tache 7) : traduit un CalqueDocument en widgets Dart
// (un fichier par page sous lib/screens/, plus lib/theme.dart pour les
// tokens). Voir les correspondances dans le brief (decision 7) :
//   - frame `absolute` -> Stack de Positioned
//   - frame `row`/`column` -> Row/Column + SizedBox(gap) + Padding
//   - rect -> Container + BoxDecoration(color, borderRadius, border)
//   - ellipse -> Container + BoxDecoration(shape: BoxShape.circle)
//   - text -> Text(style: TextStyle(...))
//   - image -> Image.asset (chemin relatif) / Image.network (URL)
//   - line -> Container d'un pixel d'epaisseur
//   - opacity < 1 -> Opacity(...) ; rotation != 0 -> Transform.rotate(...)
//     en radians ; visible: false -> le noeud n'est pas emis.
//
// Deterministe (decision 5) : aucune horodatage, aucun identifiant
// aleatoire, aucune iteration sur un Set/Map a ordre incertain (seuls des
// tableaux et des objets a cles chaine, dont l'ordre d'iteration est
// stable, sont parcourus).
import type {
  CalqueDocument,
  Color,
  DesignTokens,
  EllipseNode,
  Fill,
  FrameNode,
  ImageNode,
  LineNode,
  Node,
  Page,
  RectNode,
  Stroke,
  TextNode,
} from '@calque/core'
import { layoutPage } from '@calque/core'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { type Arg, type Block, attach, call, lit, list } from './dart-writer'
import {
  boxFitExpr,
  colorExpr,
  crossAxisAlignmentExpr,
  escapeDartString,
  fontWeightExpr,
  formatNumber,
  mainAxisAlignmentExpr,
  textAlignExpr,
  toPascalCase,
  toSnakeCase,
} from './dart-utils'
import { generateThemeFile } from './theme'

type RenderContext = { tokens: DesignTokens; warnings: string[] }

function firstSolidFillColor(fills: Fill[]): Color | null {
  const found = fills.find((f) => f.type === 'solid')
  return found && found.type === 'solid' ? found.color : null
}

function firstStroke(strokes: Stroke[]): Stroke | null {
  return strokes[0] ?? null
}

function dartString(value: string): string {
  return `'${escapeDartString(value)}'`
}

// EdgeInsets pour les marges d'une frame row/column (decision 7). Absent
// (pas de Padding du tout) quand les quatre cotes sont nuls.
function edgeInsetsBlock(padding: { top: number; right: number; bottom: number; left: number }): Block | null {
  const { top, right, bottom, left } = padding
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return null
  if (top === right && right === bottom && bottom === left) {
    return lit(`const EdgeInsets.all(${formatNumber(top)})`)
  }
  return lit(
    `const EdgeInsets.fromLTRB(${formatNumber(left)}, ${formatNumber(top)}, ${formatNumber(right)}, ${formatNumber(bottom)})`,
  )
}

// BoxDecoration commune a rect/ellipse/frame : couleur de remplissage,
// rayon d'angle (ou forme circulaire pour une ellipse) et bordure —
// seulement les attributs qui s'ecartent de leur valeur par defaut, pour
// ne jamais emettre une decoration vide.
function decorationBlock(
  fills: Fill[],
  strokes: Stroke[],
  cornerRadius: number | null,
  shapeCircle: boolean,
  tokens: DesignTokens,
): Block | null {
  const fillColor = firstSolidFillColor(fills)
  const stroke = firstStroke(strokes)
  const args: Arg[] = []

  if (shapeCircle) args.push({ key: 'shape', block: lit('BoxShape.circle') })
  if (fillColor) args.push({ key: 'color', block: lit(colorExpr(fillColor, tokens)) })
  if (cornerRadius !== null && cornerRadius > 0) {
    args.push({ key: 'borderRadius', block: lit(`BorderRadius.circular(${formatNumber(cornerRadius)})`) })
  }
  if (stroke) {
    args.push({
      key: 'border',
      block: call('Border.all', [
        { key: 'color', block: lit(colorExpr(stroke.color, tokens)) },
        { key: 'width', block: lit(formatNumber(stroke.width)) },
      ]),
    })
  }

  return args.length === 0 ? null : call('BoxDecoration', args)
}

function renderRect(node: RectNode, ctx: RenderContext): Block {
  const args: Arg[] = [
    { key: 'width', block: lit(formatNumber(node.frame.w)) },
    { key: 'height', block: lit(formatNumber(node.frame.h)) },
  ]
  const decoration = decorationBlock(node.fills, node.strokes, node.cornerRadius, false, ctx.tokens)
  if (decoration) args.push({ key: 'decoration', block: decoration })
  return call('Container', args)
}

function renderEllipse(node: EllipseNode, ctx: RenderContext): Block {
  const args: Arg[] = [
    { key: 'width', block: lit(formatNumber(node.frame.w)) },
    { key: 'height', block: lit(formatNumber(node.frame.h)) },
  ]
  const decoration = decorationBlock(node.fills, node.strokes, null, true, ctx.tokens)
  if (decoration) args.push({ key: 'decoration', block: decoration })
  return call('Container', args)
}

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//.test(src)
}

function renderImage(node: ImageNode): Block {
  const args: Arg[] = [
    { block: lit(dartString(node.src)) },
    { key: 'width', block: lit(formatNumber(node.frame.w)) },
    { key: 'height', block: lit(formatNumber(node.frame.h)) },
    { key: 'fit', block: lit(boxFitExpr(node.fit)) },
  ]
  return call(isRemoteUrl(node.src) ? 'Image.network' : 'Image.asset', args)
}

// Un pixel d'epaisseur, dans le sens perpendiculaire a la plus grande
// dimension de la frame (decision 7) : une ligne large et basse est
// horizontale (hauteur figee a 1), une ligne haute et etroite est
// verticale (largeur figee a 1).
function renderLine(node: LineNode, ctx: RenderContext): Block {
  const horizontal = node.frame.w >= node.frame.h
  return call('Container', [
    { key: 'width', block: lit(horizontal ? formatNumber(node.frame.w) : '1') },
    { key: 'height', block: lit(horizontal ? '1' : formatNumber(node.frame.h)) },
    { key: 'color', block: lit(colorExpr(node.stroke.color, ctx.tokens)) },
  ])
}

function renderText(node: TextNode, ctx: RenderContext): Block {
  const styleArgs: Arg[] = [
    { key: 'fontFamily', block: lit(dartString(node.style.fontFamily)) },
    { key: 'fontSize', block: lit(formatNumber(node.style.fontSize)) },
    { key: 'fontWeight', block: lit(fontWeightExpr(node.style.fontWeight)) },
  ]
  if (node.style.lineHeight > 0 && node.style.fontSize > 0) {
    styleArgs.push({ key: 'height', block: lit(formatNumber(node.style.lineHeight / node.style.fontSize)) })
  }
  if (node.style.letterSpacing !== 0) {
    styleArgs.push({ key: 'letterSpacing', block: lit(formatNumber(node.style.letterSpacing)) })
  }
  styleArgs.push({ key: 'color', block: lit(colorExpr(node.style.color, ctx.tokens)) })

  return call('Text', [
    { block: lit(dartString(node.characters)) },
    { key: 'textAlign', block: lit(textAlignExpr(node.style.align)) },
    { key: 'style', block: call('TextStyle', styleArgs) },
  ])
}

function renderStackChildren(frame: FrameNode, ctx: RenderContext): Block[] {
  const blocks: Block[] = []
  for (const child of frame.children) {
    const rendered = renderNode(child, ctx)
    if (!rendered) continue
    blocks.push(
      call('Positioned', [
        { key: 'left', block: lit(formatNumber(child.frame.x)) },
        { key: 'top', block: lit(formatNumber(child.frame.y)) },
        { key: 'width', block: lit(formatNumber(child.frame.w)) },
        { key: 'height', block: lit(formatNumber(child.frame.h)) },
        { key: 'child', block: rendered },
      ]),
    )
  }
  return blocks
}

// N'insere jamais de SizedBox entre les enfants quand alignMain vaut
// `space-between` : Flutter compterait ce SizedBox comme un enfant de
// plus et repartirait l'espace libre autour de lui EN PLUS de sa largeur
// fixe, ce qui diverge visiblement du rendu voulu. C'est exactement la
// semantique de `applyAutoLayout` dans @calque/core, qui ignore deja
// `gap` en mode `space-between` (l'espacement vient alors entierement de
// MainAxisAlignment.spaceBetween) : le generateur doit s'aligner sur le
// moteur de mise en page, pas le contredire.
function interleaveGap(
  blocks: Block[],
  gap: number,
  axis: 'width' | 'height',
  alignMain: 'start' | 'center' | 'end' | 'space-between',
): Block[] {
  if (blocks.length <= 1 || gap === 0 || alignMain === 'space-between') return blocks
  const result: Block[] = []
  blocks.forEach((block, index) => {
    if (index > 0) result.push(lit(`const SizedBox(${axis}: ${formatNumber(gap)})`))
    result.push(block)
  })
  return result
}

function renderFrame(frame: FrameNode, ctx: RenderContext): Block {
  let content: Block

  if (frame.layout.mode === 'absolute') {
    const children = renderStackChildren(frame, ctx)
    content =
      children.length === 0
        ? lit('const SizedBox.shrink()')
        : call('Stack', [{ key: 'children', block: list(children) }])
  } else {
    const isRow = frame.layout.mode === 'row'
    const rawChildren = frame.children.map((c) => renderNode(c, ctx)).filter((b): b is Block => b !== null)
    const children = interleaveGap(
      rawChildren,
      frame.layout.gap,
      isRow ? 'width' : 'height',
      frame.layout.alignMain,
    )
    const widgetName = isRow ? 'Row' : 'Column'
    const layoutWidget = call(widgetName, [
      { key: 'mainAxisAlignment', block: lit(mainAxisAlignmentExpr(frame.layout.alignMain)) },
      { key: 'crossAxisAlignment', block: lit(crossAxisAlignmentExpr(frame.layout.alignCross)) },
      { key: 'children', block: list(children) },
    ])
    const padding = edgeInsetsBlock(frame.layout.padding)
    content = padding
      ? call('Padding', [
          { key: 'padding', block: padding },
          { key: 'child', block: layoutWidget },
        ])
      : layoutWidget
  }

  const decoration = decorationBlock(frame.fills, frame.strokes, frame.cornerRadius, false, ctx.tokens)
  const containerArgs: Arg[] = [
    { key: 'width', block: lit(formatNumber(frame.frame.w)) },
    { key: 'height', block: lit(formatNumber(frame.frame.h)) },
  ]
  if (decoration) containerArgs.push({ key: 'decoration', block: decoration })
  containerArgs.push({ key: 'child', block: content })

  return call('Container', containerArgs)
}

function renderNodeInner(node: Node, ctx: RenderContext): Block | null {
  switch (node.type) {
    case 'frame':
      return renderFrame(node, ctx)
    case 'text':
      return renderText(node, ctx)
    case 'rect':
      return renderRect(node, ctx)
    case 'ellipse':
      return renderEllipse(node, ctx)
    case 'image':
      return renderImage(node)
    case 'line':
      return renderLine(node, ctx)
    default: {
      // Type inconnu du generateur : jamais ignore en silence (decision
      // 11 du brief), on l'ecrit dans warnings et on n'emet aucun widget
      // pour ce noeud plutot que de produire du Dart invalide.
      const unknown = node as unknown as { type: string; id: string }
      ctx.warnings.push(
        `Type de noeud non supporte par l'exportateur Flutter : "${unknown.type}" (noeud ${unknown.id})`,
      )
      return null
    }
  }
}

function renderNode(node: Node, ctx: RenderContext): Block | null {
  if (!node.visible) return null

  const inner = renderNodeInner(node, ctx)
  if (inner === null) return null

  let block = inner
  if (node.rotation !== 0) {
    const radians = (node.rotation * Math.PI) / 180
    block = call('Transform.rotate', [
      { key: 'angle', block: lit(formatNumber(radians)) },
      { key: 'child', block },
    ])
  }
  if (node.opacity < 1) {
    block = call('Opacity', [
      { key: 'opacity', block: lit(formatNumber(node.opacity)) },
      { key: 'child', block },
    ])
  }
  return block
}

function renderPage(page: Page, ctx: RenderContext): ExportedFile {
  const blocks = page.nodes.map((n) => renderNode(n, ctx)).filter((b): b is Block => b !== null)
  const rootBlock: Block =
    blocks.length === 1 ? blocks[0]! : call('Stack', [{ key: 'children', block: list(blocks) }])

  const className = toPascalCase(page.name)
  const fileName = toSnakeCase(page.name)

  const lines = [
    `import 'package:flutter/material.dart';`,
    '',
    `import '../theme.dart';`,
    '',
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    '',
    '  @override',
    '  Widget build(BuildContext context) {',
    ...attach('return ', rootBlock, 2, ';'),
    '  }',
    '}',
    '',
  ]

  return { path: `lib/screens/${fileName}.dart`, contents: lines.join('\n') }
}

function exportFlutter(doc: CalqueDocument, _opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []

  for (const page of doc.pages) {
    const laidOutPage = layoutPage(page)
    const ctx: RenderContext = { tokens: doc.tokens, warnings }
    files.push(renderPage(laidOutPage, ctx))
  }

  files.push(generateThemeFile(doc.tokens))

  return { files, warnings }
}

export const flutterExporter: Exporter = {
  id: 'flutter',
  label: 'Flutter',
  maturity: 'complete',
  export: exportFlutter,
}
