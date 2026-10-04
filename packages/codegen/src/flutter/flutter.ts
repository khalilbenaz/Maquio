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
  ComponentNode,
  DesignTokens,
  EllipseNode,
  Fill,
  FrameNode,
  ImageNode,
  LineNode,
  Node,
  RectNode,
  Stroke,
  TextNode,
} from '@calque/core'
import { layoutPage } from '@calque/core'
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { hasScaffoldParts, planExport, splitScreen } from '../shared/screens'
import { interactionFor, isNativeTransition } from '../shared/interactions'
import type { RInteraction } from '../shared/interactions'
import { ActionRegistry, TRANSITIONS_DART, animationStyle, navigationFunction, urlFunction } from './interactions'
import type { ExportPlan, ScreenParts } from '../shared/screens'
import type { Transition } from '@calque/core'
import type { Exporter, ExportAsset, ExportedFile, ExportOptions, ExportResult } from '../types'
import { planAssets } from '../shared/assets'
import type { AssetTarget } from '../shared/assets'
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
} from './dart-utils'
import { toPascalCase, toSnakeCase } from '../shared/naming'
import { generateThemeFile } from './theme'
import { navigateExpr, renderComponent } from './components'
import type { Acts } from './components'

// `usesTheme` (D4 du rapport dart-correctness) : mis a `true` des qu'une
// reference `AppColors.*` est effectivement emise pour la page en cours
// (voir `colorExpr` de dart-utils.ts), pour que `renderPage` n'importe
// '../theme.dart' que si l'ecran genere s'en sert reellement -- un import
// inconditionnel produit un `unused_import` a l'analyse pour tout ecran
// sans token de couleur (cas courant : une frame de mise en page pure).
type RenderContext = {
  tokens: DesignTokens
  warnings: string[]
  usesTheme: boolean
  plan: ExportPlan
  // Le tiroir de l'ecran courant (le bouton « menu » de la barre l'ouvre).
  hasDrawer: boolean
  // Un composant a ete emis : voir ignoreForFile dans renderPage.
  usesComponents: boolean
  // `scheme` (ColorScheme du theme) est reference : voir renderUnit.
  usesScheme: boolean
  // Registre des actions (navigations animees, overlays, URL) du projet.
  actions: ActionRegistry
  // L'ecran appelle une fonction de lib/actions.dart.
  usesActions: boolean
}

// Expression Dart d'une interaction, appelee depuis un widget qui dispose de `context`.
function dartExpr(ri: RInteraction, ctx: RenderContext): string {
  const a = ri.action
  switch (a.type) {
    case 'navigate':
      if (isNativeTransition(ri.transition)) return navigateExpr(a.screen)
      ctx.usesActions = true
      return `${ctx.actions.navigate(a.screen, ri.transition)}(context)`
    case 'back':
    case 'closeOverlay':
      return 'Navigator.of(context).maybePop()'
    case 'openOverlay':
      ctx.usesActions = true
      return `${ctx.actions.overlay(a.overlay, ri.transition)}(context)`
    case 'openUrl':
      ctx.usesActions = true
      return `${ctx.actions.url(a.url)}()`
  }
}

export function dartActs(node: Node, ctx: RenderContext): Acts {
  const tap = interactionFor(node, ctx.plan, 'tap')
  const longPress = interactionFor(node, ctx.plan, 'longPress')
  return { tap: tap === null ? null : dartExpr(tap, ctx), longPress: longPress === null ? null : dartExpr(longPress, ctx) }
}

// Un enfant est place soit dans un Stack (Positioned fournit sa taille),
// soit dans un flux Row/Column/ListView (il faut lui donner sa taille).
type Parent = 'stack' | 'flow'

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

