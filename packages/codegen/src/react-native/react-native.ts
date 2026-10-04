// Generateur React Native (Tache 8) : traduit un MaquioDocument en un
// composant fonctionnel par page (sous src/screens/), styles regroupes en
// fin de fichier dans un seul StyleSheet.create, plus src/theme.ts pour
// les tokens. Correspondances (decision 1 du brief) :
//   - frame -> <View> avec style
//   - frame `absolute` -> position: 'absolute' sur les enfants directs,
//     avec left/top/width/height
//   - frame `row`/`column` -> flexDirection + gap + padding +
//     justifyContent/alignItems (proprietes flexbox natives de React
//     Native : pas besoin d'espaceurs manuels comme le SizedBox de
//     Flutter)
//   - text -> <Text>
//   - image -> <Image source={{ uri }} /> (URL) ou source={require(...)}
//     (chemin relatif)
//   - ellipse -> <View> avec borderRadius = moitie du plus petit cote
//   - line -> <View> d'un pixel d'epaisseur
//   - opacity < 1 -> propriete `opacity` du style ; rotation !== 0 ->
//     `transform: [{ rotate: 'NNdeg' }]` (React Native accepte les degres
//     directement, pas de conversion en radians) ; visible: false -> le
//     noeud n'est pas emis.
//
// Deterministe (comme Flutter) : aucun horodatage, aucun identifiant
// aleatoire, seuls des tableaux et des objets a cles chaine sont parcourus.
import type {
  MaquioDocument,
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
} from '@maquio/core'
import { layoutPage } from '@maquio/core'
import { formatNumber } from '../shared/format-number'
import { createUniqueIdentifierNamer } from '../shared/identifier'
import { planAssets } from '../shared/assets'
import type { AssetTarget } from '../shared/assets'
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { planExport, splitScreen } from '../shared/screens'
import { interactionFor, isNativeTransition } from '../shared/interactions'
import type { RInteraction } from '../shared/interactions'
import { OVERLAY_STATE, TRANSITIONS_TS, easingWarning, modalAnimation, transitionParams } from './interactions'
import type { OverlayUse } from './interactions'
import { M3 } from './components'
import type { ExportPlan, ScreenParts } from '../shared/screens'
import { renderRnComponent } from './components'
import type { RnCtx, RnEnv } from './components'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { alignItemsExpr, colorExpr as colorExprBase, fontWeightExpr, jsString, justifyContentExpr } from './rn-utils'
import { generateThemeFile } from './theme'

type StyleProp = [key: string, value: string]
type StyleEntry = { key: string; props: StyleProp[] }

type RenderContext = {
  tokens: DesignTokens
  warnings: string[]
  styles: StyleEntry[]
  usedComponents: Set<string>
  usedTheme: boolean
  // Imports et hooks ajoutes par les composants (icones, curseur, etat d'un
  // dialogue...), dedupliques.
  extraImports: Set<string>
  hooks: string[]
  plan: ExportPlan
  // Etat local du tiroir de l'ecran (`setDrawerOpen`), ou null.
  openDrawer: string | null
  usesNavigationParam: boolean
  // Overlays (dialogue, feuille basse, snackbar) ouvertes par une interaction de cet ecran.
  overlayUses: Map<string, OverlayUse>
  // Etat partage de l'export (transitions personnalisees utilisees...).
  shared: { usesTransitions: boolean }
  // Correction Critical 1 : une seule instance par page, partagee par tous
  // les noeuds ET par la cle de repli 'root' du multi-racine (voir plus
  // bas) -- c'est ce qui garantit l'unicite des cles de style meme quand
  // deux ids Figma distincts se normalisent en la meme chaine, ou quand un
  // noeud a pour id ce qui normaliserait justement en 'root'.
  styleKey: (nodeId: string) => string
}

// `theme.colors.<nom>` quand la couleur correspond exactement a un token
// (decision 9 du brief), sinon le litteral hexadecimal `#rrggbbaa`. Relais
// vers rn-utils.ts (seule definition de la regle de correspondance) qui se
// contente de noter, via `ctx.usedTheme`, qu'un import de `theme` sera
// necessaire dans le fichier genere.
function colorExpr(color: Color, ctx: RenderContext): string {
  return colorExprBase(color, ctx.tokens, () => {
    ctx.usedTheme = true
  })
}

// Proprietes de decoration communes a rect/ellipse/frame : couleur de
// remplissage, rayon d'angle et bordure, seulement celles qui s'ecartent
// de leur valeur par defaut (jamais une decoration vide).
function decorationProps(
  fills: Fill[],
  strokes: Stroke[],
  cornerRadius: number | null,
  ctx: RenderContext,
): StyleProp[] {
  const props: StyleProp[] = []
  const fillColor = firstSolidFillColor(fills)
  const stroke = firstStroke(strokes)

  if (fillColor) props.push(['backgroundColor', colorExpr(fillColor, ctx)])
  if (cornerRadius !== null && cornerRadius > 0) props.push(['borderRadius', formatNumber(cornerRadius)])
  if (stroke) {
    props.push(['borderWidth', formatNumber(stroke.width)])
    props.push(['borderColor', colorExpr(stroke.color, ctx)])
  }
  return props
}

function paddingProps(padding: { top: number; right: number; bottom: number; left: number }): StyleProp[] {
  const { top, right, bottom, left } = padding
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return []
  if (top === right && right === bottom && bottom === left) return [['padding', formatNumber(top)]]
  return [
    ['paddingTop', formatNumber(top)],
    ['paddingRight', formatNumber(right)],
    ['paddingBottom', formatNumber(bottom)],
    ['paddingLeft', formatNumber(left)],
  ]
}

