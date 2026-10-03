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
  ComponentNode,
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
import { navigateExpr, renderComposeComponent, renderTopAppBar } from './components'
import type { CEnv } from './components'
import { formatNumber } from '../shared/format-number'
import { pad } from '../shared/indent'
import { unsupportedPropertyWarning } from '../shared/lost-property-warning'
import { emptyImageSourceWarning, firstSolidFillColor, firstStroke, isRemoteUrl } from '../shared/node-helpers'
import { linkTargetOf, planExport, splitScreen } from '../shared/screens'
import type { ExportPlan, ScreenParts } from '../shared/screens'
import { PREVIEW_SUPPORTED_NODE_TYPES, unsupportedNodeWarning } from '../shared/preview-coverage'
import type { Exporter, ExportedFile, ExportOptions, ExportResult } from '../types'
import {
  colorTokenComment,
  composeColorExpr as composeColorExprRaw,
  composeFontWeightExpr,
  kotlinString,
} from './kotlin-utils'

const EXPORTER_ID = 'compose'

type RenderContext = {
  tokens: DesignTokens
  warnings: string[]
  imports: Set<string>
  plan: ExportPlan
  counter: number
  usesNavigation: boolean
  // Une API experimentale de Material 3 est utilisee : @OptIn sur l'ecran.
  experimental: boolean
}

function envOf(ctx: RenderContext, inFlex: boolean): CEnv {
  return {
    inFlex,
    ctx: {
      tokens: ctx.tokens,
      plan: ctx.plan,
      imports: ctx.imports,
      nextIndex: () => ++ctx.counter,
      markNavigation: () => {
        ctx.usesNavigation = true
      },
      markExperimental: () => {
        ctx.experimental = true
      },
    },
  }
}

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
      const rendered = renderNode(child, ctx, depth + 1, childExtra, false)
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
    const rendered = renderNode(child, ctx, depth + 1, [], true)
    if (rendered) childLines.push(...rendered)
  }

  return [...header, ...childLines, `${pad(depth)}}`]
}

const SIZE_IMPORTS = ['androidx.compose.ui.Modifier', 'androidx.compose.foundation.layout.size', 'androidx.compose.ui.unit.dp']

// Chaine de modificateurs d'un composant : taille, decalage eventuel,
// opacite, rotation, clic de navigation.
function componentModifier(node: ComponentNode, ctx: RenderContext, extraMods: string[], selfLinking: boolean): string {
  for (const i of SIZE_IMPORTS) ctx.imports.add(i)
  let chain = `Modifier.size(width = ${dp(node.frame.w)}, height = ${dp(node.frame.h)})`
  for (const mod of extraMods) chain += mod
  if (node.opacity < 1) {
    ctx.imports.add('androidx.compose.ui.draw.alpha')
    chain += `.alpha(${formatNumber(node.opacity)}f)`
  }
  if (node.rotation !== 0) {
    ctx.imports.add('androidx.compose.ui.draw.rotate')
    chain += `.rotate(${formatNumber(node.rotation)}f)`
  }
  const target = linkTargetOf(node, ctx.plan)
  if (target !== null && !selfLinking) {
    ctx.imports.add('androidx.compose.foundation.clickable')
    chain += `.clickable { ${navigateExpr(envOf(ctx, false), target)} }`
  }
  return chain
}

// Clic de navigation d'un noeud ordinaire (frame, texte, forme, image).
function linkMods(node: Node, ctx: RenderContext): string[] {
  const target = linkTargetOf(node, ctx.plan)
  if (target === null) return []
  ctx.imports.add('androidx.compose.foundation.clickable')
  return [`.clickable { ${navigateExpr(envOf(ctx, false), target)} }`]
}

const SELF_LINKING = new Set(['button', 'iconButton', 'fab', 'chip', 'listTile'])

