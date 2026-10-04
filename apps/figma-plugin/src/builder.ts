// Rejoue un plan (mapping.ts) dans Figma : ecrans, textes (avec leurs polices),
// formes, images, auto-layout, composants a variantes et instances.
import type { Bundle, ComponentPlan, Plan, PlanNode, PlanPrim, RGBA, Stroke } from './mapping'
import { weightStyleCandidates } from './mapping'

export type BuildReport = {
  screens: number
  nodes: number
  components: number
  componentSets: number
  images: number
  fontFallbacks: string[]
  warnings: string[]
}

type Fonts = Map<string, FontName>
type Hashes = Map<string, string>
type Ctx = {
  figma: PluginAPI
  fonts: Fonts
  hashes: Hashes
  components: Map<string, ComponentNode>
  report: BuildReport
  // Identifiant Calque -> noeud Figma (sert aux reactions de prototype).
  created: Map<string, SceneNode>
}

const paint = (c: RGBA): SolidPaint => ({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a })
const min1 = (v: number) => Math.max(0.01, v)

// Charge la police demandee ; a defaut un style voisin de la meme famille,
// puis Inter Regular. Rend le choix reel (et note le repli dans le rapport).
export async function loadFont(figma: PluginAPI, family: string, weight: number, report: BuildReport): Promise<FontName> {
  const candidates: FontName[] = [
    ...weightStyleCandidates(weight).map((style) => ({ family, style })),
    ...(weight === 400 ? [] : weightStyleCandidates(400).map((style) => ({ family, style }))),
  ]
  for (const font of candidates) {
    try {
      await figma.loadFontAsync(font)
      if (font.style !== weightStyleCandidates(weight)[0]) report.fontFallbacks.push(`${family} ${weight} → ${font.family} ${font.style}`)
      return font
    } catch {
      // police ou style indisponible : on essaie le suivant
    }
  }
  const fallback: FontName = { family: 'Inter', style: weight >= 600 ? 'Bold' : 'Regular' }
  await figma.loadFontAsync(fallback)
  report.fontFallbacks.push(`${family} ${weight} → Inter ${fallback.style}`)
  return fallback
}

function fontFor(ctx: Ctx, family: string, weight: number): FontName {
  return ctx.fonts.get(`${family}|${weight}`) ?? { family: 'Inter', style: 'Regular' }
}

function setStroke(node: GeometryMixin & MinimalStrokesMixin, stroke: Stroke | null) {
  if (stroke === null) {
    node.strokes = []
    return
  }
  node.strokes = [paint(stroke.color)]
  node.strokeWeight = stroke.width
  node.strokeAlign = 'INSIDE'
}

function makeText(ctx: Ctx, p: { x: number; y: number; w: number; h: number; text: string; size: number; weight: number; family: string; color: RGBA; align: 'LEFT' | 'CENTER' | 'RIGHT'; lineHeight?: number; letterSpacing?: number; name: string }): TextNode {
  const t = ctx.figma.createText()
  t.fontName = fontFor(ctx, p.family, p.weight)
  t.characters = p.text
  t.fontSize = p.size
  if (p.lineHeight !== undefined && p.lineHeight > 0) t.lineHeight = { value: p.lineHeight, unit: 'PIXELS' }
  if (p.letterSpacing) t.letterSpacing = { value: p.letterSpacing, unit: 'PIXELS' }
  t.textAlignHorizontal = p.align
  t.textAlignVertical = 'CENTER'
  t.textAutoResize = 'NONE'
  t.resize(min1(p.w), min1(p.h))
  t.fills = [paint(p.color)]
  t.name = p.name
  t.x = p.x
  t.y = p.y
  return t
}

function imageRect(ctx: Ctx, src: string, w: number, h: number, fit: 'FILL' | 'FIT'): RectangleNode {
  const r = ctx.figma.createRectangle()
  r.resize(min1(w), min1(h))
  const hash = ctx.hashes.get(src)
  r.fills = hash === undefined ? [paint({ r: 0.906, g: 0.878, b: 0.925, a: 1 })] : [{ type: 'IMAGE', imageHash: hash, scaleMode: fit }]
  if (hash === undefined) setStroke(r, { color: { r: 0.79, g: 0.77, b: 0.82, a: 1 }, width: 1 })
  return r
}