function buildRectStyle(node: RectNode, ctx: RenderContext): StyleProp[] {
  return [
    ['width', formatNumber(node.frame.w)],
    ['height', formatNumber(node.frame.h)],
    ...decorationProps(node.fills, node.strokes, node.cornerRadius, ctx),
  ]
}

function buildEllipseStyle(node: EllipseNode, ctx: RenderContext): StyleProp[] {
  const radius = Math.min(node.frame.w, node.frame.h) / 2
  return [
    ['width', formatNumber(node.frame.w)],
    ['height', formatNumber(node.frame.h)],
    ...decorationProps(node.fills, node.strokes, radius, ctx),
  ]
}

// Un pixel d'epaisseur, dans le sens perpendiculaire a la plus grande
// dimension de la frame (meme regle que Flutter) : une ligne large et
// basse est horizontale (hauteur figee a 1), une ligne haute et etroite
// est verticale (largeur figee a 1).
function buildLineStyle(node: LineNode, ctx: RenderContext): StyleProp[] {
  const horizontal = node.frame.w >= node.frame.h
  return [
    ['width', horizontal ? formatNumber(node.frame.w) : '1'],
    ['height', horizontal ? '1' : formatNumber(node.frame.h)],
    ['backgroundColor', colorExpr(node.stroke.color, ctx)],
  ]
}

function buildImageStyle(node: ImageNode): StyleProp[] {
  return [
    ['width', formatNumber(node.frame.w)],
    ['height', formatNumber(node.frame.h)],
  ]
}

function buildTextStyle(node: TextNode, ctx: RenderContext): StyleProp[] {
  const props: StyleProp[] = [
    ['fontFamily', jsString(node.style.fontFamily)],
    ['fontSize', formatNumber(node.style.fontSize)],
    ['fontWeight', fontWeightExpr(node.style.fontWeight)],
  ]
  if (node.style.lineHeight > 0) props.push(['lineHeight', formatNumber(node.style.lineHeight)])
  if (node.style.letterSpacing !== 0) props.push(['letterSpacing', formatNumber(node.style.letterSpacing)])
  props.push(['color', colorExpr(node.style.color, ctx)])
  props.push(['textAlign', jsString(node.style.align)])
  return props
}

// Boite d'une frame : taille, remplissage, contour, rayon, decoupe.
function buildFrameBox(frame: FrameNode, ctx: RenderContext): StyleProp[] {
  const props: StyleProp[] = [
    ['width', formatNumber(frame.frame.w)],
    ['height', formatNumber(frame.frame.h)],
    ...decorationProps(frame.fills, frame.strokes, frame.cornerRadius, ctx),
  ]

  // Important 2 (round de correction finale) : `overflow: 'hidden'` est
  // l'equivalent natif React Native de `clipsContent`, trivial a honorer
  // ici (contrairement a SwiftUI/Compose, restes en apercu) -- jamais de
  // decoupe silencieusement perdue pour une cible qui sait le faire.
  if (frame.clipsContent) props.push(['overflow', jsString('hidden')])
  return props
}

// Disposition flexbox d'une frame `row`/`column` (rien en mode absolu).
function buildFrameLayout(frame: FrameNode): StyleProp[] {
  const props: StyleProp[] = []
  if (frame.layout.mode !== 'absolute') {
    const isRow = frame.layout.mode === 'row'
    props.push(['flexDirection', jsString(isRow ? 'row' : 'column')])
    if (frame.layout.gap > 0 && frame.layout.alignMain !== 'space-between') {
      props.push(['gap', formatNumber(frame.layout.gap)])
    }
    props.push(...paddingProps(frame.layout.padding))
    props.push(['justifyContent', justifyContentExpr(frame.layout.alignMain)])
    props.push(['alignItems', alignItemsExpr(frame.layout.alignCross)])
  }
  return props
}

function buildFrameStyle(frame: FrameNode, ctx: RenderContext): StyleProp[] {
  return [...buildFrameBox(frame, ctx), ...buildFrameLayout(frame)]
}

function resizeModeExpr(fit: 'cover' | 'contain' | 'fill'): string {
  if (fit === 'cover') return 'cover'
  if (fit === 'contain') return 'contain'
  return 'stretch'
}

const SHADOW_COLOR = "'#000000'"

function elevationProps(elevation: number): StyleProp[] {
  if (elevation <= 0) return []
  return [
    ['shadowColor', SHADOW_COLOR],
    ['shadowOpacity', '0.2'],
    ['shadowRadius', formatNumber(elevation * 1.5)],
    ['shadowOffset', `{ width: 0, height: ${formatNumber(elevation / 2)} }`],
    ['elevation', formatNumber(elevation)],
  ]
}

function withNodeEffects(node: Node, props: StyleProp[], absolutePos: { x: number; y: number } | null): StyleProp[] {
  let out = props
  if (absolutePos) {
    out = [['position', jsString('absolute')], ['left', formatNumber(absolutePos.x)], ['top', formatNumber(absolutePos.y)], ...out]
  }
  if (node.opacity < 1) out = [...out, ['opacity', formatNumber(node.opacity)]]
  if (node.rotation !== 0) out = [...out, ['transform', `[{ rotate: '${formatNumber(node.rotation)}deg' }]`]]
  return out
}

