// Generateur React Native (Tache 8) : traduit un CalqueDocument en un
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
import { toPascalCase } from '../shared/naming'
import { formatNumber } from '../shared/format-number'
import { findColorToken } from '../shared/tokens'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import { alignItemsExpr, colorToHex, escapeJsString, fontWeightExpr, justifyContentExpr } from './rn-utils'
import { generateThemeFile } from './theme'

type StyleProp = [key: string, value: string]
type StyleEntry = { key: string; props: StyleProp[] }

type RenderContext = {
  tokens: DesignTokens
  warnings: string[]
  styles: StyleEntry[]
  usedComponents: Set<'View' | 'Text' | 'Image'>
  usedTheme: boolean
}

function num(value: number): string {
  return formatNumber(value)
}

function jsString(value: string): string {
  return `'${escapeJsString(value)}'`
}

function firstSolidFillColor(fills: Fill[]): Color | null {
  const found = fills.find((f) => f.type === 'solid')
  return found && found.type === 'solid' ? found.color : null
}

function firstStroke(strokes: Stroke[]): Stroke | null {
  return strokes[0] ?? null
}

// `theme.colors.<nom>` quand la couleur correspond exactement a un token
// (decision 9 du brief), sinon le litteral hexadecimal `#rrggbbaa`.
function colorExpr(color: Color, ctx: RenderContext): string {
  const token = findColorToken(color, ctx.tokens)
  if (token !== null) {
    ctx.usedTheme = true
    return `theme.colors.${token}`
  }
  return jsString(colorToHex(color))
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
  if (cornerRadius !== null && cornerRadius > 0) props.push(['borderRadius', num(cornerRadius)])
  if (stroke) {
    props.push(['borderWidth', num(stroke.width)])
    props.push(['borderColor', colorExpr(stroke.color, ctx)])
  }
  return props
}

function paddingProps(padding: { top: number; right: number; bottom: number; left: number }): StyleProp[] {
  const { top, right, bottom, left } = padding
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return []
  if (top === right && right === bottom && bottom === left) return [['padding', num(top)]]
  return [
    ['paddingTop', num(top)],
    ['paddingRight', num(right)],
    ['paddingBottom', num(bottom)],
    ['paddingLeft', num(left)],
  ]
}

function buildRectStyle(node: RectNode, ctx: RenderContext): StyleProp[] {
  return [
    ['width', num(node.frame.w)],
    ['height', num(node.frame.h)],
    ...decorationProps(node.fills, node.strokes, node.cornerRadius, ctx),
  ]
}

function buildEllipseStyle(node: EllipseNode, ctx: RenderContext): StyleProp[] {
  const radius = Math.min(node.frame.w, node.frame.h) / 2
  return [
    ['width', num(node.frame.w)],
    ['height', num(node.frame.h)],
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
    ['width', horizontal ? num(node.frame.w) : '1'],
    ['height', horizontal ? '1' : num(node.frame.h)],
    ['backgroundColor', colorExpr(node.stroke.color, ctx)],
  ]
}

function buildImageStyle(node: ImageNode): StyleProp[] {
  return [
    ['width', num(node.frame.w)],
    ['height', num(node.frame.h)],
  ]
}

function buildTextStyle(node: TextNode, ctx: RenderContext): StyleProp[] {
  const props: StyleProp[] = [
    ['fontFamily', jsString(node.style.fontFamily)],
    ['fontSize', num(node.style.fontSize)],
    ['fontWeight', fontWeightExpr(node.style.fontWeight)],
  ]
  if (node.style.lineHeight > 0) props.push(['lineHeight', num(node.style.lineHeight)])
  if (node.style.letterSpacing !== 0) props.push(['letterSpacing', num(node.style.letterSpacing)])
  props.push(['color', colorExpr(node.style.color, ctx)])
  props.push(['textAlign', jsString(node.style.align)])
  return props
}

function buildFrameStyle(frame: FrameNode, ctx: RenderContext): StyleProp[] {
  const props: StyleProp[] = [
    ['width', num(frame.frame.w)],
    ['height', num(frame.frame.h)],
    ...decorationProps(frame.fills, frame.strokes, frame.cornerRadius, ctx),
  ]

  if (frame.layout.mode !== 'absolute') {
    const isRow = frame.layout.mode === 'row'
    props.push(['flexDirection', jsString(isRow ? 'row' : 'column')])
    if (frame.layout.gap > 0 && frame.layout.alignMain !== 'space-between') {
      props.push(['gap', num(frame.layout.gap)])
    }
    props.push(...paddingProps(frame.layout.padding))
    props.push(['justifyContent', justifyContentExpr(frame.layout.alignMain)])
    props.push(['alignItems', alignItemsExpr(frame.layout.alignCross)])
  }

  return props
}

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//.test(src)
}

