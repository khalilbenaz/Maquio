// Generateur Jetpack Compose en apercu (Tache 9) : traduit un
// CalqueDocument en une fonction @Composable par page
// (src/main/kotlin/screens/<PascalCase>.kt).
//
// Couverture d'apercu identique a SwiftUI (decision 4 du brief) : frame,
// text, rect, ellipse, image. Tout autre type (line aujourd'hui) est
// ignore a l'emission mais ajoute un avertissement dans
// ExportResult.warnings.
//
// Correspondances (decision 3 du brief) :
//   - frame `absolute` -> Box + Modifier.offset(x = …dp, y = …dp).size(…)
//   - frame `row`/`column` -> Row/Column avec horizontalArrangement /
//     verticalArrangement et Arrangement.spacedBy(…dp)
//   - rect -> Box + Modifier.background(color, RoundedCornerShape(…dp))
//   - ellipse -> CircleShape
//   - text -> Text("…", style = TextStyle(...))
//   - image -> Image(painterResource(...)) (ressource locale) ou
//     AsyncImage(model = …) (URL, bibliotheque Coil)
//
// Couleurs en Color(0xAARRGGBB) hexadecimal majuscule — EXACTEMENT le
// meme format que Flutter (../shared/color-hex.ts) — toujours litterales
// ici (decision 9 : Compose reste en apercu), avec un commentaire
// `// nom` quand la couleur correspond exactement a un token du document.
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
import { toPascalCase } from '../shared/naming'
import { unsupportedPropertyWarning } from '../shared/lost-property-warning'
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { PREVIEW_SUPPORTED_NODE_TYPES, unsupportedNodeWarning } from '../shared/preview-coverage'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import {
  colorTokenComment,
  composeColorExpr as composeColorExprRaw,
  composeFontWeightExpr,
  kotlinString,
} from './kotlin-utils'

const EXPORTER_ID = 'compose'

type RenderContext = { tokens: DesignTokens; warnings: string[]; imports: Set<string> }

function dp(value: number): string {
  return `${formatNumber(value)}.dp`
}

// Enregistre l'import androidx.compose.ui.graphics.Color des qu'une
// couleur est effectivement emise, plutot que de l'ajouter
// inconditionnellement (evite un import inutilise sur un ecran sans
// aucune couleur).
function composeColorExpr(color: { r: number; g: number; b: number; a: number }, tokens: DesignTokens, ctx: RenderContext): string {
  ctx.imports.add('androidx.compose.ui.graphics.Color')
  return composeColorExprRaw(color, tokens)
}

// Place la virgule finale AVANT le commentaire `// nom` eventuel : un
// commentaire Kotlin s'etend jusqu'a la fin de la ligne physique, donc
// `code, // nom` est valide alors que `code // nom,` mettrait la virgule
// en commentaire (code non compilable).
function modifierLine(code: string, comment: string, isLast: boolean): string {
  return isLast ? `${code},${comment}` : `${code}${comment}`
}

function shapeArgExpr(cornerRadius: number, isCircle: boolean, ctx: RenderContext): string | null {
  if (isCircle) {
    ctx.imports.add('androidx.compose.foundation.shape.CircleShape')
    return 'CircleShape'
  }
  if (cornerRadius > 0) {
    ctx.imports.add('androidx.compose.foundation.shape.RoundedCornerShape')
    return `RoundedCornerShape(${dp(cornerRadius)})`
  }
  return null
}

// Modifier.size(...).background(color[, shape]).border(...)[, extraMods]
// pour un Box representant un rect ou une ellipse.
function boxModifierLines(
  w: number,
  h: number,
  fills: Fill[],
  strokes: Stroke[],
  cornerRadius: number,
  isCircle: boolean,
  ctx: RenderContext,
  depth: number,
  extraMods: string[],
): string[] {
  ctx.imports.add('androidx.compose.foundation.layout.size')
  ctx.imports.add('androidx.compose.ui.Modifier')
  ctx.imports.add('androidx.compose.ui.unit.dp')

  const fillColor = firstSolidFillColor(fills)
  const stroke = firstStroke(strokes)
  const shape = shapeArgExpr(cornerRadius, isCircle, ctx)

  const lines = [`${pad(depth)}modifier = Modifier`, `${pad(depth + 1)}.size(width = ${dp(w)}, height = ${dp(h)})`]

  if (fillColor) {
    ctx.imports.add('androidx.compose.foundation.background')
    const args = shape ? `${composeColorExpr(fillColor, ctx.tokens, ctx)}, ${shape}` : composeColorExpr(fillColor, ctx.tokens, ctx)
    const isLast = !stroke && extraMods.length === 0
    lines.push(`${pad(depth + 1)}${modifierLine(`.background(${args})`, colorTokenComment(fillColor, ctx.tokens), isLast)}`)
  }
  if (stroke) {
    ctx.imports.add('androidx.compose.foundation.border')
    const args = shape
      ? `${dp(stroke.width)}, ${composeColorExpr(stroke.color, ctx.tokens, ctx)}, ${shape}`
      : `${dp(stroke.width)}, ${composeColorExpr(stroke.color, ctx.tokens, ctx)}`
    const isLast = extraMods.length === 0
    lines.push(`${pad(depth + 1)}${modifierLine(`.border(${args})`, colorTokenComment(stroke.color, ctx.tokens), isLast)}`)
  }
  extraMods.forEach((mod, i) => {
    const isLast = i === extraMods.length - 1
    lines.push(`${pad(depth + 1)}${modifierLine(mod, '', isLast)}`)
  })
  if (!fillColor && !stroke && extraMods.length === 0) {
    lines[lines.length - 1] += ','
  }
  return lines
}