// Expression JS d'une interaction (corps d'un gestionnaire).
function rnAction(ri: RInteraction, ctx: RenderContext): string {
  const a = ri.action
  switch (a.type) {
    case 'navigate': {
      ctx.usesNavigationParam = true
      if (isNativeTransition(ri.transition)) return `navigation.navigate(${jsString(a.screen.pascal)})`
      ctx.shared.usesTransitions = true
      const t = ri.transition
      if (t.type !== 'none' && t.easing !== 'easeInOut') {
        const w = easingWarning(t.easing)
        if (!ctx.warnings.includes(w)) ctx.warnings.push(w)
      }
      return `navigation.navigate(${jsString(a.screen.pascal)}, ${transitionParams(t)})`
    }
    case 'back':
      ctx.usesNavigationParam = true
      return 'navigation.goBack()'
    case 'closeOverlay':
      return 'setOverlay(null)'
    case 'openOverlay': {
      ctx.overlayUses.set(a.overlay.id, { ref: a.overlay, transition: ri.transition })
      ctx.extraImports.add("import { useState } from 'react';")
      if (!ctx.hooks.includes(OVERLAY_STATE)) ctx.hooks.unshift(OVERLAY_STATE)
      return `setOverlay(${jsString(a.overlay.name)})`
    }
    case 'openUrl':
      ctx.usedComponents.add('Linking')
      return `Linking.openURL(${jsString(a.url)})`
  }
}

// Attributs JSX ` onPress={() => ...} onLongPress={() => ...}` d'un noeud, ou ''.
function pressAttrs(node: Node, ctx: RenderContext): string {
  const tap = interactionFor(node, ctx.plan, 'tap')
  const long = interactionFor(node, ctx.plan, 'longPress')
  return `${tap === null ? '' : ` onPress={() => ${rnAction(tap, ctx)}}`}${long === null ? '' : ` onLongPress={() => ${rnAction(long, ctx)}}`}`
}

// Conteneur semantique d'une frame : le composant natif correspondant.
function renderContainer(
  frame: FrameNode,
  ctx: RenderContext,
  depth: number,
  absolutePos: { x: number; y: number } | null,
): string[] {
  const spec = frame.container!
  const pad = '  '.repeat(depth)
  const at = (d: number) => '  '.repeat(depth + d)
  const key = ctx.styleKey(frame.id)
  const onPress = pressAttrs(frame, ctx)
  const link = onPress === '' ? null : onPress
  const push = (k: string, props: StyleProp[]) => ctx.styles.push({ key: k, props })
  const isAbsolute = frame.layout.mode === 'absolute'
  const flow = (children: Node[], d: number, interleave: string[] | null = null): string[] => {
    const lines: string[] = []
    children.forEach((child, i) => {
      if (interleave !== null && i > 0) lines.push(...interleave.map((l) => at(d) + l))
      const rendered = renderNode(child, ctx, depth + d, null, true)
      if (rendered) lines.push(...rendered)
    })
    return lines
  }
  const absoluteChildren = (d: number): string[] =>
    frame.children.flatMap((child) => renderNode(child, ctx, depth + d, { x: child.frame.x, y: child.frame.y }, false) ?? [])

  switch (spec.kind) {
    case 'card':
    case 'drawer':
    case 'bottomSheet': {
      ctx.usedComponents.add(link === null ? 'View' : 'Pressable')
      const tag = link === null ? 'View' : 'Pressable'
      let props = [...buildFrameBox(frame, ctx), ...buildFrameLayout(frame)]
      if (spec.kind === 'card') props = [...props, ...elevationProps(spec.elevation)]
      if (spec.kind === 'drawer') props = [...props, ...elevationProps(8)]
      if (spec.kind === 'bottomSheet') {
        props = props.filter(([k]) => k !== 'borderRadius')
        props.push(['borderTopLeftRadius', formatNumber(frame.cornerRadius)], ['borderTopRightRadius', formatNumber(frame.cornerRadius)], ...elevationProps(8))
      }
      push(key, withNodeEffects(frame, props, absolutePos))
      const lines = [`${pad}<${tag} style={styles.${key}}${onPress}>`]
      if (spec.kind === 'bottomSheet' && spec.handle) {
        ctx.usedComponents.add('View')
        const handleKey = ctx.styleKey(`${frame.id}-handle`)
        push(handleKey, [['alignSelf', jsString('center')], ['width', '32'], ['height', '4'], ['borderRadius', '2'], ['backgroundColor', jsString('#cac4d0')], ['marginBottom', '8']])
        lines.push(`${at(1)}<View style={styles.${handleKey}} />`)
      }
      lines.push(...(isAbsolute ? absoluteChildren(1) : flow(frame.children, 1)), `${pad}</${tag}>`)
      return lines
    }
    case 'listView': {
      ctx.usedComponents.add('ScrollView')
      const horizontal = spec.axis === 'horizontal'
      push(key, withNodeEffects(frame, buildFrameBox(frame, ctx), absolutePos))
      const contentKey = ctx.styleKey(`${frame.id}-content`)
      push(contentKey, buildFrameLayout(frame))
      let separator: string[] | null = null
      if (spec.dividers) {
        ctx.usedComponents.add('View')
        const sepKey = ctx.styleKey(`${frame.id}-separator`)
        push(sepKey, horizontal ? [['width', '1'], ['alignSelf', jsString('stretch')], ['backgroundColor', jsString('#cac4d0')]] : [['height', '1'], ['backgroundColor', jsString('#cac4d0')]])
        separator = [`<View style={styles.${sepKey}} />`]
      }
      return [
        `${pad}<ScrollView style={styles.${key}}${horizontal ? ' horizontal' : ''} contentContainerStyle={styles.${contentKey}}>`,
        ...flow(frame.children, 1, separator),
        `${pad}</ScrollView>`,
      ]
    }
    case 'grid': {
      ctx.usedComponents.add('View')
      push(key, withNodeEffects(frame, [...buildFrameBox(frame, ctx), ['flexDirection', jsString('row')], ['flexWrap', jsString('wrap')], ...(frame.layout.gap > 0 ? ([['gap', formatNumber(frame.layout.gap)]] as StyleProp[]) : []), ...paddingProps(frame.layout.padding)], absolutePos))
      return [`${pad}<View style={styles.${key}}>`, ...flow(frame.children, 1), `${pad}</View>`]
    }
    case 'scrollView': {
      ctx.usedComponents.add('ScrollView')
      const horizontal = spec.axis === 'horizontal'
      push(key, withNodeEffects(frame, buildFrameBox(frame, ctx), absolutePos))
      const contentKey = ctx.styleKey(`${frame.id}-content`)
      if (isAbsolute) {
        const w = Math.max(frame.frame.w, ...frame.children.map((c) => c.frame.x + c.frame.w))
        const h = Math.max(frame.frame.h, ...frame.children.map((c) => c.frame.y + c.frame.h))
        push(contentKey, [['width', formatNumber(w)], ['height', formatNumber(h)]])
      } else {
        push(contentKey, buildFrameLayout(frame))
      }
      return [
        `${pad}<ScrollView style={styles.${key}}${horizontal ? ' horizontal' : ''} contentContainerStyle={styles.${contentKey}}>`,
        ...(isAbsolute ? absoluteChildren(1) : flow(frame.children, 1)),
        `${pad}</ScrollView>`,
      ]
    }
    case 'safeArea': {
      ctx.usedComponents.add('SafeAreaView')
      push(key, withNodeEffects(frame, buildFrameStyle(frame, ctx), absolutePos))
      return [`${pad}<SafeAreaView style={styles.${key}}>`, ...(isAbsolute ? absoluteChildren(1) : flow(frame.children, 1)), `${pad}</SafeAreaView>`]
    }
  }
}