function renderStackChildren(children: Node[], ctx: RenderContext, yOffset = 0): Block[] {
  const blocks: Block[] = []
  for (const child of children) {
    const rendered = renderNode(child, ctx, 'stack')
    if (!rendered) continue
    blocks.push(
      call('Positioned', [
        { key: 'left', block: lit(formatNumber(child.frame.x)) },
        { key: 'top', block: lit(formatNumber(child.frame.y - yOffset)) },
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

// Contenu d'une frame (Stack de Positioned, ou Row/Column avec ecarts et
// marges) sans sa boite. `children`/`yOffset` permettent de rendre un
// sous-ensemble (corps d'un Scaffold) decale du bas de la barre
// d'application.
function frameContent(frame: FrameNode, ctx: RenderContext, children: Node[] = frame.children, yOffset = 0): Block {
  if (frame.layout.mode === 'absolute') {
    const blocks = renderStackChildren(children, ctx, yOffset)
    return blocks.length === 0 ? lit('const SizedBox.shrink()') : call('Stack', [{ key: 'children', block: list(blocks) }])
  }
  const isRow = frame.layout.mode === 'row'
  const rawChildren = renderFlowChildren(children, ctx)
  const interleaved = interleaveGap(rawChildren, frame.layout.gap, isRow ? 'width' : 'height', frame.layout.alignMain)
  const layoutWidget = call(isRow ? 'Row' : 'Column', [
    { key: 'mainAxisAlignment', block: lit(mainAxisAlignmentExpr(frame.layout.alignMain)) },
    { key: 'crossAxisAlignment', block: lit(crossAxisAlignmentExpr(frame.layout.alignCross)) },
    { key: 'children', block: list(interleaved) },
  ])
  const padding = edgeInsetsBlock(frame.layout.padding)
  return padding
    ? call('Padding', [
        { key: 'padding', block: padding },
        { key: 'child', block: layoutWidget },
      ])
    : layoutWidget
}

function renderFlowChildren(children: Node[], ctx: RenderContext, spacerIsFlex = true): Block[] {
  return children.map((c) => renderNode(c, ctx, 'flow', spacerIsFlex)).filter((b): b is Block => b !== null)
}

// `(context) => <widget>` : prefixe la premiere ligne d'un bloc.
function builder(block: Block): Block {
  return block.map((line, i) => (i === 0 ? `(context) => ${line}` : line))
}

function padArg(frame: FrameNode): Arg[] {
  const padding = edgeInsetsBlock(frame.layout.padding)
  return padding ? [{ key: 'padding', block: padding }] : []
}

// Widget natif d'un conteneur semantique (frame portant `container`), ou null
// pour une frame ordinaire. Le widget est l'enfant de la boite de la frame
// (voir renderFrame) ; les enfants sont rendus par le conteneur lui-meme.
function containerWidget(frame: FrameNode, ctx: RenderContext): { widget: Block; ownsBox: boolean } | null {
  const spec = frame.container
  if (spec === undefined) return null
  ctx.usesComponents = true
  const fill = firstSolidFillColor(frame.fills)
  const markTheme = () => {
    ctx.usesTheme = true
  }
  const fillArg: Arg[] = fill ? [{ key: 'backgroundColor', block: lit(colorExpr(fill, ctx.tokens, markTheme)) }] : []
  const flowChildren = (): Block[] => {
    const raw = renderFlowChildren(frame.children, ctx, false)
    return raw
  }

  switch (spec.kind) {
    case 'card': {
      const stroke = firstStroke(frame.strokes)
      const shapeArgs: Arg[] = [{ key: 'borderRadius', block: lit(`BorderRadius.circular(${formatNumber(frame.cornerRadius)})`) }]
      if (stroke) {
        shapeArgs.push({
          key: 'side',
          block: call('BorderSide', [
            { key: 'color', block: lit(colorExpr(stroke.color, ctx.tokens, markTheme)) },
            { key: 'width', block: lit(formatNumber(stroke.width)) },
          ]),
        })
      }
      return {
        ownsBox: false,
        widget: call('Card', [
          { key: 'elevation', block: lit(formatNumber(spec.elevation)) },
          ...(fill ? [{ key: 'color', block: lit(colorExpr(fill, ctx.tokens, markTheme)) }] : []),
          { key: 'margin', block: lit('EdgeInsets.zero') },
          { key: 'shape', block: call('RoundedRectangleBorder', shapeArgs) },
          { key: 'clipBehavior', block: lit('Clip.antiAlias') },
          { key: 'child', block: frameContent(frame, ctx) },
        ]),
      }
    }
    case 'listView': {
      const horizontal = spec.axis === 'horizontal'
      const separator = (): Block | null =>
        spec.dividers
          ? lit(horizontal ? 'const VerticalDivider(width: 1)' : 'const Divider(height: 1)')
          : frame.layout.gap > 0
            ? lit(`const SizedBox(${horizontal ? 'width' : 'height'}: ${formatNumber(frame.layout.gap)})`)
            : null
      const items: Block[] = []
      flowChildren().forEach((child, i) => {
        const sep = i > 0 ? separator() : null
        if (sep) items.push(sep)
        items.push(child)
      })
      return {
        ownsBox: true,
        widget: call('ListView', [
          ...(horizontal ? [{ key: 'scrollDirection', block: lit('Axis.horizontal') }] : []),
          ...padArg(frame),
          { key: 'children', block: list(items) },
        ]),
      }
    }
    case 'grid': {
      const { gap, padding } = frame.layout
      const inner = Math.max(frame.frame.w - padding.left - padding.right, 0)
      const cell = Math.max((inner - gap * (spec.columns - 1)) / spec.columns, 0)
      const first = frame.children[0]
      const ratio = first && first.frame.h > 0 ? cell / first.frame.h : 1
      return {
        ownsBox: true,
        widget: call('GridView.count', [
          { key: 'crossAxisCount', block: lit(String(spec.columns)) },
          { key: 'mainAxisSpacing', block: lit(formatNumber(gap)) },
          { key: 'crossAxisSpacing', block: lit(formatNumber(gap)) },
          { key: 'childAspectRatio', block: lit(formatNumber(ratio)) },
          ...padArg(frame),
          { key: 'children', block: list(flowChildren()) },
        ]),
      }
    }
    case 'scrollView': {
      const horizontal = spec.axis === 'horizontal'
      let content = frameContent(frame, ctx)
      if (frame.layout.mode === 'absolute') {
        // Un Stack n'a pas de taille propre : on lui donne celle de son contenu.
        const extentW = Math.max(frame.frame.w, ...frame.children.map((c) => c.frame.x + c.frame.w))
        const extentH = Math.max(frame.frame.h, ...frame.children.map((c) => c.frame.y + c.frame.h))
        content = call('SizedBox', [
          { key: 'width', block: lit(formatNumber(extentW)) },
          { key: 'height', block: lit(formatNumber(extentH)) },
          { key: 'child', block: content },
        ])
      }
      return {
        ownsBox: true,
        widget: call('SingleChildScrollView', [
          ...(horizontal ? [{ key: 'scrollDirection', block: lit('Axis.horizontal') }] : []),
          { key: 'child', block: content },
        ]),
      }
    }
    case 'safeArea':
      return { ownsBox: true, widget: call('SafeArea', [{ key: 'child', block: frameContent(frame, ctx) }]) }
    case 'bottomSheet':
      return {
        ownsBox: false,
        widget: call('BottomSheet', [
          { key: 'onClosing', block: lit('() {}') },
          { key: 'enableDrag', block: lit('false') },
          { key: 'showDragHandle', block: lit(String(spec.handle)) },
          ...fillArg,
          {
            key: 'shape',
            block: call('RoundedRectangleBorder', [
              { key: 'borderRadius', block: lit(`BorderRadius.vertical(top: Radius.circular(${formatNumber(frame.cornerRadius)}))`) },
            ]),
          },
          { key: 'builder', block: builder(frameContent(frame, ctx)) },
        ]),
      }
    case 'drawer':
      return {
        ownsBox: false,
        widget: call('Drawer', [
          { key: 'width', block: lit(formatNumber(frame.frame.w)) },
          ...fillArg,
          { key: 'child', block: frameContent(frame, ctx) },
        ]),
      }
  }
}

function renderFrame(frame: FrameNode, ctx: RenderContext): Block {
  const container = containerWidget(frame, ctx)
  if (container !== null && !container.ownsBox) {
    return boxOrSizedBox(frame.frame.w, frame.frame.h, null, false, container.widget)
  }
  const content = container !== null ? container.widget : frameContent(frame, ctx)

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

type Rendered = { block: Block; consumesLink: boolean }

function renderNodeInner(node: Node, ctx: RenderContext, parent: Parent, spacerIsFlex: boolean): Rendered | null {
  const plain = (block: Block | null): Rendered | null => (block === null ? null : { block, consumesLink: false })
  switch (node.type) {
    case 'frame':
      return plain(renderFrame(node, ctx))
    case 'text':
      return plain(renderText(node, ctx))
    case 'rect':
      return plain(renderRect(node, ctx))
    case 'ellipse':
      return plain(renderEllipse(node, ctx))
    case 'image':
      return plain(renderImage(node, ctx))
    case 'line':
      return plain(renderLine(node, ctx))
    case 'component': {
      ctx.usesComponents = true
      const rendered = renderComponent(node, {
        act: (n) => dartActs(n, ctx),
        tokens: ctx.tokens,
        plan: ctx.plan,
        hasDrawer: ctx.hasDrawer,
        inFlex: parent === 'flow' && spacerIsFlex,
        markTheme: () => {
          ctx.usesTheme = true
        },
        markScheme: () => {
          ctx.usesScheme = true
        },
      })
      if (rendered === null) return null
      // Un Spacer de flux est rendu tel quel : le envelopper casserait son flex.
      if (parent === 'flow' && node.kind === 'spacer' && spacerIsFlex) return rendered
      // Dans un flux, aucun Positioned ne fournit la taille : on la donne.
      if (parent === 'flow') {
        return {
          consumesLink: rendered.consumesLink,
          block: call('SizedBox', [
            { key: 'width', block: lit(formatNumber(node.frame.w)) },
            { key: 'height', block: lit(formatNumber(node.frame.h)) },
            { key: 'child', block: rendered.block },
          ]),
        }
      }
      return rendered
    }
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

function renderNode(node: Node, ctx: RenderContext, parent: Parent = 'stack', spacerIsFlex = true): Block | null {
  if (!node.visible) return null
  // Une overlay ouverte par une interaction est un gabarit : jamais en place dans l'ecran.
  if (ctx.plan.overlays.has(node.id)) return null

  const rendered = renderNodeInner(node, ctx, parent, spacerIsFlex)
  if (rendered === null) return null

  let block = rendered.block
  // Interactions : un noeud avec un clic (hors widgets qui le gerent deja
  // eux-memes : boutons, element de liste...) ou un appui long devient
  // sensible au geste.
  const acts = dartActs(node, ctx)
  const wrapTap = acts.tap !== null && !rendered.consumesLink
  if (wrapTap || acts.longPress !== null) {
    ctx.usesComponents = true
    block = call('GestureDetector', [
      { key: 'behavior', block: lit('HitTestBehavior.opaque') },
      ...(wrapTap ? [{ key: 'onTap', block: lit(`() => ${acts.tap}`) }] : []),
      ...(acts.longPress !== null ? [{ key: 'onLongPress', block: lit(`() => ${acts.longPress}`) }] : []),
      { key: 'child', block },
    ])
  }
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

// Un ecran devient un Scaffold : la barre d'application, la barre de
// navigation basse, le bouton flottant et le tiroir du design occupent les
// emplacements natifs (appBar, bottomNavigationBar, floatingActionButton,
// drawer) ; le reste forme le corps. Un Scaffold est aussi ce qui fournit
// l'ancetre Material qu'exigent TextField, ListTile, etc.
function scaffoldBlock(screen: FrameNode, parts: ScreenParts, ctx: RenderContext): Block {
  const markTheme = () => {
    ctx.usesTheme = true
  }
  const args: Arg[] = []
  const fill = firstSolidFillColor(screen.fills)
  if (fill) args.push({ key: 'backgroundColor', block: lit(colorExpr(fill, ctx.tokens, markTheme)) })

  const slot = (node: ComponentNode): Block | null => renderComponentSlot(node, ctx)
  if (parts.appBar) {
    const bar = slot(parts.appBar)
    if (bar) args.push({ key: 'appBar', block: bar })
  }
  if (parts.drawer) {
    const drawer = containerWidget(parts.drawer, ctx)
    if (drawer !== null) args.push({ key: 'drawer', block: drawer.widget })
  }
  args.push({ key: 'body', block: frameContent(screen, ctx, parts.body, parts.topInset) })
  if (parts.bottomNav) {
    const nav = slot(parts.bottomNav)
    if (nav) args.push({ key: 'bottomNavigationBar', block: nav })
  }
  if (parts.fab) {
    const fab = slot(parts.fab)
    if (fab) args.push({ key: 'floatingActionButton', block: fab })
    const centre = parts.fab.frame.x + parts.fab.frame.w / 2
    if (Math.abs(centre - screen.frame.w / 2) < 24) {
      args.push({ key: 'floatingActionButtonLocation', block: lit('FloatingActionButtonLocation.centerFloat') })
    }
  }
  return call('Scaffold', args)
}

// Composant d'emplacement de Scaffold : rendu SANS enveloppe de taille (le
// Scaffold dimensionne lui-meme appBar, barre basse et bouton flottant).
function renderComponentSlot(node: ComponentNode, ctx: RenderContext): Block | null {
  const rendered = renderComponent(node, {
    act: (n) => dartActs(n, ctx),
    tokens: ctx.tokens,
    plan: ctx.plan,
    hasDrawer: ctx.hasDrawer,
    inFlex: false,
    markTheme: () => {
      ctx.usesTheme = true
    },
    markScheme: () => {
      ctx.usesScheme = true
    },
  })
  return rendered === null ? null : rendered.block
}

function renderUnit(
  unit: { rootNodes: Node[]; screen: FrameNode | null; parts: ScreenParts | null },
  ctx: RenderContext,
  names: { pascal: string; snake: string },
): ExportedFile {
  let rootBlock: Block
  if (unit.screen !== null && unit.parts !== null) {
    rootBlock = scaffoldBlock(unit.screen, unit.parts, ctx)
  } else {
    const visibleRoots = unit.rootNodes.filter((n) => n.visible)
    if (visibleRoots.length === 1) {
      const only = renderNode(visibleRoots[0]!, ctx)
      rootBlock = only ?? call('SizedBox', [])
    } else {
      // Plusieurs racines (page v1 sans ecran) : chacune est POSITIONNEE,
      // sinon elles s'empileraient toutes en haut a gauche.
      rootBlock = call('Stack', [{ key: 'children', block: list(renderStackChildren(visibleRoots, ctx)) }])
    }
  }

  const className = names.pascal
  const fileName = names.snake

  // D4 (rapport dart-correctness) : `import '../theme.dart';` seulement si
  // l'ecran reference au moins un `AppColors.*` (`ctx.usesTheme`, mis a
  // jour par `colorExpr` au fil du rendu des noeuds ci-dessus, donc deja
  // stabilise a ce point). Un import inconditionnel produisait un
  // `unused_import` a l'analyse pour tout ecran sans token de couleur.
  const themeImportLines = ctx.usesTheme ? [`import '../theme.dart';`, ''] : []

  // Le code genere melange widgets constants et non constants (rappels de
  // navigation, controleurs) : demander `const` partout y serait du bruit
  // sans effet de style, et en forcer certains produirait des
  // `unnecessary_const`. Neutralise EXPLICITEMENT ces deux regles de
  // performance, uniquement dans les fichiers qui emettent des composants.
  const ignoreLines = ctx.usesComponents
    ? ['// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables', '']
    : []

  // `afterDelay` (interaction de l'ecran) : un minuteur arme a l'affichage.
  const delay = unit.screen === null ? null : interactionFor(unit.screen, ctx.plan, 'afterDelay')
  const delayTrigger = unit.screen?.interactions?.find((i) => i.trigger.type === 'afterDelay')?.trigger
  const delayMs = delayTrigger?.type === 'afterDelay' ? delayTrigger.ms : 0
  const delayExpr = delay === null ? null : dartExpr(delay, ctx)
  const actionsImport = ctx.usesActions ? [`import '../actions.dart';`, ''] : []
  const buildBody = [
    '  @override',
    '  Widget build(BuildContext context) {',
    ...(ctx.usesScheme ? ['    final scheme = Theme.of(context).colorScheme;', ''] : []),
    ...attach('return ', rootBlock, 2, ';'),
    '  }',
  ]
  const classLines =
    delayExpr === null
      ? [`class ${className} extends StatelessWidget {`, `  const ${className}({super.key});`, '', ...buildBody, '}']
      : [
          `class ${className} extends StatefulWidget {`,
          `  const ${className}({super.key});`,
          '',
          '  @override',
          `  State<${className}> createState() => _${className}State();`,
          '}',
          '',
          `class _${className}State extends State<${className}> {`,
          '  Timer? _timer;',
          '',
          '  @override',
          '  void initState() {',
          '    super.initState();',
          `    _timer = Timer(const Duration(milliseconds: ${delayMs}), () {`,
          `      if (mounted) ${delayExpr};`,
          '    });',
          '  }',
          '',
          '  @override',
          '  void dispose() {',
          '    _timer?.cancel();',
          '    super.dispose();',
          '  }',
          '',
          ...buildBody,
          '}',
        ]

  const lines = [
    ...ignoreLines,
    ...(delayExpr === null ? [] : [`import 'dart:async';`, '']),
    `import 'package:flutter/material.dart';`,
    '',
    ...themeImportLines,
    ...actionsImport,
    ...classLines,
    '',
  ]

  return { path: `lib/screens/${fileName}.dart`, contents: collapseShortCalls(lines).join('\n') }
}

// Corps d'une fonction qui affiche une overlay (dialogue, feuille basse,
// snackbar) : le widget est celui du composant / conteneur du design.
function overlayFunction(name: string, ref: { kind: string; node: Node }, transition: Transition, ctx: RenderContext): string[] {
  const node = ref.node
  let call_: Block
  if (ref.kind === 'dialog' && node.type === 'component') {
    const widget = renderComponentSlot(node, ctx) ?? lit('const SizedBox()')
    call_ = call('showDialog<void>', [
      { key: 'context', block: lit('context') },
      { key: 'animationStyle', block: animationStyle(transition) },
      { key: 'builder', block: builder(widget) },
    ])
  } else if (ref.kind === 'bottomSheet' && node.type === 'frame') {
    const content = frameContent(node, ctx)
    const fill = firstSolidFillColor(node.fills)
    call_ = call('showModalBottomSheet<void>', [
      { key: 'context', block: lit('context') },
      { key: 'isScrollControlled', block: lit('true') },
      ...(fill ? [{ key: 'backgroundColor', block: lit(colorExpr(fill, ctx.tokens, () => { ctx.usesTheme = true })) }] : []),
      {
        key: 'shape',
        block: call('RoundedRectangleBorder', [
          { key: 'borderRadius', block: lit(`BorderRadius.vertical(top: Radius.circular(${formatNumber(node.cornerRadius)}))`) },
        ]),
      },
      { key: 'sheetAnimationStyle', block: animationStyle(transition) },
      { key: 'builder', block: builder(call('SizedBox', [{ key: 'height', block: lit(formatNumber(node.frame.h)) }, { key: 'child', block: content }])) },
    ])
  } else if (node.type === 'component' && node.kind === 'snackbar') {
    const p = node.props
    const snackArgs: Arg[] = [{ key: 'content', block: call('Text', [{ block: lit(dartString(p.message)) }]) }]
    if (p.actionLabel !== '') {
      snackArgs.push({
        key: 'action',
        block: call('SnackBarAction', [
          { key: 'label', block: lit(dartString(p.actionLabel)) },
          { key: 'onPressed', block: lit('() {}') },
        ]),
      })
    }
    call_ = attach('ScaffoldMessenger.of(context).', call('showSnackBar', [{ block: call('SnackBar', snackArgs) }]), 0, '').map((l) => l)
  } else {
    call_ = lit('')
  }
  return [
    `void ${name}(BuildContext context) {`,
    ...(ctx.usesScheme ? ['  final scheme = Theme.of(context).colorScheme;'] : []),
    ...attach('', call_, 1, ';'),
    '}',
  ]
}

// lib/transitions.dart (si une navigation est animee) et lib/actions.dart :
// une fonction par navigation animee, overlay et URL du design. Traiter une
// overlay peut en reveler une autre (un bouton d'une feuille qui en ouvre une
// autre) : on itere jusqu'a stabilite.
function generateActionFiles(actions: ActionRegistry, tokens: DesignTokens, plan: ExportPlan, warnings: string[]): ExportedFile[] {
  const bodies: string[][] = []
  const doneOverlays = new Set<string>()
  let usesTheme = false
  let usesComponents = false
  const navLines = new Map<string, string[]>()
  const screensUsed = new Set<string>()
  for (let guard = 0; guard < 50; guard += 1) {
    let progressed = false
    for (const [key, ov] of [...actions.overlays.entries()]) {
      if (doneOverlays.has(key)) continue
      doneOverlays.add(key)
      progressed = true
      const ctx: RenderContext = { tokens, warnings, usesTheme: false, plan, hasDrawer: false, usesComponents: true, usesScheme: false, actions, usesActions: false }
      bodies.push(overlayFunction(ov.name, ov.ref, ov.transition, ctx))
      usesTheme = usesTheme || ctx.usesTheme
      usesComponents = true
    }
    for (const [key, n] of [...actions.navs.entries()]) {
      if (navLines.has(key)) continue
      progressed = true
      navLines.set(key, navigationFunction(n))
      screensUsed.add(n.screen.snake)
    }
    if (!progressed) break
  }
  const header = [
    ...(usesComponents ? ['// ignore_for_file: prefer_const_constructors, prefer_const_literals_to_create_immutables', ''] : []),
    `import 'package:flutter/material.dart';`,
    ...(actions.usesUrls ? [`import 'package:url_launcher/url_launcher.dart';`] : []),
    '',
    ...(usesTheme ? [`import 'theme.dart';`] : []),
    ...[...screensUsed].sort().map((s) => `import 'screens/${s}.dart';`),
    ...(navLines.size > 0 ? [`import 'transitions.dart';`] : []),
    '',
  ]
  const fnBlocks = [...navLines.values(), ...bodies, ...[...actions.urls.entries()].map(([url, name]) => urlFunction(name, url))]
  const lines = [...header, ...fnBlocks.flatMap((b, i) => (i === 0 ? b : ['', ...b])), '']
  const files: ExportedFile[] = [{ path: 'lib/actions.dart', contents: collapseShortCalls(lines).join('\n') }]
  if (navLines.size > 0) files.push({ path: 'lib/transitions.dart', contents: TRANSITIONS_DART })
  return files
}

// Point d'entree de l'application : un MaterialApp dont `routes` expose
// chaque ecran sous `/<nom_de_fichier>`, l'ecran de depart etant l'ecran
// actif (ou le premier). Les liens « au clic, aller a l'ecran X » du design
// deviennent des `Navigator.pushNamed` vers ces routes.
function generateMain(plan: ExportPlan, projectName: string): ExportedFile {
  const taken = new Set(plan.screens.map((s) => s.pascal))
  let appName = `${toPascalCase(projectName)}App`
  while (taken.has(appName)) appName += 'Root'
  const imports = plan.screens.map((s) => `import 'screens/${s.snake}.dart';`)
  const entries = plan.screens.map((s) => `'${s.route}': (context) => const ${s.pascal}()`)
  // `dart format` rassemble une table qui tient sur une ligne.
  const oneLine = `      routes: {${entries.join(', ')}},`
  const routesBlock =
    oneLine.length <= 80 ? [oneLine] : ['      routes: {', ...entries.map((e) => `        ${e},`), '      },']
  const lines = [
    `import 'package:flutter/material.dart';`,
    '',
    `import 'theme.dart';`,
    ...imports,
    '',
    'void main() {',
    `  runApp(const ${appName}());`,
    '}',
    '',
    `class ${appName} extends StatelessWidget {`,
    `  const ${appName}({super.key});`,
    '',
    '  @override',
    '  Widget build(BuildContext context) {',
    '    return MaterialApp(',
    `      title: '${escapeDartString(projectName)}',`,
    '      theme: appTheme,',
    `      initialRoute: '${plan.initial!.route}',`,
    ...routesBlock,
    '    );',
    '  }',
    '}',
    '',
  ]
  return { path: 'lib/main.dart', contents: lines.join('\n') }
}

// Package Dart valide : snake_case, commence par une lettre, pas un mot reserve.
function dartPackageName(projectName: string): string {
  const snake = toSnakeCase(projectName).replace(/[^a-z0-9_]/g, '_')
  const base = /^[a-z]/.test(snake) ? snake : `app_${snake}`
  return base === '' || ['assert', 'class', 'const', 'default', 'enum', 'extends', 'new', 'null', 'switch', 'this', 'var', 'void', 'with'].includes(base) ? `${base || 'app'}_app` : base
}

// pubspec.yaml du projet exporte : sans lui le dossier n'est pas un paquet
// Flutter et les images ne seraient jamais declarees. Les dossiers
// android/ ios/ sont a creer par `flutter create .` (sans toucher a lib/).
function generatePubspec(projectName: string, assets: ExportAsset[], usesUrls = false): ExportedFile {
  const lines = [
    `name: ${dartPackageName(projectName)}`,
    `description: Projet genere par Calque.`,
    `publish_to: 'none'`,
    'version: 1.0.0+1',
    '',
    'environment:',
    "  sdk: '>=3.9.0 <4.0.0'",
    '',
    'dependencies:',
    '  flutter:',
    '    sdk: flutter',
    ...(usesUrls ? ['  url_launcher: ^6.3.0'] : []),
    '',
    'dev_dependencies:',
    '  flutter_lints: ^6.0.0',
    '',
    'flutter:',
    '  uses-material-design: true',
  ]
  if (assets.length > 0) {
    lines.push('  assets:', ...assets.map((a) => `    - ${a.path}`))
  }
  lines.push('')
  return { path: 'pubspec.yaml', contents: lines.join('\n') }
}

const FLUTTER_ASSETS: AssetTarget = {
  fileName: (stem, ext) => `${stem}${ext}`,
  path: (fileName) => `assets/images/${fileName}`,
  reference: (fileName) => `assets/images/${fileName}`,
}

function exportFlutter(source: CalqueDocument, opts: ExportOptions): ExportResult {
  const assetPlan = planAssets(source, FLUTTER_ASSETS)
  const doc = assetPlan.doc
  const warnings: string[] = [...assetPlan.warnings]
  const files: ExportedFile[] = []
  const plan = planExport(doc, opts.activeScreenId)
  const actions = new ActionRegistry()

  for (const unit of plan.units) {
    const ctx: RenderContext = {
      tokens: doc.tokens,
      warnings,
      usesTheme: false,
      plan,
      hasDrawer: false,
      usesComponents: false,
      usesScheme: false,
      actions,
      usesActions: false,
    }
    if (unit.kind === 'page') {
      const laidOutPage = layoutPage(unit.page)
      files.push(renderUnit({ rootNodes: laidOutPage.nodes, screen: null, parts: null }, ctx, unit.names))
      continue
    }
    // L'ecran est mis en page (Row/Column/grille) avant d'etre decoupe.
    const laidOut = layoutPage({ ...unit.page, nodes: [unit.screen] }).nodes[0] as FrameNode
    const parts = splitScreen(laidOut)
    ctx.hasDrawer = parts.drawer !== null
    ctx.usesComponents = hasScaffoldParts(parts)
    files.push(renderUnit({ rootNodes: [], screen: laidOut, parts }, ctx, unit.ref))
  }

  files.push(generateThemeFile(doc.tokens))
  if (plan.initial !== null) {
    files.push(generateMain(plan, opts.projectName))
  }
  if (!actions.isEmpty) files.push(...generateActionFiles(actions, doc.tokens, plan, warnings))
  files.push(generatePubspec(opts.projectName, assetPlan.assets, actions.usesUrls))

  return { files, warnings, assets: assetPlan.assets }
}

export const flutterExporter: Exporter = {
  id: 'flutter',
  label: 'Flutter',
  maturity: 'complete',
  export: exportFlutter,
}