function primNode(ctx: Ctx, p: PlanPrim): SceneNode {
  switch (p.t) {
    case 'rect': {
      const r = ctx.figma.createRectangle()
      r.resize(min1(p.w), min1(p.h))
      r.x = p.x
      r.y = p.y
      r.cornerRadius = p.r
      r.fills = p.fill === null ? [] : [paint(p.fill)]
      setStroke(r, p.stroke)
      r.name = p.name
      return r
    }
    case 'ellipse': {
      const e = ctx.figma.createEllipse()
      e.resize(min1(p.w), min1(p.h))
      e.x = p.x
      e.y = p.y
      e.fills = p.fill === null ? [] : [paint(p.fill)]
      setStroke(e, p.stroke)
      e.name = p.name
      return e
    }
    case 'line': {
      const l = ctx.figma.createLine()
      const dx = p.x2 - p.x1
      const dy = p.y2 - p.y1
      l.resize(min1(Math.hypot(dx, dy)), 0)
      const t = Math.atan2(dy, dx)
      l.relativeTransform = [
        [Math.cos(t), -Math.sin(t), p.x1],
        [Math.sin(t), Math.cos(t), p.y1],
      ]
      l.strokes = [paint(p.color)]
      l.strokeWeight = p.width
      l.name = 'trait'
      return l
    }
    case 'text':
      return makeText(ctx, { ...p, family: 'Roboto', name: p.slot })
    case 'image': {
      const r = imageRect(ctx, p.src, p.w, p.h, p.fit)
      r.x = p.x
      r.y = p.y
      r.cornerRadius = p.radius
      r.name = 'image'
      return r
    }
  }
}

type Placeable = FrameNode | RectangleNode | EllipseNode | LineNode | TextNode | InstanceNode

function place(node: Placeable, plan: PlanNode, inAutoLayout: boolean) {
  node.name = plan.name
  node.opacity = plan.opacity
  node.visible = plan.visible
  node.locked = plan.locked
  if (inAutoLayout) return
  if (plan.transform !== undefined) {
    const [[a, c, tx], [b, d, ty]] = plan.transform
    node.relativeTransform = [
      [a, c, tx],
      [b, d, ty],
    ]
  } else {
    node.x = plan.x
    node.y = plan.y
  }
}

async function createNode(ctx: Ctx, plan: PlanNode, parent: (ChildrenMixin & { layoutMode?: string }) | null): Promise<SceneNode> {
  ctx.report.nodes += 1
  const inAuto = parent !== null && 'layoutMode' in parent && parent.layoutMode !== undefined && parent.layoutMode !== 'NONE'
  let node: Placeable
  switch (plan.kind) {
    case 'frame': {
      const f = ctx.figma.createFrame()
      f.resize(min1(plan.w), min1(plan.h))
      f.fills = plan.fill === null ? [] : [paint(plan.fill)]
      setStroke(f, plan.stroke)
      f.cornerRadius = plan.radius
      f.clipsContent = plan.clips
      if (plan.layout !== null) {
        const l = plan.layout
        f.layoutMode = l.mode
        f.primaryAxisSizingMode = 'FIXED'
        f.counterAxisSizingMode = 'FIXED'
        f.itemSpacing = l.gap
        f.paddingTop = l.padding.top
        f.paddingRight = l.padding.right
        f.paddingBottom = l.padding.bottom
        f.paddingLeft = l.padding.left
        f.primaryAxisAlignItems = l.primary
        f.counterAxisAlignItems = l.counter
      }
      for (const p of plan.decorUnder) f.appendChild(primNode(ctx, p))
      for (const child of plan.children) {
        const n = await createNode(ctx, child, f)
        f.appendChild(n)
        if (plan.layout?.stretch === true) (n as FrameNode).layoutAlign = 'STRETCH'
      }
      for (const p of plan.decorOver) {
        const n = primNode(ctx, p)
        f.appendChild(n)
        if (plan.layout !== null) (n as FrameNode).layoutPositioning = 'ABSOLUTE'
      }
      node = f
      break
    }
    case 'rect': {
      const r = ctx.figma.createRectangle()
      r.resize(min1(plan.w), min1(plan.h))
      r.cornerRadius = plan.radius
      r.fills = plan.fill === null ? [] : [paint(plan.fill)]
      setStroke(r, plan.stroke)
      node = r
      break
    }
    case 'ellipse': {
      const e = ctx.figma.createEllipse()
      e.resize(min1(plan.w), min1(plan.h))
      e.fills = plan.fill === null ? [] : [paint(plan.fill)]
      setStroke(e, plan.stroke)
      node = e
      break
    }
    case 'line': {
      const l = ctx.figma.createLine()
      l.resize(min1(Math.hypot(plan.w, plan.h)), 0)
      l.strokes = [paint(plan.stroke.color)]
      l.strokeWeight = plan.stroke.width
      // Diagonale de la boite : angle (sens horaire, axes y vers le bas).
      const t = Math.atan2(plan.h, plan.w)
      l.relativeTransform = [
        [Math.cos(t), -Math.sin(t), plan.x],
        [Math.sin(t), Math.cos(t), plan.y],
      ]
      l.name = plan.name
      l.opacity = plan.opacity
      l.visible = plan.visible
      l.locked = plan.locked
      return l
    }
    case 'text': {
      const t = makeText(ctx, { x: plan.x, y: plan.y, w: plan.w, h: plan.h, text: plan.text, size: plan.fontSize, weight: plan.fontWeight, family: plan.fontFamily, color: plan.color, align: plan.align, lineHeight: plan.lineHeight, letterSpacing: plan.letterSpacing, name: plan.name })
      t.textAlignVertical = 'TOP'
      node = t
      break
    }
    case 'image': {
      node = plan.src === '' ? imageRect(ctx, '', plan.w, plan.h, plan.fit) : imageRect(ctx, plan.src, plan.w, plan.h, plan.fit)
      break
    }
    case 'instance': {
      const comp = ctx.components.get(plan.componentKey)
      if (comp === undefined) {
        const r = ctx.figma.createRectangle()
        r.resize(min1(plan.w), min1(plan.h))
        node = r
        break
      }
      const inst = comp.createInstance()
      for (const [slot, value] of Object.entries(plan.texts)) {
        const target = inst.findOne((n) => n.type === 'TEXT' && n.name === slot) as TextNode | null
        if (target !== null && target.characters !== value) {
          await ctx.figma.loadFontAsync(target.fontName as FontName)
          target.characters = value
        }
      }
      if (Math.abs(inst.width - plan.w) > 0.5 || Math.abs(inst.height - plan.h) > 0.5) inst.resize(min1(plan.w), min1(plan.h))
      node = inst
      break
    }
  }
  place(node, plan, inAuto)
  ctx.created.set(plan.sourceId, node)
  return node
}