// Rend un noeud en JSX (profondeur en multiples de 2 espaces) et
// enregistre son style dans ctx.styles, dans l'ordre de premier parcours
// (parent avant enfants), pour que StyleSheet.create liste les cles
// exactement dans l'ordre de l'arbre.
function renderNode(
  node: Node,
  ctx: RenderContext,
  depth: number,
  absolutePos: { x: number; y: number } | null,
  inFlow = false,
): string[] | null {
  if (!node.visible) return null
  // Une overlay ouverte par une interaction est un gabarit : rendue a la demande, pas en place.
  if (ctx.plan.overlays.has(node.id)) return null

  if (node.type === 'component') {
    const env: RnEnv = { ctx: rnCtx(ctx), plan: ctx.plan, inFlex: inFlow, openDrawer: ctx.openDrawer, press: (n) => pressAttrs(n, ctx) }
    return renderRnComponent(node, env, depth, absolutePos)
  }
  if (node.type === 'frame' && node.container !== undefined) {
    return renderContainer(node, ctx, depth, absolutePos)
  }

  const onPress = pressAttrs(node, ctx)
  const link = onPress === '' ? null : onPress
  const viewTag = link === null ? 'View' : 'Pressable'
  let ownProps: StyleProp[]

  switch (node.type) {
    case 'rect': {
      ctx.usedComponents.add(viewTag)
      ownProps = buildRectStyle(node, ctx)
      break
    }
    case 'ellipse': {
      ctx.usedComponents.add(viewTag)
      ownProps = buildEllipseStyle(node, ctx)
      break
    }
    case 'line': {
      ctx.usedComponents.add(viewTag)
      ownProps = buildLineStyle(node, ctx)
      break
    }
    case 'text': {
      ctx.usedComponents.add('Text')
      ownProps = buildTextStyle(node, ctx)
      break
    }
    case 'image': {
      // Ecart connu ferme (README, « Écarts connus ») : un src vide
      // n'emet plus `require('')` en silence -- le noeud n'est pas rendu
      // (comme un type de noeud non supporte) et un avertissement est
      // ajoute a ctx.warnings.
      if (node.src === '') {
        ctx.warnings.push(emptyImageSourceWarning(node.id, 'react-native'))
        return null
      }
      ctx.usedComponents.add('Image')
      ownProps = buildImageStyle(node)
      break
    }
    case 'frame': {
      ctx.usedComponents.add(viewTag)
      ownProps = buildFrameStyle(node, ctx)
      break
    }
    default: {
      const unknown = node as unknown as { type: string; id: string }
      ctx.warnings.push(
        `Type de noeud non supporte par l'exportateur React Native : "${unknown.type}" (noeud ${unknown.id})`,
      )
      return null
    }
  }

  ownProps = withNodeEffects(node, ownProps, absolutePos)

  const styleKey = ctx.styleKey(node.id)
  ctx.styles.push({ key: styleKey, props: ownProps })

  const pad = '  '.repeat(depth)

  if (node.type === 'text') {
    return [`${pad}<Text style={styles.${styleKey}}${onPress}>{${jsString(node.characters)}}</Text>`]
  }

  if (node.type === 'image') {
    const source = isRemoteUrl(node.src)
      ? `{{ uri: ${jsString(node.src)} }}`
      : `{require(${jsString(/^[./]/.test(node.src) ? node.src : `./${node.src}`)})}`
    const image = `<Image style={styles.${styleKey}} source=${source} resizeMode="${resizeModeExpr(node.fit)}" />`
    if (link === null) return [`${pad}${image}`]
    // Image liee : Pressable porte l'interaction, l'image garde son style.
    ctx.usedComponents.add('Pressable')
    return [`${pad}<Pressable${onPress}>`, `${pad}  ${image}`, `${pad}</Pressable>`]
  }

  if (node.type === 'frame') {
    const childLines = renderFrameChildren(node, ctx, depth + 1)
    if (childLines.length === 0) return [`${pad}<${viewTag} style={styles.${styleKey}}${onPress} />`]
    return [`${pad}<${viewTag} style={styles.${styleKey}}${onPress}>`, ...childLines, `${pad}</${viewTag}>`]
  }

  // rect, ellipse, line : toujours une View sans enfant.
  return [`${pad}<${viewTag} style={styles.${styleKey}}${onPress} />`]
}