function renderRect(node: RectNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  ctx.imports.add('androidx.compose.foundation.layout.Box')
  const modLines = boxModifierLines(
    node.frame.w,
    node.frame.h,
    node.fills,
    node.strokes,
    node.cornerRadius,
    false,
    ctx,
    depth + 1,
    extraMods,
  )
  return [`${pad(depth)}Box(`, ...modLines, `${pad(depth)})`]
}

function renderEllipse(node: EllipseNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  ctx.imports.add('androidx.compose.foundation.layout.Box')
  const modLines = boxModifierLines(node.frame.w, node.frame.h, node.fills, node.strokes, 0, true, ctx, depth + 1, extraMods)
  return [`${pad(depth)}Box(`, ...modLines, `${pad(depth)})`]
}

function renderText(node: TextNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  ctx.imports.add('androidx.compose.material3.Text')
  ctx.imports.add('androidx.compose.ui.text.TextStyle')
  ctx.imports.add('androidx.compose.ui.text.font.FontWeight')
  ctx.imports.add('androidx.compose.ui.unit.sp')

  const lines = [
    `${pad(depth)}Text(`,
    `${pad(depth + 1)}${kotlinString(node.characters)},`,
    `${pad(depth + 1)}style = TextStyle(`,
    `${pad(depth + 2)}fontSize = ${formatNumber(node.style.fontSize)}.sp,`,
    `${pad(depth + 2)}fontWeight = ${composeFontWeightExpr(node.style.fontWeight)},`,
    `${pad(depth + 2)}color = ${composeColorExpr(node.style.color, ctx.tokens, ctx)},${colorTokenComment(node.style.color, ctx.tokens)}`,
    `${pad(depth + 1)}),`,
  ]
  // Correction Critical 2 : `extraMods` (le `.offset(x, y)` du mode
  // `absolute`, le cas COURANT -- toute frame Figma sans auto-layout) doit
  // devenir un argument NOMME `modifier = Modifier` a part entiere, pas
  // des lignes ajoutees telles quelles apres l'argument `style = ...`
  // deja ferme par sa virgule : l'ancienne version produisait
  // `.offset(x = ..., y = ...),` comme argument de Text() sans nom,
  // invalide en Kotlin (voir renderRect/renderEllipse/renderFrame, qui
  // eux passent deja `extraMods` a l'interieur d'une chaine `modifier =
  // Modifier` via `boxModifierLines`).
  if (extraMods.length > 0) {
    ctx.imports.add('androidx.compose.ui.Modifier')
    lines.push(`${pad(depth + 1)}modifier = Modifier`)
    extraMods.forEach((mod, i) => {
      const isLast = i === extraMods.length - 1
      lines.push(`${pad(depth + 2)}${modifierLine(mod, '', isLast)}`)
    })
  }
  lines.push(`${pad(depth)})`)
  return lines
}

function fitToContentScale(fit: 'cover' | 'contain' | 'fill'): string {
  if (fit === 'cover') return 'ContentScale.Crop'
  if (fit === 'contain') return 'ContentScale.Fit'
  return 'ContentScale.FillBounds'
}

