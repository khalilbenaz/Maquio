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
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl, selectActiveScreen } from '../shared/node-helpers'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { type Arg, type Block, attach, call, collapseShortCalls, lit, list } from './dart-writer'
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

// `usesTheme` (D4 du rapport dart-correctness) : mis a `true` des qu'une
// reference `AppColors.*` est effectivement emise pour la page en cours
// (voir `colorExpr` de dart-utils.ts), pour que `renderPage` n'importe
// '../theme.dart' que si l'ecran genere s'en sert reellement -- un import
// inconditionnel produit un `unused_import` a l'analyse pour tout ecran
// sans token de couleur (cas courant : une frame de mise en page pure).
type RenderContext = { tokens: DesignTokens; warnings: string[]; usesTheme: boolean }

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
  ctx: RenderContext,
): Block | null {
  const fillColor = firstSolidFillColor(fills)
  const stroke = firstStroke(strokes)
  const args: Arg[] = []
  const markThemeUsed = () => {
    ctx.usesTheme = true
  }

  if (shapeCircle) args.push({ key: 'shape', block: lit('BoxShape.circle') })
  if (fillColor) args.push({ key: 'color', block: lit(colorExpr(fillColor, ctx.tokens, markThemeUsed)) })
  if (cornerRadius !== null && cornerRadius > 0) {
    args.push({ key: 'borderRadius', block: lit(`BorderRadius.circular(${formatNumber(cornerRadius)})`) })
  }
  if (stroke) {
    args.push({
      key: 'border',
      block: call('Border.all', [
        { key: 'color', block: lit(colorExpr(stroke.color, ctx.tokens, markThemeUsed)) },
        { key: 'width', block: lit(formatNumber(stroke.width)) },
      ]),
    })
  }

  return args.length === 0 ? null : call('BoxDecoration', args)
}

// Lint `sized_box_for_whitespace` de `flutter_lints` (suite du rapport
// dart-correctness) : verifie a la main avec `flutter analyze` --
// `Container(width:, height:)` SANS decoration, SANS `clipBehavior` et
// SANS marge se fait toujours signaler, MEME avec un `child` (le lint
// suggere `SizedBox`, qui accepte lui aussi `width`/`height`/`child`).
// Ce generateur n'emet jamais de marge sur un `Container` (aucune des
// trois fonctions qui l'utilisent -- rect/ellipse/frame -- ne construit
// d'argument `margin`), donc la condition se reduit ici a « ni
// decoration ni clipBehavior ». Construit soit un `SizedBox`, soit un
// `Container` equivalent, jamais duplique a la main a chaque site
// d'appel (rect, ellipse, frame).
function boxOrSizedBox(
  width: number,
  height: number,
  decoration: Block | null,
  clipsContent: boolean,
  child: Block | null,
): Block {
  const args: Arg[] = [
    { key: 'width', block: lit(formatNumber(width)) },
    { key: 'height', block: lit(formatNumber(height)) },
  ]
  if (decoration === null && !clipsContent) {
    if (child) args.push({ key: 'child', block: child })
    return call('SizedBox', args)
  }
  if (decoration) args.push({ key: 'decoration', block: decoration })
  if (clipsContent) args.push({ key: 'clipBehavior', block: lit('Clip.hardEdge') })
  if (child) args.push({ key: 'child', block: child })
  return call('Container', args)
}

function renderRect(node: RectNode, ctx: RenderContext): Block {
  const decoration = decorationBlock(node.fills, node.strokes, node.cornerRadius, false, ctx)
  return boxOrSizedBox(node.frame.w, node.frame.h, decoration, false, null)
}

function renderEllipse(node: EllipseNode, ctx: RenderContext): Block {
  // `shapeCircle: true` fait toujours pousser un argument `shape` dans
  // `decorationBlock` (voir plus haut) : `decoration` n'est donc jamais
  // `null` ici, `boxOrSizedBox` emet donc toujours `Container` pour une
  // ellipse -- comportement inchange, passe par la meme fonction pour ne
  // pas dupliquer la decision.
  const decoration = decorationBlock(node.fills, node.strokes, null, true, ctx)
  return boxOrSizedBox(node.frame.w, node.frame.h, decoration, false, null)
}