function resizeModeExpr(fit: 'cover' | 'contain' | 'fill'): string {
  if (fit === 'cover') return 'cover'
  if (fit === 'contain') return 'contain'
  return 'stretch'
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
): string[] | null {
  if (!node.visible) return null

  let ownProps: StyleProp[]

  switch (node.type) {
    case 'rect': {
      ctx.usedComponents.add('View')
      ownProps = buildRectStyle(node, ctx)
      break
    }
    case 'ellipse': {
      ctx.usedComponents.add('View')
      ownProps = buildEllipseStyle(node, ctx)
      break
    }
    case 'line': {
      ctx.usedComponents.add('View')
      ownProps = buildLineStyle(node, ctx)
      break
    }
    case 'text': {
      ctx.usedComponents.add('Text')
      ownProps = buildTextStyle(node, ctx)
      break
    }
    case 'image': {
      ctx.usedComponents.add('Image')
      ownProps = buildImageStyle(node)
      break
    }
    case 'frame': {
      ctx.usedComponents.add('View')
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

  if (absolutePos) {
    ownProps = [['position', jsString('absolute')], ['left', num(absolutePos.x)], ['top', num(absolutePos.y)], ...ownProps]
  }
  if (node.opacity < 1) ownProps.push(['opacity', num(node.opacity)])
  if (node.rotation !== 0) ownProps.push(['transform', `[{ rotate: '${num(node.rotation)}deg' }]`])

  const styleKey = toCamelCase(node.id)
  ctx.styles.push({ key: styleKey, props: ownProps })

  const pad = '  '.repeat(depth)

  if (node.type === 'text') {
    return [`${pad}<Text style={styles.${styleKey}}>{${jsString(node.characters)}}</Text>`]
  }

  if (node.type === 'image') {
    const source = isRemoteUrl(node.src)
      ? `{{ uri: ${jsString(node.src)} }}`
      : `{require(${jsString(node.src)})}`
    return [
      `${pad}<Image style={styles.${styleKey}} source=${source} resizeMode="${resizeModeExpr(node.fit)}" />`,
    ]
  }

  if (node.type === 'frame') {
    const childLines = renderFrameChildren(node, ctx, depth + 1)
    if (childLines.length === 0) return [`${pad}<View style={styles.${styleKey}} />`]
    return [`${pad}<View style={styles.${styleKey}}>`, ...childLines, `${pad}</View>`]
  }

  // rect, ellipse, line : toujours une View sans enfant.
  return [`${pad}<View style={styles.${styleKey}} />`]
}

function renderFrameChildren(frame: FrameNode, ctx: RenderContext, depth: number): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const lines: string[] = []
  for (const child of frame.children) {
    const pos = isAbsolute ? { x: child.frame.x, y: child.frame.y } : null
    const rendered = renderNode(child, ctx, depth, pos)
    if (rendered) lines.push(...rendered)
  }
  return lines
}

function toCamelCase(input: string): string {
  const parts = input.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0)
  if (parts.length === 0) return input
  const [first, ...rest] = parts
  return [first!.toLowerCase(), ...rest.map((p) => p[0]!.toUpperCase() + p.slice(1).toLowerCase())].join('')
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

function renderPage(page: Page, tokens: DesignTokens, warnings: string[]): ExportedFile {
  const ctx: RenderContext = {
    tokens,
    warnings,
    styles: [],
    usedComponents: new Set(),
    usedTheme: false,
  }

  const topLevel = page.nodes.map((n) => renderNode(n, ctx, 2, null)).filter((l): l is string[] => l !== null)

  let bodyLines: string[]
  if (topLevel.length === 1) {
    bodyLines = topLevel[0]!
  } else {
    // Page a plusieurs noeuds racine (cas non couvert par la fixture) :
    // enveloppes dans une View neutre plutot que de choisir arbitrairement
    // le premier noeud ou d'echouer.
    ctx.styles.unshift({ key: 'root', props: [] })
    bodyLines = ['    <View style={styles.root}>', ...topLevel.flat(), '    </View>']
  }

  const componentName = toPascalCase(page.name)
  const importComponents = Array.from(new Set(['StyleSheet', ...ctx.usedComponents])).sort()

  const lines: string[] = [`import { ${importComponents.join(', ')} } from 'react-native';`]
  if (ctx.usedTheme) lines.push(`import { theme } from '../theme';`)
  lines.push('')
  lines.push(`export function ${componentName}() {`)
  lines.push('  return (')
  lines.push(...bodyLines)
  lines.push('  );')
  lines.push('}')
  lines.push('')
  lines.push(...renderStylesBlock(ctx))
  lines.push('')

  return { path: `src/screens/${componentName}.tsx`, contents: lines.join('\n') }
}

function exportReactNative(doc: CalqueDocument, _opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []

  for (const page of doc.pages) {
    const laidOutPage = layoutPage(page)
    files.push(renderPage(laidOutPage, doc.tokens, warnings))
  }

  files.push(generateThemeFile(doc.tokens))

  return { files, warnings }
}

export const reactNativeExporter: Exporter = {
  id: 'react-native',
  label: 'React Native',
  maturity: 'complete',
  export: exportReactNative,
}