// Widget natif d'un conteneur semantique.
function renderContainer(frame: FrameNode, ctx: RenderContext, depth: number, extraMods: string[]): string[] {
  const spec = frame.container!
  const p1 = pad(depth + 1)
  const sizeLine = `Modifier.size(width = ${dp(frame.frame.w)}, height = ${dp(frame.frame.h)})${extraMods.join('')}`
  for (const i of SIZE_IMPORTS) ctx.imports.add(i)
  const fill = firstSolidFillColor(frame.fills)
  const plain: FrameNode = { ...frame, fills: [], strokes: [], cornerRadius: 0, clipsContent: false, container: undefined }
  const padding = frame.layout.padding
  const paddingValues = `PaddingValues(start = ${dp(padding.left)}, top = ${dp(padding.top)}, end = ${dp(padding.right)}, bottom = ${dp(padding.bottom)})`
  const gap = frame.layout.gap
  const items = (children: Node[], inner: number, divider: boolean): string[] => {
    const lines: string[] = []
    children.filter((c) => c.visible).forEach((child, index, all) => {
      const rendered = renderNode(child, ctx, inner + 1, [], false)
      lines.push(`${pad(inner)}item {`, ...(rendered ?? []), `${pad(inner)}}`)
      if (divider && index < all.length - 1) {
        ctx.imports.add('androidx.compose.material3.HorizontalDivider')
        lines.push(`${pad(inner)}item { HorizontalDivider() }`)
      }
    })
    return lines
  }

  switch (spec.kind) {
    case 'card': {
      ctx.imports.add('androidx.compose.material3.Card')
      ctx.imports.add('androidx.compose.material3.CardDefaults')
      ctx.imports.add('androidx.compose.foundation.shape.RoundedCornerShape')
      const stroke = firstStroke(frame.strokes)
      const args = [
        `modifier = ${sizeLine}`,
        `shape = RoundedCornerShape(${dp(frame.cornerRadius)})`,
        `elevation = CardDefaults.cardElevation(defaultElevation = ${dp(spec.elevation)})`,
      ]
      if (fill) args.push(`colors = CardDefaults.cardColors(containerColor = ${composeColorExpr(fill, ctx.tokens, ctx)})`), ctx.imports.add('androidx.compose.ui.graphics.Color')
      if (stroke) {
        ctx.imports.add('androidx.compose.foundation.BorderStroke')
        ctx.imports.add('androidx.compose.ui.graphics.Color')
        args.push(`border = BorderStroke(${dp(stroke.width)}, ${composeColorExpr(stroke.color, ctx.tokens, ctx)})`)
      }
      return [`${pad(depth)}Card(`, ...args.map((a) => `${p1}${a},`), `${pad(depth)}) {`, ...renderFrame(plain, ctx, depth + 1, []), `${pad(depth)}}`]
    }
    case 'listView': {
      const horizontal = spec.axis === 'horizontal'
      const widget = horizontal ? 'LazyRow' : 'LazyColumn'
      ctx.imports.add(`androidx.compose.foundation.lazy.${widget}`)
      ctx.imports.add('androidx.compose.foundation.layout.Arrangement')
      ctx.imports.add('androidx.compose.foundation.layout.PaddingValues')
      return [
        `${pad(depth)}${widget}(`,
        `${p1}modifier = ${sizeLine},`,
        `${p1}${horizontal ? 'horizontalArrangement' : 'verticalArrangement'} = Arrangement.spacedBy(${dp(gap)}),`,
        `${p1}contentPadding = ${paddingValues},`,
        `${pad(depth)}) {`,
        ...items(frame.children, depth + 1, spec.dividers && !horizontal),
        `${pad(depth)}}`,
      ]
    }
    case 'grid': {
      ctx.imports.add('androidx.compose.foundation.lazy.grid.LazyVerticalGrid')
      ctx.imports.add('androidx.compose.foundation.lazy.grid.GridCells')
      ctx.imports.add('androidx.compose.foundation.layout.Arrangement')
      ctx.imports.add('androidx.compose.foundation.layout.PaddingValues')
      return [
        `${pad(depth)}LazyVerticalGrid(`,
        `${p1}columns = GridCells.Fixed(${spec.columns}),`,
        `${p1}modifier = ${sizeLine},`,
        `${p1}verticalArrangement = Arrangement.spacedBy(${dp(gap)}),`,
        `${p1}horizontalArrangement = Arrangement.spacedBy(${dp(gap)}),`,
        `${p1}contentPadding = ${paddingValues},`,
        `${pad(depth)}) {`,
        ...items(frame.children, depth + 1, false),
        `${pad(depth)}}`,
      ]
    }
    case 'scrollView': {
      const horizontal = spec.axis === 'horizontal'
      ctx.imports.add('androidx.compose.foundation.layout.Box')
      ctx.imports.add('androidx.compose.foundation.rememberScrollState')
      ctx.imports.add(horizontal ? 'androidx.compose.foundation.horizontalScroll' : 'androidx.compose.foundation.verticalScroll')
      // Le contenu prend la taille de ses enfants (au moins celle de la zone) :
      // c'est ce qui permet le defilement.
      const kids = frame.children.filter((c) => c.visible)
      const abs = frame.layout.mode === 'absolute'
      const along = (n: Node) => (horizontal ? n.frame.w : n.frame.h)
      const extent = abs
        ? Math.max(...kids.map((c) => (horizontal ? c.frame.x + c.frame.w : c.frame.y + c.frame.h)), 0)
        : kids.reduce((sum, c) => sum + along(c), 0) + gap * Math.max(kids.length - 1, 0) + (horizontal ? padding.left + padding.right : padding.top + padding.bottom)
      const content: FrameNode = {
        ...plain,
        frame: horizontal ? { ...frame.frame, w: Math.max(frame.frame.w, extent) } : { ...frame.frame, h: Math.max(frame.frame.h, extent) },
      }
      return [
        `${pad(depth)}Box(`,
        `${p1}modifier = ${sizeLine}.${horizontal ? 'horizontalScroll' : 'verticalScroll'}(rememberScrollState()),`,
        `${pad(depth)}) {`,
        ...renderFrame(content, ctx, depth + 1, []),
        `${pad(depth)}}`,
      ]
    }
    case 'safeArea': {
      ctx.imports.add('androidx.compose.foundation.layout.Box')
      ctx.imports.add('androidx.compose.foundation.layout.safeDrawingPadding')
      return [`${pad(depth)}Box(modifier = ${sizeLine}.safeDrawingPadding()) {`, ...renderFrame(plain, ctx, depth + 1, []), `${pad(depth)}}`]
    }
    case 'bottomSheet': {
      ctx.experimental = true
      for (const i of ['androidx.compose.material3.ModalBottomSheet', 'androidx.compose.runtime.getValue', 'androidx.compose.runtime.mutableStateOf', 'androidx.compose.runtime.remember', 'androidx.compose.runtime.setValue']) ctx.imports.add(i)
      const i = ++ctx.counter
      return [
        `${pad(depth)}var showSheet${i} by remember { mutableStateOf(true) }`,
        `${pad(depth)}if (showSheet${i}) {`,
        `${p1}ModalBottomSheet(onDismissRequest = { showSheet${i} = false }) {`,
        ...renderFrame(plain, ctx, depth + 2, []),
        `${p1}}`,
        `${pad(depth)}}`,
      ]
    }
    case 'drawer': {
      ctx.imports.add('androidx.compose.material3.ModalDrawerSheet')
      return [`${pad(depth)}ModalDrawerSheet(modifier = ${sizeLine}) {`, ...renderFrame({ ...plain, fills: [] }, ctx, depth + 1, []), `${pad(depth)}}`]
    }
  }
}

