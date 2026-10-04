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
import { ICONS, layoutPage } from '@calque/core'
import { formatNumber } from '../shared/format-number'
import { pad } from '../shared/indent'
import { toPascalCase } from '../shared/naming'
import { unsupportedPropertyWarning } from '../shared/lost-property-warning'
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { planExport, splitScreen } from '../shared/screens'
import { interactionFor, isNativeTransition } from '../shared/interactions'
import type { RInteraction } from '../shared/interactions'
import { APP_TRANSITION_SWIFT, transitionExpr } from './interactions'
import type { OverlayRef } from '../shared/interactions'
import type { Transition } from '@calque/core'
import type { ExportPlan, ScreenParts } from '../shared/screens'
import { PREVIEW_SUPPORTED_NODE_TYPES, unsupportedNodeWarning } from '../shared/preview-coverage'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { planAssets } from '../shared/assets'
import type { AssetTarget } from '../shared/assets'
import { colorTokenComment, swiftColorExpr, swiftFontWeightExpr, swiftString } from './swift-utils'
import { renderSwiftComponent, routeCase } from './components'
import type { SwiftEnvCtx } from './components'

const EXPORTER_ID = 'swiftui'

type RenderContext = {
  tokens: DesignTokens
  warnings: string[]
  plan: ExportPlan
  // Declarations @State, presentations (alert, sheet) et usage du Navigator
  // de la vue en cours de rendu.
  states: string[]
  presentations: string[][]
  usesNavigator: boolean
  counter: number
  // Navigation personnalisee (une transition du design n'est pas la poussee native).
  custom: boolean
  // Overlays ouvertes par les interactions de cet ecran.
  overlayUses: Map<string, { ref: OverlayRef; transition: Transition }>
  usesOverlay: boolean
  usesOpenUrl: boolean
  // Noeud overlay en cours de rendu comme gabarit (exempte du saut de renderNode).
  allowOverlay?: string
}

// Expression Swift (instruction) d'une interaction.
function swAction(ri: RInteraction, ctx: RenderContext): string {
  const a = ri.action
  switch (a.type) {
    case 'navigate':
      ctx.usesNavigator = true
      if (isNativeTransition(ri.transition) || !ctx.custom) return `navigator.go(.${routeCase(a.screen)})`
      return `navigator.go(.${routeCase(a.screen)}, ${transitionExpr(ri.transition)})`
    case 'back':
      ctx.usesNavigator = true
      return 'navigator.back()'
    case 'closeOverlay':
      ctx.usesOverlay = true
      return 'overlay = nil'
    case 'openOverlay':
      ctx.usesOverlay = true
      ctx.overlayUses.set(a.overlay.id, { ref: a.overlay, transition: ri.transition })
      return `overlay = ${swiftString(a.overlay.name)}`
    case 'openUrl':
      ctx.usesOpenUrl = true
      return `openURL(URL(string: ${swiftString(a.url)})!)`
  }
}

function swActs(node: Node, ctx: RenderContext): { tap: string | null; longPress: string | null } {
  const tap = interactionFor(node, ctx.plan, 'tap')
  const long = interactionFor(node, ctx.plan, 'longPress')
  return { tap: tap === null ? null : swAction(tap, ctx), longPress: long === null ? null : swAction(long, ctx) }
}

function envOf(ctx: RenderContext): SwiftEnvCtx {
  return {
    tokens: ctx.tokens,
    plan: ctx.plan,
    states: ctx.states,
    presentations: ctx.presentations,
    markNavigator: () => {
      ctx.usesNavigator = true
    },
    act: (n) => swActs(n, ctx),
    nextIndex: () => ++ctx.counter,
    renderChildren: () => [],
  }
}

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