function renderFrameChildren(frame: FrameNode, ctx: RenderContext, depth: number): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const lines: string[] = []
  for (const child of frame.children) {
    const pos = isAbsolute ? { x: child.frame.x, y: child.frame.y } : null
    const rendered = renderNode(child, ctx, depth, pos, !isAbsolute)
    if (rendered) lines.push(...rendered)
  }
  return lines
}

function rnCtx(ctx: RenderContext): RnCtx {
  return {
    tokens: ctx.tokens,
    warnings: ctx.warnings,
    styles: ctx.styles,
    styleKey: ctx.styleKey,
    use: (name) => {
      // Les icones et les modules communautaires s'importent par leur propre ligne.
      if (name !== 'MaterialIcons') ctx.usedComponents.add(name)
    },
    addImport: (line) => ctx.extraImports.add(line),
    addHook: (line) => {
      if (!ctx.hooks.includes(line)) ctx.hooks.push(line)
    },
    colorExpr: (color) => colorExpr(color, ctx),
    markNavigation: () => {
      ctx.usesNavigationParam = true
    },
  }
}

function formatStyleEntry(entry: StyleEntry): string[] {
  const lines = [`  ${entry.key}: {`]
  for (const [key, value] of entry.props) lines.push(`    ${key}: ${value},`)
  lines.push('  },')
  return lines
}

function renderStylesBlock(ctx: RenderContext): string[] {
  const lines = ['const styles = StyleSheet.create({']
  for (const entry of ctx.styles) lines.push(...formatStyleEntry(entry))
  lines.push('});')
  return lines
}

function newContext(tokens: DesignTokens, warnings: string[], plan: ExportPlan, shared: RenderContext['shared']): RenderContext {
  return {
    tokens,
    warnings,
    styles: [],
    usedComponents: new Set(),
    usedTheme: false,
    extraImports: new Set(),
    hooks: [],
    plan,
    openDrawer: null,
    usesNavigationParam: false,
    overlayUses: new Map(),
    shared,
    styleKey: createUniqueIdentifierNamer('node'),
  }
}

// Fichier d'un composant d'ecran : imports (react-native, extensions,
// navigation, theme), hooks, JSX puis StyleSheet.
function assembleFile(
  ctx: RenderContext,
  componentName: string,
  bodyLines: string[],
  screen: { routeName: string } | null,
): ExportedFile {
  const importComponents = Array.from(new Set(['StyleSheet', ...ctx.usedComponents])).sort()
  const lines: string[] = []
  const reactImports = Array.from(ctx.extraImports).filter((l) => l.includes("from 'react'"))
  const otherImports = Array.from(ctx.extraImports).filter((l) => !l.includes("from 'react'")).sort()
  lines.push(...reactImports)
  lines.push(`import { ${importComponents.join(', ')} } from 'react-native';`)
  lines.push(...otherImports)
  if (screen !== null && ctx.usesNavigationParam) {
    lines.push("import type { NativeStackScreenProps } from '@react-navigation/native-stack';")
    lines.push("import type { RootStackParamList } from '../navigation';")
  }
  if (ctx.usedTheme) lines.push(`import { theme } from '../theme';`)
  lines.push('')
  const navigation = screen !== null && ctx.usesNavigationParam
  if (navigation) {
    lines.push(`type Props = NativeStackScreenProps<RootStackParamList, ${jsString(screen!.routeName)}>;`, '')
  }
  lines.push(`export function ${componentName}(${navigation ? '{ navigation }: Props' : ''}) {`)
  for (const hook of ctx.hooks) lines.push(`  ${hook}`)
  lines.push('  return (')
  lines.push(...bodyLines)
  lines.push('  );')
  lines.push('}')
  lines.push('')
  lines.push(...renderStylesBlock(ctx))
  lines.push('')
  return { path: `src/screens/${componentName}.tsx`, contents: lines.join('\n') }
}