// Ecart connu ferme (README, « Écarts connus ») : un src vide n'emet plus
// `Image.asset('')` / `Image.network('')` en silence -- le noeud n'est
// pas rendu (comme un type de noeud non supporte) et un avertissement est
// ajoute a ExportResult.warnings.
function renderImage(node: ImageNode, ctx: RenderContext): Block | null {
  if (node.src === '') {
    ctx.warnings.push(emptyImageSourceWarning(node.id, 'flutter'))
    return null
  }
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
  const markThemeUsed = () => {
    ctx.usesTheme = true
  }
  return call('Container', [
    { key: 'width', block: lit(horizontal ? formatNumber(node.frame.w) : '1') },
    { key: 'height', block: lit(horizontal ? '1' : formatNumber(node.frame.h)) },
    { key: 'color', block: lit(colorExpr(node.stroke.color, ctx.tokens, markThemeUsed)) },
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
  const markThemeUsed = () => {
    ctx.usesTheme = true
  }
  styleArgs.push({ key: 'color', block: lit(colorExpr(node.style.color, ctx.tokens, markThemeUsed)) })

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

  let decoration = decorationBlock(frame.fills, frame.strokes, frame.cornerRadius, false, ctx)
  // Important 2, corrige apres re-revue : `Container` de Flutter refuse
  // `clipBehavior` sans `decoration` (assert `decoration != null ||
  // clipBehavior == Clip.none`, container.dart) -- une frame
  // `clipsContent: true` sans remplissage, contour ni rayon (ex. une
  // simple frame de mise en page) levait donc a la construction du
  // widget en mode debug. Une `BoxDecoration()` vide satisfait l'assert
  // ET decoupe reellement sur les bords rectangulaires du conteneur
  // (comportement par defaut de `ClipRect` sans forme particuliere) :
  // `clipsContent` reste honore, pas seulement rendu compilable.
  if (frame.clipsContent && !decoration) decoration = lit('const BoxDecoration()')
  // `clipBehavior: Clip.hardEdge` est l'equivalent natif Flutter de
  // `clipsContent`, trivial a honorer ici (Clip vient de package:flutter/
  // material.dart, deja importe) -- jamais de decoupe silencieusement
  // perdue pour une cible qui sait le faire. `boxOrSizedBox` (D-lint,
  // rapport dart-correctness) choisit `SizedBox` a la place de
  // `Container` quand ni decoration ni clipBehavior ne sont dus -- le cas
  // le plus courant pour une frame de mise en page pure importee de
  // Figma (`fills: [{ type: 'none' }]`, `clipsContent: false`).
  return boxOrSizedBox(frame.frame.w, frame.frame.h, decoration, frame.clipsContent, content)
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
      return renderImage(node, ctx)
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

  // D4 (rapport dart-correctness) : `import '../theme.dart';` seulement si
  // l'ecran reference au moins un `AppColors.*` (`ctx.usesTheme`, mis a
  // jour par `colorExpr` au fil du rendu des noeuds ci-dessus, donc deja
  // stabilise a ce point). Un import inconditionnel produisait un
  // `unused_import` a l'analyse pour tout ecran sans token de couleur.
  const themeImportLines = ctx.usesTheme ? [`import '../theme.dart';`, ''] : []

  const lines = [
    `import 'package:flutter/material.dart';`,
    '',
    ...themeImportLines,
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

  return { path: `lib/screens/${fileName}.dart`, contents: collapseShortCalls(lines).join('\n') }
}

function exportFlutter(doc: CalqueDocument, opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []

  for (const page of doc.pages) {
    // v2 (addendum navigation §7) : n'exporte que l'ecran actif d'une page
    // a plusieurs ecrans, avec un avertissement nomme pour chacun des
    // autres -- voir selectActiveScreen. Sans effet sur une page sans ecran.
    const { page: activePage, warnings: screenWarnings } = selectActiveScreen(page, opts.activeScreenId, 'flutter')
    warnings.push(...screenWarnings)

    const laidOutPage = layoutPage(activePage)
    const ctx: RenderContext = { tokens: doc.tokens, warnings, usesTheme: false }
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