// Ecart connu ferme (README, « Écarts connus ») : un src vide n'emet plus
// `Image("")` en silence -- le noeud n'est pas rendu (comme un type de
// noeud non supporte) et un avertissement est ajoute a ctx.warnings.
function renderImage(node: ImageNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] | null {
  if (node.src === '') {
    ctx.warnings.push(emptyImageSourceWarning(node.id, EXPORTER_ID))
    return null
  }
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

// Corps d'une frame (pile ou conteneur natif) a `depth`, SANS les
// modificateurs de la frame elle-meme (taille, fond, bord, decalage).
function stackBlock(frame: FrameNode, ctx: RenderContext, depth: number, children: Node[] = frame.children, yOffset = 0): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const isRow = frame.layout.mode === 'row'
  const spec = frame.container
  // SwiftUI n'a pas d'Arrangement.SpaceBetween natif comme Compose : en
  // mode `space-between`, `gap` est ignore (comme partout ailleurs dans le
  // modele — @calque/core l'ignore deja) et l'espacement vient de
  // `Spacer()` interleaves entre les enfants plutot que d'un `spacing:`
  // fixe, qui romprait l'effet de repartition sur tout l'espace libre.
  const isSpaceBetween = frame.layout.alignMain === 'space-between'

  let header: string
  if (isAbsolute) {
    header = 'ZStack(alignment: .topLeading)'
  } else {
    // Important 1 : `stretch` est approxime par le debut de l'axe
    // (alignmentExpr, ci-dessus) faute d'equivalent SwiftUI direct --
    // jamais en silence.
    if (frame.layout.alignCross === 'stretch' && spec === undefined) {
      ctx.warnings.push(unsupportedPropertyWarning("alignCross: 'stretch'", frame.id, EXPORTER_ID))
    }
    const widget = isRow ? 'HStack' : 'VStack'
    const axis = isRow ? 'vertical' : 'horizontal'
    const spacing = isSpaceBetween ? 0 : frame.layout.gap
    header = `${widget}(alignment: ${alignmentExpr(frame.layout.alignCross, axis)}, spacing: ${formatNumber(spacing)})`
  }

  const childLines = (d: number, flowFrames: boolean): string[] => {
    const lines: string[] = []
    const visible = children.filter((c) => c.visible)
    visible.forEach((child, index) => {
      const offset = `.offset(x: ${formatNumber(child.frame.x)}, y: ${formatNumber(child.frame.y - yOffset)})`
      const size = `.frame(width: ${formatNumber(child.frame.w)}, height: ${formatNumber(child.frame.h)})`
      // Un composant porte lui-meme sa taille.
      const childExtra = isAbsolute ? (child.type === 'component' ? [offset] : [offset, size]) : []
      const rendered = renderNode(child, ctx, d, childExtra, flowFrames)
      if (rendered) lines.push(...rendered)
      if (isSpaceBetween && !isAbsolute && index < visible.length - 1) lines.push(`${pad(d)}Spacer()`)
      if (spec?.kind === 'listView' && spec.dividers && index < visible.length - 1) lines.push(`${pad(d)}Divider()`)
    })
    return lines
  }

  if (spec?.kind === 'listView' || spec?.kind === 'scrollView') {
    const horizontal = spec.axis === 'horizontal'
    const scroll = `ScrollView(${horizontal ? '.horizontal' : '.vertical'})`
    if (spec.kind === 'listView') {
      const stack = horizontal ? 'LazyHStack' : 'LazyVStack'
      return [
        `${pad(depth)}${scroll} {`,
        `${pad(depth + 1)}${stack}(spacing: ${formatNumber(frame.layout.gap)}) {`,
        ...childLines(depth + 2, true),
        `${pad(depth + 1)}}`,
        `${pad(depth)}}`,
      ]
    }
    const extent = isAbsolute
      ? [
          `${pad(depth + 1)}.frame(width: ${formatNumber(Math.max(frame.frame.w, ...frame.children.map((c) => c.frame.x + c.frame.w)))}, height: ${formatNumber(Math.max(frame.frame.h, ...frame.children.map((c) => c.frame.y + c.frame.h)))}, alignment: .topLeading)`,
        ]
      : []
    return [`${pad(depth)}${scroll} {`, `${pad(depth + 1)}${header} {`, ...childLines(depth + 2, !isAbsolute), `${pad(depth + 1)}}`, ...extent.map((l) => l), `${pad(depth)}}`]
  }
  if (spec?.kind === 'grid') {
    return [
      `${pad(depth)}LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ${formatNumber(frame.layout.gap)}), count: ${spec.columns}), spacing: ${formatNumber(frame.layout.gap)}) {`,
      ...childLines(depth + 1, true),
      `${pad(depth)}}`,
    ]
  }
  return [`${pad(depth)}${header} {`, ...childLines(depth + 1, !isAbsolute), `${pad(depth)}}`]
}