function renderPage(page: Page, tokens: DesignTokens, warnings: string[], componentName: string, plan: ExportPlan, shared: RenderContext['shared']): ExportedFile {
  const ctx = newContext(tokens, warnings, plan, shared)

  const topLevel = page.nodes.map((n) => renderNode(n, ctx, 2, null)).filter((l): l is string[] => l !== null)

  let bodyLines: string[]
  if (topLevel.length === 1) {
    bodyLines = topLevel[0]!
  } else {
    // Page a plusieurs noeuds racine (cas non couvert par la fixture) :
    // enveloppes dans une View neutre plutot que de choisir arbitrairement
    // le premier noeud ou d'echouer.
    //
    // Correction Critical 1 (corollaire) : la cle 'root' passe par le meme
    // namer que les noeuds ci-dessus, PAS une chaine fixe -- un noeud dont
    // l'id se normalise justement en 'root' a deja reserve cette cle a ce
    // stade (rendu avant ce bloc), et `ctx.styleKey('root')` repliera alors
    // sur 'root2' au lieu d'ecraser silencieusement le style de ce noeud.
    const rootKey = ctx.styleKey('root')
    ctx.styles.unshift({ key: rootKey, props: [] })
    bodyLines = [`    <View style={styles.${rootKey}}>`, ...topLevel.flat(), '    </View>']
    ctx.usedComponents.add('View')
  }

  return assembleFile(ctx, componentName, bodyLines, null)
}

// Un ecran : racine plein ecran, barre d'application en haut, corps, barre
// de navigation basse, bouton flottant et tiroir (etat local) en
// superposition. C'est l'equivalent React Native d'un Scaffold.
function renderScreen(screen: FrameNode, tokens: DesignTokens, warnings: string[], ref: { pascal: string }, plan: ExportPlan, shared: RenderContext['shared']): ExportedFile {
  const ctx = newContext(tokens, warnings, plan, shared)
  const parts: ScreenParts = splitScreen(screen)
  ctx.usedComponents.add('View')

  if (parts.drawer !== null) {
    ctx.openDrawer = 'setDrawerOpen'
    ctx.hooks.push('const [drawerOpen, setDrawerOpen] = useState(false);')
    ctx.extraImports.add("import { useState } from 'react';")
  }

  const rootKey = ctx.styleKey('screen')
  const fill = firstSolidFillColor(screen.fills)
  ctx.styles.push({ key: rootKey, props: [['flex', '1'], ...(fill ? ([['backgroundColor', colorExpr(fill, ctx)]] as StyleProp[]) : [])] })
  const bodyKey = ctx.styleKey('body')
  ctx.styles.push({ key: bodyKey, props: [['flex', '1'], ...buildFrameLayout(screen)] })

  const isAbsolute = screen.layout.mode === 'absolute'
  const lines: string[] = [`    <View style={styles.${rootKey}}>`]
  if (parts.appBar) lines.push(...(renderNode(parts.appBar, ctx, 3, null) ?? []))
  lines.push(`      <View style={styles.${bodyKey}}>`)
  for (const child of parts.body) {
    const pos = isAbsolute ? { x: child.frame.x, y: child.frame.y - parts.topInset } : null
    lines.push(...(renderNode(child, ctx, 4, pos, !isAbsolute) ?? []))
  }
  lines.push('      </View>')
  if (parts.bottomNav) lines.push(...(renderNode(parts.bottomNav, ctx, 3, null) ?? []))
  if (parts.fab) lines.push(...(renderNode(parts.fab, ctx, 3, { x: parts.fab.frame.x, y: parts.fab.frame.y }) ?? []))
  if (parts.drawer) {
    const drawer = parts.drawer
    const backdropKey = ctx.styleKey('drawer-backdrop')
    const scrimKey = ctx.styleKey('drawer-scrim')
    const fillAll: StyleProp[] = [['position', jsString('absolute')], ['left', '0'], ['top', '0'], ['right', '0'], ['bottom', '0']]
    ctx.styles.push({ key: backdropKey, props: fillAll }, { key: scrimKey, props: [...fillAll, ['backgroundColor', jsString('#00000052')]] })
    ctx.usedComponents.add('Pressable')
    lines.push(
      '      {drawerOpen ? (',
      `        <View style={styles.${backdropKey}}>`,
      `          <Pressable style={styles.${scrimKey}} onPress={() => setDrawerOpen(false)} />`,
      ...(renderNode(drawer, ctx, 5, { x: 0, y: 0 }) ?? []),
      '        </View>',
      '      ) : null}',
    )
  }
  // « Apres un delai » : minuteur arme a l'affichage de l'ecran.
  const delay = screen.interactions?.find((i) => i.trigger.type === 'afterDelay')
  const delayAction = interactionFor(screen, plan, 'afterDelay')
  if (delay !== undefined && delay.trigger.type === 'afterDelay' && delayAction !== null) {
    ctx.extraImports.add("import { useEffect } from 'react';")
    const body = rnAction(delayAction, ctx)
    ctx.hooks.push('useEffect(() => {', `  const timer = setTimeout(() => ${body}, ${delay.trigger.ms});`, '  return () => clearTimeout(timer);', '}, [navigation]);')
  }
  lines.push(...renderOverlays(ctx, 3))
  lines.push('    </View>')

  return assembleFile(ctx, ref.pascal, lines, { routeName: ref.pascal })
}

// Overlays ouvertes par les interactions de l'ecran : un gabarit rendu a la
// demande (etat `overlay`). Traiter une overlay peut en reveler une autre.
function renderOverlays(ctx: RenderContext, depth: number): string[] {
  const out: string[] = []
  const done = new Set<string>()
  for (let guard = 0; guard < 50; guard += 1) {
    const next = [...ctx.overlayUses.values()].find((u) => !done.has(u.ref.id))
    if (next === undefined) break
    done.add(next.ref.id)
    out.push(...renderOverlay(next, ctx, depth))
  }
  return out
}