// Correction Critical 2 (meme classe de bug que renderText, assemblage
// distinct de boxModifierLines) : `.size(...)` portait toujours la virgule
// finale, y compris quand `extraMods` suivait -- `.offset(...)` devenait
// alors une ligne orpheline (pas rattachee a la chaine `Modifier`) plutot
// que le dernier maillon de la chaine. `modifierLine` place la virgule sur
// la DERNIERE ligne seulement, comme pour Box/Row/Column.
function imageModifierLines(w: number, h: number, extraMods: string[], depth: number): string[] {
  const isLastSize = extraMods.length === 0
  return [
    `${pad(depth)}modifier = Modifier`,
    `${pad(depth + 1)}${modifierLine(`.size(width = ${dp(w)}, height = ${dp(h)})`, '', isLastSize)}`,
    ...extraMods.map((m, i) => `${pad(depth + 1)}${modifierLine(m, '', i === extraMods.length - 1)}`),
  ]
}

// Ecart connu ferme (README, « Écarts connus ») : un src vide n'emet plus
// `painterResource(...)`/`AsyncImage(...)` en silence -- le noeud n'est
// pas rendu et un avertissement dedie est ajoute a ctx.warnings, distinct
// de celui (deja existant) pour une ressource locale dont le nom EST
// connu mais dont le paquet applicatif ne l'est pas (voir plus bas).
function renderImage(node: ImageNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] | null {
  if (node.src === '') {
    ctx.warnings.push(emptyImageSourceWarning(node.id, EXPORTER_ID))
    return null
  }

  ctx.imports.add('androidx.compose.ui.Modifier')
  ctx.imports.add('androidx.compose.foundation.layout.size')
  ctx.imports.add('androidx.compose.ui.unit.dp')
  ctx.imports.add('androidx.compose.ui.layout.ContentScale')

  const modifierLines = imageModifierLines(node.frame.w, node.frame.h, extraMods, depth + 1)

  if (isRemoteUrl(node.src)) {
    ctx.imports.add('coil.compose.AsyncImage')
    return [
      `${pad(depth)}AsyncImage(`,
      `${pad(depth + 1)}model = ${kotlinString(node.src)},`,
      `${pad(depth + 1)}contentDescription = null,`,
      `${pad(depth + 1)}contentScale = ${fitToContentScale(node.fit)},`,
      ...modifierLines,
      `${pad(depth)})`,
    ]
  }

  // Correction Critical 2 (corollaire, re-corrige apres re-revue) :
  // `painterResource` attend une ressource `@DrawableRes Int`
  // (`R.drawable.<nom>`), jamais une `String` -- `painterResource(
  // kotlinString(node.src))` ne compilait pas. Un premier correctif
  // emettait `R.drawable.<nom derive du chemin>`, mais `R` n'est JAMAIS
  // importe par ce fichier (son en-tete ne contient que `package screens`
  // et des `import androidx.*` : aucun nom de paquet applicatif n'est
  // connu de ce generateur) -- on avait remplace un appel qui ne compile
  // pas par un symbole non resolu. Tant que ce nom de paquet n'est pas
  // connu, toute image LOCALE (contrairement a une URL distante, qui ne
  // passe jamais par `R`) est signalee plutot qu'emise : le noeud n'est
  // pas rendu, comme pour tout autre defaut d'emission dans ce
  // generateur. Couvert par un test avec `src` non vide (ex.
  // 'assets/Icon@2x.png') : le cas `src: ''` (systematique pour tout
  // espace reserve `image` importe de Figma) ne suffit pas a lui seul a
  // prouver que CE chemin est bien atteint.
  ctx.warnings.push(
    `image non exportee par l export compose (apercu) : ressource locale "${node.src}" nécessiterait un import R du paquet applicatif, inconnu de ce generateur (noeud ${node.id})`,
  )
  return null
}

function mainArrangementExpr(
  align: 'start' | 'center' | 'end' | 'space-between',
  gap: number,
  isRow: boolean,
  ctx: RenderContext,
): string {
  ctx.imports.add('androidx.compose.foundation.layout.Arrangement')
  if (align === 'space-between') return 'Arrangement.SpaceBetween'

  const startExpr = isRow ? 'Arrangement.Start' : 'Arrangement.Top'
  const endExpr = isRow ? 'Arrangement.End' : 'Arrangement.Bottom'
  const centerAlignExpr = isRow ? 'Alignment.CenterHorizontally' : 'Alignment.CenterVertically'
  const endAlignExpr = isRow ? 'Alignment.End' : 'Alignment.Bottom'

  if (gap === 0) {
    if (align === 'center') return 'Arrangement.Center'
    if (align === 'end') return endExpr
    return startExpr
  }

  ctx.imports.add('androidx.compose.ui.Alignment')
  if (align === 'center') return `Arrangement.spacedBy(${dp(gap)}, ${centerAlignExpr})`
  if (align === 'end') return `Arrangement.spacedBy(${dp(gap)}, ${endAlignExpr})`
  return `Arrangement.spacedBy(${dp(gap)})`
}