function renderFrame(frame: FrameNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const spec = frame.container

  // Important 2 : contrairement a Flutter (`clipBehavior`) et React Native
  // (`overflow`), ce generateur `preview` ne decoupe pas le contenu qui
  // deborde -- jamais perdu en silence. Les conteneurs, eux, decoupent
  // nativement (`.clipped()`).
  if (frame.clipsContent && spec === undefined) {
    ctx.warnings.push(unsupportedPropertyWarning('clipsContent', frame.id, EXPORTER_ID))
  }

  // Presentations natives : une feuille basse s'affiche par `.sheet` sur la
  // vue racine, pas a sa position.
  if (spec?.kind === 'bottomSheet') {
    const index = ++ctx.counter
    ctx.states.push(`@State private var showSheet${index} = true`)
    const content = stackBlock(frame, ctx, 1)
    ctx.presentations.push([
      `.sheet(isPresented: $showSheet${index}) {`,
      ...content,
      `    .padding(${formatNumber(frame.layout.padding.top)})`,
      `    .presentationDetents([.height(${formatNumber(frame.frame.h)})])`,
      `    .presentationDragIndicator(${spec.handle ? '.visible' : '.hidden'})`,
      '}',
    ])
    return []
  }

  const lines = stackBlock(frame, ctx, depth)
  const fillColor = firstSolidFillColor(frame.fills)
  const stroke = firstStroke(frame.strokes)

  if (!isAbsolute && spec?.kind !== 'grid' && spec?.kind !== 'listView') {
    const { top, right, bottom, left } = frame.layout.padding
    if (top === right && right === bottom && bottom === left && top > 0) {
      lines.push(`${pad(depth)}.padding(${formatNumber(top)})`)
    } else if (!(top === 0 && right === 0 && bottom === 0 && left === 0)) {
      lines.push(
        `${pad(depth)}.padding(EdgeInsets(top: ${formatNumber(top)}, leading: ${formatNumber(left)}, bottom: ${formatNumber(bottom)}, trailing: ${formatNumber(right)}))`,
      )
    }
  } else if (spec?.kind === 'grid' || spec?.kind === 'listView') {
    const { top, right, bottom, left } = frame.layout.padding
    if (top + right + bottom + left > 0) {
      lines.push(`${pad(depth)}.padding(EdgeInsets(top: ${formatNumber(top)}, leading: ${formatNumber(left)}, bottom: ${formatNumber(bottom)}, trailing: ${formatNumber(right)}))`)
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
  if (spec !== undefined && frame.clipsContent) lines.push(`${pad(depth)}.clipped()`)
  if (spec?.kind === 'card' && spec.elevation > 0) {
    lines.push(`${pad(depth)}.shadow(color: Color.black.opacity(0.2), radius: ${formatNumber(spec.elevation * 1.5)}, x: 0, y: ${formatNumber(spec.elevation / 2)})`)
  }
  if (spec?.kind === 'drawer') lines.push(`${pad(depth)}.shadow(radius: 8)`)
  for (const mod of extraMods) lines.push(`${pad(depth)}${mod}`)

  return lines
}

// Interactions d'un noeud : un clic (sauf pour les composants qui gerent
// eux-memes leur bouton) et un appui long deviennent des gestes.
function linkMods(node: Node, ctx: RenderContext, selfLinking = false): string[] {
  const acts = swActs(node, ctx)
  const mods: string[] = []
  if (acts.tap !== null && !selfLinking) mods.push(`.onTapGesture { ${acts.tap} }`)
  if (acts.longPress !== null) mods.push(`.simultaneousGesture(LongPressGesture().onEnded { _ in ${acts.longPress} })`)
  return mods
}

const SELF_LINKING = new Set(['button', 'iconButton', 'fab', 'chip', 'listTile'])

function renderNode(node: Node, ctx: RenderContext, depth: number, extraMods: string[], inFlow = false): string[] | null {
  if (!node.visible) return null
  // Une overlay ouverte par une interaction est un gabarit : rendue a la demande.
  if (ctx.plan.overlays.has(node.id) && ctx.allowOverlay !== node.id) return null
  void inFlow

  if (node.type === 'component') {
    const lines = renderSwiftComponent(node, { ctx: envOf(ctx) }, depth)
    if (lines.length === 0) return lines
    const mods = [...extraMods]
    if (node.opacity < 1) mods.push(`.opacity(${formatNumber(node.opacity)})`)
    if (node.rotation !== 0) mods.push(`.rotationEffect(.degrees(${formatNumber(node.rotation)}))`)
    mods.push(...linkMods(node, ctx, SELF_LINKING.has(node.kind)))
    for (const mod of mods) lines.push(`${pad(depth + 1)}${mod}`)
    return lines
  }

  if (!PREVIEW_SUPPORTED_NODE_TYPES.has(node.type)) {
    ctx.warnings.push(unsupportedNodeWarning(node.type, EXPORTER_ID))
    return null
  }

  // Important 1 : contrairement a Flutter et React Native, ce generateur
  // `preview` n'implemente ni `.opacity()` ni `.rotationEffect()` -- jamais
  // perdu en silence, meme si le type de noeud lui-meme est couvert.
  if (node.opacity < 1) ctx.warnings.push(unsupportedPropertyWarning('opacity', node.id, EXPORTER_ID))
  if (node.rotation !== 0) ctx.warnings.push(unsupportedPropertyWarning('rotation', node.id, EXPORTER_ID))

  const mods = [...extraMods, ...linkMods(node, ctx)]
  switch (node.type) {
    case 'frame':
      return renderFrame(node, ctx, depth, mods)
    case 'text':
      return renderText(node, ctx, depth, mods)
    case 'rect':
      return renderRect(node, ctx, depth, mods)
    case 'ellipse':
      return renderEllipse(node, ctx, depth, mods)
    case 'image':
      return renderImage(node, ctx, depth, mods)
    default:
      return null
  }
}

function newContext(tokens: DesignTokens, warnings: string[], plan: ExportPlan, custom = false): RenderContext {
  return { tokens, warnings, plan, states: [], presentations: [], usesNavigator: false, counter: 0, custom, overlayUses: new Map(), usesOverlay: false, usesOpenUrl: false }
}

function renderPage(page: Page, tokens: DesignTokens, warnings: string[], structName: string, plan: ExportPlan): ExportedFile {
  const ctx = newContext(tokens, warnings, plan)

  const topLevel = page.nodes
    .map((n) => renderNode(n, ctx, 2, []))
    .filter((l): l is string[] => l !== null)

  const bodyLines =
    topLevel.length === 1
      ? topLevel[0]!
      : ['        VStack {', ...topLevel.flat(), '        }']

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

// Un ecran SwiftUI : le contenu dans un ZStack plein ecran, la barre
// d'application en `navigationTitle` + `toolbar` (le NavigationStack est
// pose par App.swift), la barre de navigation basse en TabView, le tiroir en
// superposition, les dialogues et feuilles en presentations natives.
function renderScreen(screen: FrameNode, tokens: DesignTokens, warnings: string[], structName: string, plan: ExportPlan, custom: boolean): ExportedFile {
  const ctx = newContext(tokens, warnings, plan, custom)
  const parts: ScreenParts = splitScreen(screen)
  const fill = firstSolidFillColor(screen.fills)

  // Dialogues et feuilles : rendus (donc enregistres) avant le reste, hors du
  // corps, sans position.
  const body: string[] = []
  // Le bouton flottant reste un enfant du corps (le dernier : au-dessus).
  const bodyChildren = [...parts.body.filter((n) => !(n.type === 'component' && n.kind === 'dialog')), ...(parts.fab ? [parts.fab] : [])]
  const dialogs = parts.body.filter((n) => n.type === 'component' && n.kind === 'dialog')
  for (const dialog of dialogs) renderNode(dialog, ctx, 0, [])
  body.push(...stackBlock(screen, ctx, 2, bodyChildren, parts.topInset))
  body.push(`${pad(2)}.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)`)
  if (fill) body.push(`${pad(2)}.background(${swiftColorExpr(fill, tokens)}.ignoresSafeArea())${colorTokenComment(fill, tokens)}`)

  // Barre d'application -> barre de navigation native.
  if (parts.appBar) {
    const bar = parts.appBar.props
    body.push(`${pad(2)}.navigationTitle(${swiftString(bar.title)})`)
    body.push(`${pad(2)}#if os(iOS)`, `${pad(2)}.navigationBarTitleDisplayMode(${bar.centerTitle ? '.inline' : '.large'})`, `${pad(2)}#endif`)
    if (bar.leading === 'none' || ctx.custom) body.push(`${pad(2)}.navigationBarBackButtonHidden(true)`)
    if (bar.color) {
      body.push(`${pad(2)}.toolbarBackground(${swiftColorExpr(bar.color, tokens)}, for: .automatic)`, `${pad(2)}.toolbarBackground(.visible, for: .automatic)`)
    }
    const items: string[] = []
    if (bar.leading === 'back' && ctx.custom) {
      // Pile maison : pas de bouton retour natif, on le fournit.
      ctx.usesNavigator = true
      items.push(`${pad(4)}ToolbarItem(placement: .navigation) {`, `${pad(5)}Button { navigator.back() } label: { Image(systemName: ${swiftString(ICONS.arrowBack.sfSymbol)}) }`, `${pad(4)}}`)
    } else if (bar.leading === 'menu' && parts.drawer !== null) {
      ctx.states.push('@State private var showDrawer = false')
      items.push(`${pad(4)}ToolbarItem(placement: .navigation) {`, `${pad(5)}Button { showDrawer.toggle() } label: { Image(systemName: ${swiftString(ICONS.menu.sfSymbol)}) }`, `${pad(4)}}`)
    } else if (bar.leading === 'menu') {
      items.push(`${pad(4)}ToolbarItem(placement: .navigation) {`, `${pad(5)}Button {} label: { Image(systemName: ${swiftString(ICONS.menu.sfSymbol)}) }`, `${pad(4)}}`)
    }
    for (const action of bar.actions) {
      items.push(`${pad(4)}ToolbarItem(placement: .primaryAction) {`, `${pad(5)}Button {} label: { Image(systemName: ${swiftString(ICONS[action].sfSymbol)}) }`, `${pad(4)}}`)
    }
    if (items.length > 0) body.push(`${pad(2)}.toolbar {`, ...items.map((l) => l), `${pad(2)}}`)
  }

  // Barre de navigation basse -> TabView natif, ancre au bas de l'ecran.
  if (parts.bottomNav) {
    const nav = renderNode(parts.bottomNav, ctx, 4, [])!
    body.push(`${pad(2)}.safeAreaInset(edge: .bottom, spacing: 0) {`, ...nav, `${pad(2)}}`)
  }

  // Tiroir -> superposition a gauche, ouverte par le bouton menu.
  if (parts.drawer) {
    if (!ctx.states.includes('@State private var showDrawer = false')) ctx.states.push('@State private var showDrawer = false')
    const panel = renderFrame(parts.drawer, ctx, 4, [])
    body.push(
      `${pad(2)}.overlay(alignment: .leading) {`,
      `${pad(3)}if showDrawer {`,
      `${pad(4)}ZStack(alignment: .leading) {`,
      `${pad(5)}Color.black.opacity(0.3)`,
      `${pad(6)}.ignoresSafeArea()`,
      `${pad(6)}.onTapGesture { showDrawer = false }`,
      ...panel.map((l) => pad(1) + l),
      `${pad(4)}}`,
      `${pad(3)}}`,
      `${pad(2)}}`,
    )
  }

  // « Apres un delai » : une tache lancee a l'affichage (annulee a la sortie).
  const delay = screen.interactions?.find((i) => i.trigger.type === 'afterDelay')
  const delayAction = interactionFor(screen, plan, 'afterDelay')
  if (delay !== undefined && delay.trigger.type === 'afterDelay' && delayAction !== null) {
    const expr = swAction(delayAction, ctx)
    body.push(`${pad(2)}.task {`, `${pad(3)}try? await Task.sleep(nanoseconds: ${delay.trigger.ms * 1_000_000})`, `${pad(3)}${expr}`, `${pad(2)}}`)
  }

  // Overlays ouvertes par une interaction : dialogue -> .alert, feuille basse
  // -> .sheet, snackbar -> superposition, tous lies a l'etat `overlay`.
  body.push(...renderOverlays(ctx, tokens, 2))

  for (const presentation of ctx.presentations) body.push(...presentation.map((l) => `${pad(2)}${l}`))

  const declarations: string[] = []
  if (ctx.usesNavigator) declarations.push('    @EnvironmentObject private var navigator: Navigator')
  if (ctx.usesOpenUrl) declarations.push('    @Environment(\\.openURL) private var openURL')
  if (ctx.usesOverlay) declarations.push('    @State private var overlay: String? = nil')
  for (const state of ctx.states) declarations.push(`    ${state}`)

  const lines = [
    'import SwiftUI',
    '',
    `struct ${structName}: View {`,
    ...declarations,
    ...(declarations.length > 0 ? [''] : []),
    '    var body: some View {',
    ...body,
    '    }',
    '}',
    '',
  ]
  return { path: `Sources/Screens/${structName}.swift`, contents: lines.join('\n') }
}

// Etat `overlay` : `Binding<Bool>` vrai quand l'overlay `name` est ouverte.
const overlayBinding = (name: string): string => `Binding(get: { overlay == ${swiftString(name)} }, set: { if !$0 { overlay = nil } })`

function renderOverlays(ctx: RenderContext, tokens: DesignTokens, depth: number): string[] {
  const out: string[] = []
  const done = new Set<string>()
  for (let guard = 0; guard < 50; guard += 1) {
    const use = [...ctx.overlayUses.values()].find((u) => !done.has(u.ref.id))
    if (use === undefined) break
    done.add(use.ref.id)
    const node = use.ref.node
    if (use.ref.kind === 'snackbar' && node.type === 'component') {
      const snack = renderSwiftComponent(node, { ctx: envOf(ctx) }, depth + 2)
      out.push(
        `${pad(depth)}.overlay(alignment: .bottom) {`,
        `${pad(depth + 1)}if overlay == ${swiftString(use.ref.name)} {`,
        ...snack,
        `${pad(depth + 2)}.padding(.bottom, 24)`,
        `${pad(depth + 2)}.transition(.move(edge: .bottom).combined(with: .opacity))`,
        `${pad(depth + 2)}.task {`,
        `${pad(depth + 3)}try? await Task.sleep(nanoseconds: 3_000_000_000)`,
        `${pad(depth + 3)}overlay = nil`,
        `${pad(depth + 2)}}`,
        `${pad(depth + 1)}}`,
        `${pad(depth)}}`,
        `${pad(depth)}.animation(.easeInOut(duration: ${(use.transition.type === 'none' ? 0 : use.transition.durationMs) / 1000}), value: overlay)`,
      )
      continue
    }
    // Dialogue / feuille basse : le rendu natif existant, relie a l'etat `overlay`.
    const scratch: RenderContext = { ...ctx, states: [], presentations: [], allowOverlay: node.id }
    renderNode(node, scratch, 0, [])
    ctx.counter = scratch.counter
    ctx.usesNavigator = ctx.usesNavigator || scratch.usesNavigator
    ctx.usesOverlay = true
    ctx.usesOpenUrl = ctx.usesOpenUrl || scratch.usesOpenUrl
    for (const presentation of scratch.presentations) {
      const rebound = presentation.map((l) => l.replace(/isPresented: \$\w+/, `isPresented: ${overlayBinding(use.ref.name)}`))
      out.push(...rebound.map((l) => `${pad(depth)}${l}`))
    }
  }
  void tokens
  return out
}

// Detecte si une navigation du design n'est pas la poussee native : la pile
// de navigation maison (transitions) est alors necessaire.
function needsCustomNavigation(plan: ExportPlan): boolean {
  let custom = false
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      for (const i of n.interactions ?? []) if (i.action.type === 'navigate' && !isNativeTransition(i.transition)) custom = true
      if (n.type === 'frame') visit(n.children)
    }
  }
  for (const u of plan.units) visit(u.kind === 'screen' ? [u.screen] : u.page.nodes)
  return custom
}

// Routes de navigation : un cas d'enum par ecran, un Navigator partage (pile
// de la NavigationStack) injecte comme EnvironmentObject.
// Pile de navigation maison : chaque ecran a la transition de son arrivee
// (AppTransition), le retour la rejoue a l'envers.
function generateCustomNavigation(plan: ExportPlan): ExportedFile {
  const lines = [
    'import SwiftUI',
    '',
    'enum Route: Hashable {',
    ...plan.screens.map((s) => `    case ${routeCase(s)}`),
    '}',
    '',
    ...APP_TRANSITION_SWIFT,
    '',
    '// Pile de navigation partagee : `go` empile un ecran avec sa transition,',
    "// `switchTo` change d'onglet (l'ecran de depart est la racine), `back` depile.",
    'final class Navigator: ObservableObject {',
    '    struct Entry: Identifiable {',
    '        let id = UUID()',
    '        let route: Route',
    '        let transition: AppTransition',
    '    }',
    '',
    '    @Published private(set) var stack: [Entry]',
    `    let root: Route = .${routeCase(plan.initial!)}`,
    '',
    '    init() {',
    '        stack = [Entry(route: root, transition: .none)]',
    '    }',
    '',
    '    func go(_ route: Route, _ transition: AppTransition = .push) {',
    '        withAnimation(transition.animation) {',
    '            stack.append(Entry(route: route, transition: transition))',
    '        }',
    '    }',
    '',
    '    func switchTo(_ route: Route) {',
    '        let fade = AppTransition.fade(duration: 0.15, curve: .linear)',
    '        withAnimation(fade.animation) {',
    '            let base = Entry(route: root, transition: .none)',
    '            stack = route == root ? [base] : [base, Entry(route: route, transition: fade)]',
    '        }',
    '    }',
    '',
    '    func back() {',
    '        guard let last = stack.last, stack.count > 1 else { return }',
    '        withAnimation(last.transition.animation) {',
    '            stack = Array(stack.dropLast())',
    '        }',
    '    }',
    '}',
    '',
  ]
  return { path: 'Sources/Navigation.swift', contents: lines.join('\n') }
}

function generateCustomApp(plan: ExportPlan, appName: string): ExportedFile {
  const lines = [
    'import SwiftUI',
    '',
    '@main',
    `struct ${appName}: App {`,
    '    @StateObject private var navigator = Navigator()',
    '',
    '    var body: some Scene {',
    '        WindowGroup {',
    '            RootView()',
    '                .environmentObject(navigator)',
    '        }',
    '    }',
    '}',
    '',
    '// Empile les ecrans de la pile maison : chacun arrive avec sa transition.',
    'struct RootView: View {',
    '    @EnvironmentObject private var navigator: Navigator',
    '',
    '    var body: some View {',
    '        ZStack {',
    '            ForEach(Array(navigator.stack.enumerated()), id: \\.element.id) { index, entry in',
    '                NavigationStack {',
    '                    destination(entry.route)',
    '                }',
    '                .transition(entry.transition.transition)',
    '                .zIndex(Double(index))',
    '            }',
    '        }',
    '    }',
    '',
    '    @ViewBuilder',
    '    private func destination(_ route: Route) -> some View {',
    '        switch route {',
    ...plan.screens.flatMap((s) => [`        case .${routeCase(s)}:`, `            ${s.pascal}()`]),
    '        }',
    '    }',
    '}',
    '',
  ]
  return { path: 'Sources/App.swift', contents: lines.join('\n') }
}

function generateNavigation(plan: ExportPlan, custom: boolean): ExportedFile {
  if (custom) return generateCustomNavigation(plan)
  const lines = [
    'import SwiftUI',
    '',
    'enum Route: Hashable {',
    ...plan.screens.map((s) => `    case ${routeCase(s)}`),
    '}',
    '',
    '// Pile de navigation partagee : `go` empile un ecran, `switchTo` change',
    "// d'onglet (l'ecran de depart est la racine de la pile), `back` depile.",
    'final class Navigator: ObservableObject {',
    '    @Published var path: [Route] = []',
    `    let root: Route = .${routeCase(plan.initial!)}`,
    '',
    '    func go(_ route: Route) {',
    '        path.append(route)',
    '    }',
    '',
    '    func switchTo(_ route: Route) {',
    '        path = route == root ? [] : [route]',
    '    }',
    '',
    '    func back() {',
    '        if !path.isEmpty { path.removeLast() }',
    '    }',
    '}',
    '',
  ]
  return { path: 'Sources/Navigation.swift', contents: lines.join('\n') }
}

function generateApp(plan: ExportPlan, projectName: string, custom: boolean): ExportedFile {
  const appName = `${toPascalCase(projectName)}App`
  if (custom) return generateCustomApp(plan, appName)
  const lines = [
    'import SwiftUI',
    '',
    '@main',
    `struct ${appName}: App {`,
    '    @StateObject private var navigator = Navigator()',
    '',
    '    var body: some Scene {',
    '        WindowGroup {',
    '            NavigationStack(path: $navigator.path) {',
    `                ${plan.initial!.pascal}()`,
    '                    .navigationDestination(for: Route.self) { route in',
    '                        switch route {',
    ...plan.screens.flatMap((s) => [`                        case .${routeCase(s)}:`, `                            ${s.pascal}()`]),
    '                        }',
    '                    }',
    '            }',
    '            .environmentObject(navigator)',
    '        }',
    '    }',
    '}',
    '',
  ]
  return { path: 'Sources/App.swift', contents: lines.join('\n') }
}

const stemOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '')