function renderOverlay(use: OverlayUse, ctx: RenderContext, depth: number): string[] {
  const { ref, transition } = use
  const node = ref.node
  const pad = '  '.repeat(depth)
  const at = (d: number) => '  '.repeat(depth + d)
  const k = (s: string) => ctx.styleKey(`${node.id}-ov-${s}`)
  const visible = `overlay === ${jsString(ref.name)}`
  const close = 'setOverlay(null)'
  const anim = modalAnimation(transition)
  const scrim: StyleProp[] = [['flex', '1'], ['backgroundColor', jsString('#00000052')]]

  if (ref.kind === 'dialog' && node.type === 'component' && node.kind === 'dialog') {
    const p = node.props
    ctx.usedComponents.add('Modal')
    ctx.usedComponents.add('View')
    ctx.usedComponents.add('Text')
    ctx.usedComponents.add('Pressable')
    const overlayKey = k('overlay')
    const boxKey = k('box')
    const titleKey = k('title')
    const messageKey = k('message')
    const actionsKey = k('actions')
    const actionKey = k('action')
    ctx.styles.push(
      { key: overlayKey, props: [...scrim, ['alignItems', jsString('center')], ['justifyContent', jsString('center')]] },
      { key: boxKey, props: [['width', formatNumber(node.frame.w)], ['backgroundColor', jsString(M3.surfaceContainer)], ['borderRadius', '28'], ['padding', '24'], ['gap', '16']] },
      { key: titleKey, props: [['color', jsString(M3.onSurface)], ['fontSize', '24']] },
      { key: messageKey, props: [['color', jsString(M3.onSurfaceVariant)], ['fontSize', '14']] },
      { key: actionsKey, props: [['flexDirection', jsString('row')], ['justifyContent', jsString('flex-end')], ['gap', '8']] },
      { key: actionKey, props: [['color', jsString(M3.primary)], ['fontSize', '14'], ['fontWeight', jsString('500')], ['padding', '10']] },
    )
    const lines = [
      `${pad}<Modal transparent animationType="${anim}" visible={${visible}} onRequestClose={() => ${close}}>`,
      `${at(1)}<View style={styles.${overlayKey}}>`,
      `${at(2)}<View style={styles.${boxKey}}>`,
      `${at(3)}<Text style={styles.${titleKey}}>{${jsString(p.title)}}</Text>`,
      `${at(3)}<Text style={styles.${messageKey}}>{${jsString(p.message)}}</Text>`,
      `${at(3)}<View style={styles.${actionsKey}}>`,
    ]
    if (p.cancelLabel !== '') lines.push(`${at(4)}<Pressable onPress={() => ${close}}><Text style={styles.${actionKey}}>{${jsString(p.cancelLabel)}}</Text></Pressable>`)
    lines.push(`${at(4)}<Pressable onPress={() => ${close}}><Text style={styles.${actionKey}}>{${jsString(p.confirmLabel)}}</Text></Pressable>`, `${at(3)}</View>`, `${at(2)}</View>`, `${at(1)}</View>`, `${pad}</Modal>`)
    return lines
  }

  if (ref.kind === 'bottomSheet' && node.type === 'frame') {
    ctx.usedComponents.add('Modal')
    ctx.usedComponents.add('View')
    ctx.usedComponents.add('Pressable')
    const wrapKey = k('wrap')
    const scrimKey = k('scrim')
    const sheetKey = k('sheet')
    const fill = firstSolidFillColor(node.fills)
    ctx.styles.push(
      { key: wrapKey, props: [['flex', '1'], ['justifyContent', jsString('flex-end')], ['backgroundColor', jsString('#00000052')]] },
      { key: scrimKey, props: [['flex', '1']] },
      {
        key: sheetKey,
        props: [
          ['height', formatNumber(node.frame.h)],
          ['backgroundColor', fill ? colorExpr(fill, ctx) : jsString('#ffffff')],
          ['borderTopLeftRadius', formatNumber(node.cornerRadius)],
          ['borderTopRightRadius', formatNumber(node.cornerRadius)],
          ...buildFrameLayout(node),
        ],
      },
    )
    const isAbsolute = node.layout.mode === 'absolute'
    const children = node.children.flatMap((c) => renderNode(c, ctx, depth + 3, isAbsolute ? { x: c.frame.x, y: c.frame.y } : null, !isAbsolute) ?? [])
    return [
      `${pad}<Modal transparent animationType="${anim === 'fade' ? 'fade' : anim === 'none' ? 'none' : 'slide'}" visible={${visible}} onRequestClose={() => ${close}}>`,
      `${at(1)}<View style={styles.${wrapKey}}>`,
      `${at(2)}<Pressable style={styles.${scrimKey}} onPress={() => ${close}} />`,
      `${at(2)}<View style={styles.${sheetKey}}>`,
      ...children,
      `${at(2)}</View>`,
      `${at(1)}</View>`,
      `${pad}</Modal>`,
    ]
  }

  if (node.type === 'component' && node.kind === 'snackbar') {
    const p = node.props
    ctx.usedComponents.add('View')
    ctx.usedComponents.add('Text')
    ctx.extraImports.add("import { useEffect } from 'react';")
    const wrapKey = k('wrap')
    const barKey = k('bar')
    const messageKey = k('message')
    const actionKey = k('action')
    ctx.styles.push(
      { key: wrapKey, props: [['position', jsString('absolute')], ['left', '16'], ['right', '16'], ['bottom', '24']] },
      { key: barKey, props: [['minHeight', '48'], ['flexDirection', jsString('row')], ['alignItems', jsString('center')], ['justifyContent', jsString('space-between')], ['paddingHorizontal', '16'], ['borderRadius', '4'], ['backgroundColor', jsString(M3.inverseSurface)], ['elevation', '6']] },
      { key: messageKey, props: [['color', jsString(M3.inverseOnSurface)], ['fontSize', '14'], ['flex', '1']] },
      { key: actionKey, props: [['color', jsString('#d0bcff')], ['fontSize', '14'], ['fontWeight', jsString('500')]] },
    )
    ctx.hooks.push(
      'useEffect(() => {',
      `  if (${visible}) {`,
      '    const timer = setTimeout(() => setOverlay(null), 3000);',
      '    return () => clearTimeout(timer);',
      '  }',
      '}, [overlay]);',
    )
    const lines = [
      `${pad}{${visible} ? (`,
      `${at(1)}<View style={styles.${wrapKey}}>`,
      `${at(2)}<View style={styles.${barKey}}>`,
      `${at(3)}<Text style={styles.${messageKey}}>{${jsString(p.message)}}</Text>`,
    ]
    if (p.actionLabel !== '') lines.push(`${at(3)}<Text style={styles.${actionKey}} onPress={() => ${close}}>{${jsString(p.actionLabel)}}</Text>`)
    lines.push(`${at(2)}</View>`, `${at(1)}</View>`, `${pad}) : null}`)
    return lines
  }
  return []
}