function crossAlignmentExpr(align: 'start' | 'center' | 'end' | 'stretch', isRow: boolean, ctx: RenderContext): string {
  ctx.imports.add('androidx.compose.ui.Alignment')
  // Compose n'a pas d'equivalent direct a `stretch` pour
  // horizontalAlignment/verticalAlignment (contrainte identique a
  // SwiftUI) : approxime par le debut de l'axe, limitation documentee du
  // niveau d'apercu.
  if (isRow) {
    if (align === 'center') return 'Alignment.CenterVertically'
    if (align === 'end') return 'Alignment.Bottom'
    return 'Alignment.Top'
  }
  if (align === 'center') return 'Alignment.CenterHorizontally'
  if (align === 'end') return 'Alignment.End'
  return 'Alignment.Start'
}

function renderFrame(frame: FrameNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const isAbsolute = frame.layout.mode === 'absolute'
  const isRow = frame.layout.mode === 'row'

  // Important 2 : contrairement a Flutter (`clipBehavior`) et React Native
  // (`overflow`), ce generateur `preview` ne decoupe pas le contenu qui
  // deborde -- jamais perdu en silence.
  if (frame.clipsContent) {
    ctx.warnings.push(unsupportedPropertyWarning('clipsContent', frame.id, EXPORTER_ID))
  }

  ctx.imports.add('androidx.compose.foundation.layout.size')
  ctx.imports.add('androidx.compose.ui.Modifier')
  ctx.imports.add('androidx.compose.ui.unit.dp')

  const fillColor = firstSolidFillColor(frame.fills)
  const stroke = firstStroke(frame.strokes)
  const shape = shapeArgExpr(frame.cornerRadius, false, ctx)

  // Padding (row/column uniquement) et extraMods (offset d'un enfant
  // absolute) viennent toujours apres background/border ici : seule la
  // toute derniere ligne du chainage recoit la virgule finale (separe
  // l'argument `modifier =` du suivant), placee avant un commentaire
  // `// nom` eventuel plutot qu'apres (voir `modifierLine`).
  const padding = !isAbsolute ? frame.layout.padding : null
  const hasPadding =
    padding !== null && !(padding.top === 0 && padding.right === 0 && padding.bottom === 0 && padding.left === 0)
  const isLastBg = !stroke && !hasPadding && extraMods.length === 0
  const isLastBorder = !hasPadding && extraMods.length === 0

  const modLines = [`${pad(depth + 1)}modifier = Modifier`, `${pad(depth + 2)}.size(width = ${dp(frame.frame.w)}, height = ${dp(frame.frame.h)})`]
  if (fillColor) {
    ctx.imports.add('androidx.compose.foundation.background')
    const args = shape ? `${composeColorExpr(fillColor, ctx.tokens, ctx)}, ${shape}` : composeColorExpr(fillColor, ctx.tokens, ctx)
    modLines.push(`${pad(depth + 2)}${modifierLine(`.background(${args})`, colorTokenComment(fillColor, ctx.tokens), isLastBg)}`)
  }
  if (stroke) {
    ctx.imports.add('androidx.compose.foundation.border')
    const args = shape
      ? `${dp(stroke.width)}, ${composeColorExpr(stroke.color, ctx.tokens, ctx)}, ${shape}`
      : `${dp(stroke.width)}, ${composeColorExpr(stroke.color, ctx.tokens, ctx)}`
    modLines.push(`${pad(depth + 2)}${modifierLine(`.border(${args})`, colorTokenComment(stroke.color, ctx.tokens), isLastBorder)}`)
  }
  if (padding !== null && hasPadding) {
    ctx.imports.add('androidx.compose.foundation.layout.padding')
    const { top, right, bottom, left } = padding
    if (top === right && right === bottom && bottom === left) {
      modLines.push(`${pad(depth + 2)}.padding(${dp(top)})`)
    } else {
      modLines.push(
        `${pad(depth + 2)}.padding(start = ${dp(left)}, top = ${dp(top)}, end = ${dp(right)}, bottom = ${dp(bottom)})`,
      )
    }
  }
  extraMods.forEach((mod) => modLines.push(`${pad(depth + 2)}${mod}`))
  // Virgule finale sur la derniere ligne du modifier, seulement si elle
  // n'a pas deja ete placee par `modifierLine` (cas background/border
  // sans rien apres) : padding et extraMods n'ont jamais de commentaire,
  // une simple concatenation suffit pour eux.
  if (hasPadding || extraMods.length > 0 || (!fillColor && !stroke)) {
    modLines[modLines.length - 1] += ','
  }

  if (isAbsolute) {
    ctx.imports.add('androidx.compose.foundation.layout.Box')
    ctx.imports.add('androidx.compose.foundation.layout.offset')
    const childLines: string[] = []
    for (const child of frame.children) {
      if (!child.visible) continue
      const childExtra = [`.offset(x = ${dp(child.frame.x)}, y = ${dp(child.frame.y)})`]
      const rendered = renderNode(child, ctx, depth + 1, childExtra)
      if (rendered) childLines.push(...rendered)
    }
    if (childLines.length === 0) return [`${pad(depth)}Box(`, ...modLines, `${pad(depth)})`]
    return [`${pad(depth)}Box(`, ...modLines, `${pad(depth)}) {`, ...childLines, `${pad(depth)}}`]
  }

  ctx.imports.add(isRow ? 'androidx.compose.foundation.layout.Row' : 'androidx.compose.foundation.layout.Column')
  const widget = isRow ? 'Row' : 'Column'
  const mainArrangementKey = isRow ? 'horizontalArrangement' : 'verticalArrangement'
  const crossAlignmentKey = isRow ? 'verticalAlignment' : 'horizontalAlignment'

  // Important 1 : `stretch` est approxime par le debut de l'axe
  // (crossAlignmentExpr, ci-dessus) faute d'equivalent Compose direct --
  // jamais en silence.
  if (frame.layout.alignCross === 'stretch') {
    ctx.warnings.push(unsupportedPropertyWarning("alignCross: 'stretch'", frame.id, EXPORTER_ID))
  }

  const header = [
    `${pad(depth)}${widget}(`,
    ...modLines,
    `${pad(depth + 1)}${mainArrangementKey} = ${mainArrangementExpr(frame.layout.alignMain, frame.layout.gap, isRow, ctx)},`,
    `${pad(depth + 1)}${crossAlignmentKey} = ${crossAlignmentExpr(frame.layout.alignCross, isRow, ctx)},`,
    `${pad(depth)}) {`,
  ]

  // Comme pour SwiftUI : en mode space-between, `gap` est deja ignore
  // ci-dessus (mainArrangementExpr renvoie Arrangement.SpaceBetween, qui
  // distribue tout l'espace libre lui-meme) — aucun Spacer() ni gap fixe
  // a inserer entre les enfants ici.
  const childLines: string[] = []
  for (const child of frame.children) {
    if (!child.visible) continue
    const rendered = renderNode(child, ctx, depth + 1, [])
    if (rendered) childLines.push(...rendered)
  }

  return [...header, ...childLines, `${pad(depth)}}`]
}