function renderNode(node: Node, ctx: RenderContext, depth: number, extraMods: string[], inFlex = false): string[] | null {
  if (!node.visible) return null

  if (node.type === 'component') {
    const modifier = componentModifier(node, ctx, extraMods, SELF_LINKING.has(node.kind))
    return renderComposeComponent(node, envOf(ctx, inFlex), depth, modifier)
  }
  if (node.type === 'frame' && node.container !== undefined) {
    return renderContainer(node, ctx, depth, [...extraMods, ...linkMods(node, ctx)])
  }

  if (!PREVIEW_SUPPORTED_NODE_TYPES.has(node.type)) {
    ctx.warnings.push(unsupportedNodeWarning(node.type, EXPORTER_ID))
    return null
  }

  // Important 1 : contrairement a Flutter et React Native, ce generateur
  // `preview` n'implemente ni `.alpha()` ni `.rotate()` -- jamais perdu en
  // silence, meme si le type de noeud lui-meme est couvert.
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

function newContext(tokens: DesignTokens, warnings: string[], plan: ExportPlan): RenderContext {
  return {
    tokens,
    warnings,
    imports: new Set(['androidx.compose.runtime.Composable']),
    plan,
    counter: 0,
    usesNavigation: false,
    experimental: false,
  }
}

function fileHeader(ctx: RenderContext, packageName: string | null): string[] {
  const sortedImports = Array.from(ctx.imports).sort()
  return [...(packageName ? [`package ${packageName}`, ''] : []), ...sortedImports.map((i) => `import ${i}`), '']
}

function renderPage(page: Page, tokens: DesignTokens, warnings: string[], functionName: string, plan: ExportPlan): ExportedFile {
  const ctx = newContext(tokens, warnings, plan)

  const topLevel = page.nodes.map((n) => renderNode(n, ctx, 1, [])).filter((l): l is string[] => l !== null)

  if (topLevel.length !== 1) ctx.imports.add('androidx.compose.foundation.layout.Column')
  const bodyLines =
    topLevel.length === 1 ? topLevel[0]! : ['    Column {', ...topLevel.flat(), '    }']

  const lines = [
    ...fileHeader(ctx, 'screens'),
    '@Composable',
    `fun ${functionName}() {`,
    ...bodyLines,
    '}',
    '',
  ]

  return { path: `src/main/kotlin/screens/${functionName}.kt`, contents: lines.join('\n') }
}

// Un ecran Compose : un Scaffold (topBar, bottomBar, floatingActionButton),
// enveloppe d'un ModalNavigationDrawer quand le design a un tiroir. Le corps
// est positionne depuis le bas de la barre d'application (innerPadding).
function renderScreen(screen: FrameNode, tokens: DesignTokens, warnings: string[], functionName: string, plan: ExportPlan): ExportedFile {
  const ctx = newContext(tokens, warnings, plan)
  const parts: ScreenParts = splitScreen(screen)
  const env = envOf(ctx, false)
  for (const i of ['androidx.compose.material3.Scaffold', 'androidx.compose.ui.Modifier', 'androidx.compose.foundation.layout.fillMaxSize', 'androidx.compose.foundation.layout.padding', 'androidx.navigation.NavController']) ctx.imports.add(i)
  ctx.usesNavigation = true // le NavController est un parametre de tout ecran

  const hasDrawer = parts.drawer !== null
  const drawerOpen = hasDrawer ? 'scope.launch { drawerState.open() }' : null
  const baseDepth = hasDrawer ? 2 : 1
  const pa = pad(baseDepth)
  const pb = pad(baseDepth + 1)

  const scaffoldArgs: string[] = []
  if (parts.appBar) scaffoldArgs.push(`topBar = {\n${renderTopAppBar(parts.appBar, env, baseDepth + 2, null, drawerOpen).join('\n')}\n${pb}}`)
  if (parts.bottomNav) {
    scaffoldArgs.push(`bottomBar = {\n${renderComposeComponent(parts.bottomNav, env, baseDepth + 2, 'Modifier').join('\n')}\n${pb}}`)
  }
  if (parts.fab) {
    scaffoldArgs.push(`floatingActionButton = {\n${renderComposeComponent(parts.fab, env, baseDepth + 2, 'Modifier').join('\n')}\n${pb}}`)
    if (Math.abs(parts.fab.frame.x + parts.fab.frame.w / 2 - screen.frame.w / 2) < 24) {
      ctx.imports.add('androidx.compose.material3.FabPosition')
      scaffoldArgs.push('floatingActionButtonPosition = FabPosition.Center')
    }
  }
  const fill = firstSolidFillColor(screen.fills)
  if (fill) {
    ctx.imports.add('androidx.compose.ui.graphics.Color')
    scaffoldArgs.push(`containerColor = ${composeColorExpr(fill, tokens, ctx)}`)
  }

  // Corps.
  const bodyChildren = parts.body
  const bodyLines: string[] = []
  if (screen.layout.mode === 'absolute') {
    ctx.imports.add('androidx.compose.foundation.layout.Box')
    ctx.imports.add('androidx.compose.foundation.layout.offset')
    ctx.imports.add('androidx.compose.ui.unit.dp')
    bodyLines.push(`${pb}Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {`)
    for (const child of bodyChildren) {
      const offset = `.offset(x = ${dp(child.frame.x)}, y = ${dp(child.frame.y - parts.topInset)})`
      bodyLines.push(...(renderNode(child, ctx, baseDepth + 2, [offset]) ?? []))
    }
    bodyLines.push(`${pb}}`)
  } else {
    const content: FrameNode = { ...screen, fills: [], children: bodyChildren }
    bodyLines.push(...renderFrame(content, ctx, baseDepth + 1, ['.padding(innerPadding)']))
  }

  const scaffold = [
    `${pa}Scaffold(`,
    ...scaffoldArgs.map((a) => `${pb}${a},`),
    `${pa}) { innerPadding ->`,
    ...bodyLines,
    `${pa}}`,
  ]

  let body: string[]
  if (hasDrawer) {
    for (const i of ['androidx.compose.material3.ModalNavigationDrawer', 'androidx.compose.material3.DrawerValue', 'androidx.compose.material3.rememberDrawerState', 'androidx.compose.runtime.rememberCoroutineScope', 'kotlinx.coroutines.launch']) ctx.imports.add(i)
    const drawerContent = renderFrame({ ...parts.drawer!, fills: [], strokes: [], cornerRadius: 0, container: undefined }, ctx, 3, [])
    ctx.imports.add('androidx.compose.material3.ModalDrawerSheet')
    body = [
      '    val drawerState = rememberDrawerState(DrawerValue.Closed)',
      '    val scope = rememberCoroutineScope()',
      '    ModalNavigationDrawer(',
      '        drawerState = drawerState,',
      '        drawerContent = {',
      '            ModalDrawerSheet {',
      ...drawerContent.map((l) => pad(1) + l),
      '            }',
      '        },',
      '    ) {',
      ...scaffold,
      '    }',
    ]
  } else {
    body = scaffold
  }

  if (ctx.experimental) ctx.imports.add('androidx.compose.material3.ExperimentalMaterial3Api')
  const lines = [
    ...fileHeader(ctx, 'screens'),
    ...(ctx.experimental ? ['@OptIn(ExperimentalMaterial3Api::class)'] : []),
    '@Composable',
    `fun ${functionName}(navController: NavController) {`,
    ...body,
    '}',
    '',
  ]
  return { path: `src/main/kotlin/screens/${functionName}.kt`, contents: lines.join('\n') }
}

// Navigation Compose : un NavHost, une destination par ecran (nom de fichier
// en snake_case), l'ecran actif (ou le premier) en destination de depart.
function generateNavigation(plan: ExportPlan): ExportedFile {
  const lines = [
    'import androidx.compose.runtime.Composable',
    'import androidx.navigation.compose.NavHost',
    'import androidx.navigation.compose.composable',
    'import androidx.navigation.compose.rememberNavController',
    ...plan.screens.map((s) => `import screens.${s.pascal}`),
    '',
    '@Composable',
    'fun AppNavigation() {',
    '    val navController = rememberNavController()',
    `    NavHost(navController = navController, startDestination = ${kotlinString(plan.initial!.snake)}) {`,
    ...plan.screens.map((s) => `        composable(${kotlinString(s.snake)}) { ${s.pascal}(navController) }`),
    '    }',
    '}',
    '',
  ]
  return { path: 'src/main/kotlin/AppNavigation.kt', contents: lines.join('\n') }
}

function generateActivity(): ExportedFile {
  const lines = [
    'import android.os.Bundle',
    'import androidx.activity.ComponentActivity',
    'import androidx.activity.compose.setContent',
    'import androidx.compose.material3.MaterialTheme',
    '',
    'class MainActivity : ComponentActivity() {',
    '    override fun onCreate(savedInstanceState: Bundle?) {',
    '        super.onCreate(savedInstanceState)',
    '        setContent {',
    '            MaterialTheme {',
    '                AppNavigation()',
    '            }',
    '        }',
    '    }',
    '}',
    '',
  ]
  return { path: 'src/main/kotlin/MainActivity.kt', contents: lines.join('\n') }
}

function exportCompose(doc: CalqueDocument, opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: ExportedFile[] = []
  const plan = planExport(doc, opts.activeScreenId)

  for (const unit of plan.units) {
    if (unit.kind === 'page') {
      files.push(renderPage(layoutPage(unit.page), doc.tokens, warnings, unit.names.pascal, plan))
      continue
    }
    const laidOut = layoutPage({ ...unit.page, nodes: [unit.screen] }).nodes[0] as FrameNode
    files.push(renderScreen(laidOut, doc.tokens, warnings, unit.ref.pascal, plan))
  }

  if (plan.initial !== null) files.push(generateNavigation(plan), generateActivity())

  return { files, warnings }
}

export const composeExporter: Exporter = {
  id: 'compose',
  label: 'Jetpack Compose',
  maturity: 'preview',
  export: exportCompose,
}