function generateNavigation(plan: ExportPlan, transitions: boolean): ExportedFile {
  const lines = [
    ...(transitions ? ["import type { TransitionParams } from './transitions';", ''] : []),
    'export type RootStackParamList = {',
    ...plan.screens.map((s) => `  ${s.pascal}: ${transitions ? 'TransitionParams | undefined' : 'undefined'};`),
    '};',
    '',
  ]
  return { path: 'src/navigation.ts', contents: lines.join('\n') }
}

// Point d'entree : une pile native React Navigation, un ecran par ecran du
// design, l'ecran actif (ou le premier) en route initiale. Les barres
// d'application sont celles du design : l'en-tete natif est masque.
function generateApp(plan: ExportPlan, transitions: boolean): ExportedFile {
  const lines = [
    '// Dependances : react-native, @react-navigation/native,',
    '// @react-navigation/native-stack, react-native-screens,',
    '// react-native-safe-area-context, react-native-vector-icons,',
    '// @react-native-community/slider, @react-native-picker/picker,',
    '// @react-native-community/datetimepicker.',
    "import { NavigationContainer } from '@react-navigation/native';",
    "import { createNativeStackNavigator } from '@react-navigation/native-stack';",
    "import type { RootStackParamList } from './src/navigation';",
    ...(transitions ? ["import { screenOptions } from './src/transitions';"] : []),
    ...plan.screens.map((s) => `import { ${s.pascal} } from './src/screens/${s.pascal}';`),
    '',
    'const Stack = createNativeStackNavigator<RootStackParamList>();',
    '',
    'export default function App() {',
    '  return (',
    '    <NavigationContainer>',
    `      <Stack.Navigator initialRouteName=${jsString(plan.initial!.pascal)} screenOptions={{ headerShown: false }}>`,
    ...plan.screens.map((s) =>
      transitions
        ? `        <Stack.Screen name=${jsString(s.pascal)} component={${s.pascal}} options={({ route }) => screenOptions(route.params)} />`
        : `        <Stack.Screen name=${jsString(s.pascal)} component={${s.pascal}} />`,
    ),
    '      </Stack.Navigator>',
    '    </NavigationContainer>',
    '  );',
    '}',
    '',
  ]
  return { path: 'App.tsx', contents: lines.join('\n') }
}

const RN_ASSETS: AssetTarget = {
  fileName: (stem, ext) => `${stem}${ext}`,
  path: (fileName) => `assets/images/${fileName}`,
  // Relatif a src/screens/<Ecran>.tsx.
  reference: (fileName) => `../../assets/images/${fileName}`,
}

function exportReactNative(source: MaquioDocument, opts: ExportOptions): ExportResult {
  const assetPlan = planAssets(source, RN_ASSETS)
  const doc = assetPlan.doc
  const warnings: string[] = [...assetPlan.warnings]
  const files: ExportedFile[] = []
  const plan = planExport(doc, opts.activeScreenId)
  const shared = { usesTransitions: false }

  for (const unit of plan.units) {
    if (unit.kind === 'page') {
      const laidOutPage = layoutPage(unit.page)
      files.push(renderPage(laidOutPage, doc.tokens, warnings, unit.names.pascal, plan, shared))
      continue
    }
    const laidOut = layoutPage({ ...unit.page, nodes: [unit.screen] }).nodes[0] as FrameNode
    files.push(renderScreen(laidOut, doc.tokens, warnings, unit.ref, plan, shared))
  }

  files.push(generateThemeFile(doc.tokens))
  if (plan.initial !== null) {
    files.push(generateNavigation(plan, shared.usesTransitions), generateApp(plan, shared.usesTransitions))
  }
  if (shared.usesTransitions) files.push({ path: 'src/transitions.ts', contents: TRANSITIONS_TS })

  return { files, warnings, assets: assetPlan.assets }
}

export const reactNativeExporter: Exporter = {
  id: 'react-native',
  label: 'React Native',
  maturity: 'complete',
  export: exportReactNative,
}