// Catalogue d'assets (Image("nom")) : un `.imageset` par image.
const SWIFT_ASSETS: AssetTarget = {
  fileName: (stem, ext) => `${stem}${ext}`,
  uniqueKey: (fileName) => stemOf(fileName).toLowerCase(),
  path: (fileName) => `Sources/Assets.xcassets/${stemOf(fileName)}.imageset/${fileName}`,
  reference: (fileName) => stemOf(fileName),
  extra: (fileName) => [
    {
      path: `Sources/Assets.xcassets/${stemOf(fileName)}.imageset/Contents.json`,
      contents: JSON.stringify({ images: [{ filename: fileName, idiom: 'universal' }], info: { author: 'calque', version: 1 } }, null, 2) + '\n',
    },
  ],
}

function exportSwiftUI(source: CalqueDocument, opts: ExportOptions): ExportResult {
  const assetPlan = planAssets(source, SWIFT_ASSETS)
  const doc = assetPlan.doc
  const warnings: string[] = [...assetPlan.warnings]
  const files: ExportedFile[] = []
  const plan = planExport(doc, opts.activeScreenId)
  const custom = needsCustomNavigation(plan)

  for (const unit of plan.units) {
    if (unit.kind === 'page') {
      files.push(renderPage(layoutPage(unit.page), doc.tokens, warnings, unit.names.pascal, plan))
      continue
    }
    const laidOut = layoutPage({ ...unit.page, nodes: [unit.screen] }).nodes[0] as FrameNode
    files.push(renderScreen(laidOut, doc.tokens, warnings, unit.ref.pascal, plan, custom))
  }

  if (plan.initial !== null) files.push(generateNavigation(plan, custom), generateApp(plan, opts.projectName, custom))
  if (assetPlan.assets.length > 0) {
    files.push(
      { path: 'Sources/Assets.xcassets/Contents.json', contents: JSON.stringify({ info: { author: 'calque', version: 1 } }, null, 2) + '\n' },
      ...assetPlan.extraFiles,
    )
  }

  return { files, warnings, assets: assetPlan.assets }
}

export const swiftuiExporter: Exporter = {
  id: 'swiftui',
  label: 'SwiftUI',
  maturity: 'preview',
  export: exportSwiftUI,
}