function renderNode(node: Node, ctx: RenderContext, depth: number, extraMods: string[]): string[] | null {
  if (!node.visible) return null

  if (!PREVIEW_SUPPORTED_NODE_TYPES.has(node.type)) {
    ctx.warnings.push(unsupportedNodeWarning(node.type, EXPORTER_ID))
    return null
  }

  // Important 1 : contrairement a Flutter et React Native, ce generateur
  // `preview` n'implemente ni `.alpha()` ni `.rotate()` -- jamais perdu en
  // silence, meme si le type de noeud lui-meme est couvert.
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
      return renderImage(node, ctx, depth, extraMods)
    default:
      return null
  }
}

function renderPage(page: Page, tokens: DesignTokens, warnings: string[]): ExportedFile {
  const ctx: RenderContext = {
    tokens,
    warnings,
    imports: new Set(['androidx.compose.runtime.Composable']),
  }

  const topLevel = page.nodes.map((n) => renderNode(n, ctx, 1, [])).filter((l): l is string[] => l !== null)

  const bodyLines =
    topLevel.length === 1 ? topLevel[0]! : ['    Column {', ...topLevel.flat(), '    }']

  const functionName = toPascalCase(page.name)
  const sortedImports = Array.from(ctx.imports).sort()

  const lines = [
    'package screens',
    '',
    ...sortedImports.map((i) => `import ${i}`),
    '',
    '@Composable',
    `fun ${functionName}() {`,
    ...bodyLines,
    '}',
    '',
  ]

  return { path: `src/main/kotlin/screens/${functionName}.kt`, contents: lines.join('\n') }
}

function exportCompose(doc: CalqueDocument, _opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []

  for (const page of doc.pages) {
    const laidOutPage = layoutPage(page)
    files.push(renderPage(laidOutPage, doc.tokens, warnings))
  }

  return { files, warnings }
}

export const composeExporter: Exporter = {
  id: 'compose',
  label: 'Jetpack Compose',
  maturity: 'preview',
  export: exportCompose,
}