async function buildComponents(ctx: Ctx, comps: ComponentPlan[]): Promise<{ x: number; y: number; w: number; h: number } | null> {
  if (comps.length === 0) return null
  const sets = new Map<string, ComponentPlan[]>()
  for (const c of comps) sets.set(c.setName, [...(sets.get(c.setName) ?? []), c])
  let y = 0
  let maxW = 0
  for (const [setName, variants] of sets) {
    const nodes: ComponentNode[] = []
    for (const v of variants) {
      const comp = ctx.figma.createComponent()
      comp.resize(min1(v.w), min1(v.h))
      comp.fills = []
      comp.name = v.variantName === '' ? setName : v.variantName
      for (const p of v.prims) comp.appendChild(primNode(ctx, p))
      ctx.components.set(v.key, comp)
      nodes.push(comp)
      ctx.report.components += 1
    }
    const container = ctx.figma.currentPage
    let bounds: { w: number; h: number }
    if (variants.length === 1 && variants[0]!.variantName === '') {
      container.appendChild(nodes[0]!)
      nodes[0]!.y = y
      bounds = { w: nodes[0]!.width, h: nodes[0]!.height }
    } else {
      // Variantes disposees en grille simple dans l'ensemble.
      nodes.forEach((n, i) => {
        container.appendChild(n)
        n.x = (i % 4) * (Math.max(...variants.map((v) => v.w)) + 24)
        n.y = Math.floor(i / 4) * (Math.max(...variants.map((v) => v.h)) + 24)
      })
      const set = ctx.figma.combineAsVariants(nodes, container)
      set.name = setName
      set.y = y
      ctx.report.componentSets += 1
      bounds = { w: set.width, h: set.height }
    }
    y += bounds.h + 48
    maxW = Math.max(maxW, bounds.w)
  }
  return { x: 0, y: 0, w: maxW, h: y }
}

export async function buildInFigma(figma: PluginAPI, plan: Plan, bundle: Bundle): Promise<{ report: BuildReport; screens: FrameNode[]; created: Map<string, SceneNode> }> {
  const report: BuildReport = { screens: 0, nodes: 0, components: 0, componentSets: 0, images: 0, fontFallbacks: [], warnings: [...plan.warnings] }
  const ctx: Ctx = { figma, fonts: new Map(), hashes: new Map(), components: new Map(), report, created: new Map() }

  for (const need of plan.fonts) {
    const key = `${need.family}|${need.weight}`
    if (!ctx.fonts.has(key)) ctx.fonts.set(key, await loadFont(figma, need.family, need.weight, report))
  }
  for (const src of plan.images) {
    const entry = bundle.images[src]
    if (entry === undefined) continue
    try {
      ctx.hashes.set(src, figma.createImage(figma.base64Decode(entry.data)).hash)
      report.images += 1
    } catch {
      report.warnings.push(`image « ${src} » illisible par Figma : remplacée par un cadre vide`)
    }
  }

  const compBounds = await buildComponents(ctx, plan.components)
  const minX = Math.min(0, ...plan.screens.map((s) => s.x))
  if (compBounds !== null) {
    // Les composants vivent a gauche des ecrans, jamais par-dessus.
    for (const c of figma.currentPage.children) if (c.type === 'COMPONENT' || c.type === 'COMPONENT_SET') c.x = minX - compBounds.w - 160
  }

  const screens: FrameNode[] = []
  for (const s of plan.screens) {
    const frame = (await createNode(ctx, s, null)) as FrameNode
    figma.currentPage.appendChild(frame)
    frame.x = s.x
    frame.y = s.y
    screens.push(frame)
    report.screens += 1
  }
  for (const l of plan.loose) figma.currentPage.appendChild(await createNode(ctx, l, null))
  return { report, screens, created: ctx.created }
}
