// Traduction PURE d'un export Calque (bundle `.figma.json` ou document
// `.calque`) en un « plan » de creation Figma. Aucun appel a l'API Figma ici :
// le plan est teste unitairement, builder.ts le rejoue ensuite dans Figma.
import { componentSketch, componentVariant, containerSketch, hexOf, parseDocument } from '@calque/core'
import type { CalqueDocument, Color, ComponentNode, FrameNode, Interaction, Node, SketchPrim, Transition, Trigger } from '@calque/core'

export type RGBA = { r: number; g: number; b: number; a: number }
export type Stroke = { color: RGBA; width: number }

type Common = {
  name: string
  sourceId: string
  x: number
  y: number
  w: number
  h: number
  opacity: number
  visible: boolean
  locked: boolean
  // Matrice Figma [[a, c, tx], [b, d, ty]] quand le noeud est pivote (autour de son centre).
  transform?: [[number, number, number], [number, number, number]]
}

export type AutoLayout = {
  mode: 'HORIZONTAL' | 'VERTICAL'
  gap: number
  padding: { top: number; right: number; bottom: number; left: number }
  primary: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counter: 'MIN' | 'CENTER' | 'MAX'
  stretch: boolean
}

export type PlanNode =
  | (Common & { kind: 'frame'; fill: RGBA | null; stroke: Stroke | null; radius: number; clips: boolean; layout: AutoLayout | null; isScreen: boolean; children: PlanNode[]; decorUnder: PlanPrim[]; decorOver: PlanPrim[] })
  | (Common & { kind: 'rect'; fill: RGBA | null; stroke: Stroke | null; radius: number })
  | (Common & { kind: 'ellipse'; fill: RGBA | null; stroke: Stroke | null })
  | (Common & { kind: 'line'; stroke: Stroke })
  | (Common & {
      kind: 'text'
      text: string
      fontFamily: string
      fontWeight: number
      fontSize: number
      lineHeight: number
      letterSpacing: number
      color: RGBA
      align: 'LEFT' | 'CENTER' | 'RIGHT'
    })
  | (Common & { kind: 'image'; src: string; fit: 'FILL' | 'FIT' })
  | (Common & { kind: 'instance'; componentKey: string; texts: Record<string, string> })

// Primitive d'un composant (coordonnees locales), couleurs deja en RGBA.
export type PlanPrim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: RGBA | null; stroke: Stroke | null; name: string }
  | { t: 'ellipse'; x: number; y: number; w: number; h: number; fill: RGBA | null; stroke: Stroke | null; name: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: RGBA; width: number }
  | { t: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; weight: number; color: RGBA; align: 'LEFT' | 'CENTER' | 'RIGHT'; slot: string }
  | { t: 'image'; x: number; y: number; w: number; h: number; src: string; fit: 'FILL' | 'FIT'; radius: number }

export type ComponentPlan = {
  key: string
  setName: string
  // « propriete=valeur, propriete=valeur » (vide : composant sans variante).
  variantName: string
  w: number
  h: number
  prims: PlanPrim[]
}

export type FontNeed = { family: string; weight: number }

// --- Prototype (reactions Figma) ---

export type PlanEasing = { type: 'LINEAR' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'BOUNCY' }
export type PlanTransition =
  | { type: 'DISSOLVE'; duration: number; easing: PlanEasing }
  | { type: 'MOVE_IN' | 'PUSH'; direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'; matchLayers: boolean; duration: number; easing: PlanEasing }

export type PlanTrigger = { type: 'ON_CLICK' } | { type: 'MOUSE_DOWN'; delay: number } | { type: 'AFTER_TIMEOUT'; timeout: number }

export type PlanAction =
  | { type: 'NODE'; navigation: 'NAVIGATE'; destination: string; transition: PlanTransition | null }
  | { type: 'NODE'; navigation: 'OVERLAY'; destination: string; transition: PlanTransition | null }
  | { type: 'BACK' }
  | { type: 'CLOSE' }
  | { type: 'URL'; url: string }

export type ReactionPlan = { source: string; trigger: PlanTrigger; action: PlanAction }

// Overlay (dialogue, feuille basse, snackbar) : un cadre Figma a part, destination des actions « overlay ».
export type OverlayFrame = { id: string; kind: 'dialog' | 'bottomSheet' | 'snackbar'; frame: Extract<PlanNode, { kind: 'frame' }> }

export type Plan = {
  projectName: string
  startScreenId: string | null
  screens: Extract<PlanNode, { kind: 'frame' }>[]
  // Noeuds de premier niveau qui ne sont pas des frames (formes libres) : poses sur la page.
  loose: PlanNode[]
  components: ComponentPlan[]
  reactions: ReactionPlan[]
  overlays: OverlayFrame[]
  fonts: FontNeed[]
  images: string[]
  warnings: string[]
}

export type Bundle = {
  document: CalqueDocument
  images: Record<string, { mime: string; data: string }>
  projectName: string
  startScreenId: string | null
}

// --- Lecture ---

export class BundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleError'
  }
}

// Accepte un bundle `.figma.json` (format « calque-figma ») ou un document
// `.calque` brut (sans images). Toute autre forme est refusee avec un message
// clair, sans rien creer dans Figma.
export function parseBundle(text: string): Bundle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BundleError("Ce fichier n'est pas du JSON valide.")
  }
  if (typeof raw !== 'object' || raw === null) throw new BundleError('Format de fichier non reconnu.')
  const o = raw as Record<string, unknown>
  try {
    if (o['format'] === 'calque-figma') {
      if (typeof o['version'] !== 'number' || o['version'] > 1) throw new BundleError("Ce fichier vient d'une version plus récente de Calque : mettez à jour le plugin.")
      const document = parseDocument(JSON.stringify(o['document']))
      const images = (typeof o['images'] === 'object' && o['images'] !== null ? o['images'] : {}) as Bundle['images']
      return { document, images, projectName: typeof o['projectName'] === 'string' ? o['projectName'] : document.name, startScreenId: typeof o['startScreenId'] === 'string' ? o['startScreenId'] : null }
    }
    if ('pages' in o && 'version' in o) {
      const document = parseDocument(text)
      return { document, images: {}, projectName: document.name, startScreenId: null }
    }
  } catch (e) {
    if (e instanceof BundleError) throw e
    throw new BundleError(`Document Calque invalide : ${e instanceof Error ? e.message.slice(0, 160) : 'erreur inconnue'}`)
  }
  throw new BundleError("Ce fichier n'est ni un export « Figma » de Calque (.figma.json) ni un document .calque.")
}

// --- Couleurs, trait ---

export const rgba = (c: Color): RGBA => ({ r: c.r, g: c.g, b: c.b, a: c.a })

export function rgbaFromHex(hex: string): RGBA {
  const h = hex.replace('#', '')
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
  return { r: n(0), g: n(2), b: n(4), a: h.length >= 8 ? n(6) : 1 }
}

function solidFill(fills: { type: string; color?: Color }[]): RGBA | null {
  const f = fills.find((x) => x.type === 'solid' && x.color !== undefined)
  return f?.color === undefined ? null : rgba(f.color)
}

function firstStroke(strokes: { color: Color; width: number }[]): Stroke | null {
  const s = strokes[0]
  return s === undefined || s.width <= 0 ? null : { color: rgba(s.color), width: s.width }
}

// --- Rotation ---

// Calque : degres, sens horaire, autour du centre. Figma : matrice de
// transformation relative au parent (axes y vers le bas, comme CSS).
export function rotationTransform(x: number, y: number, w: number, h: number, degrees: number): [[number, number, number], [number, number, number]] | undefined {
  if (degrees === 0) return undefined
  const t = (degrees * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const cx = x + w / 2
  const cy = y + h / 2
  return [
    [c, -s, cx - (c * (w / 2) - s * (h / 2))],
    [s, c, cy - (s * (w / 2) + c * (h / 2))],
  ]
}

// --- Auto-layout ---

export function autoLayoutOf(frame: FrameNode): AutoLayout | null {
  const l = frame.layout
  if (l.mode === 'absolute') return null
  if (frame.container?.kind === 'grid') return null // pas d'equivalent : positions deja materialisees
  return {
    mode: l.mode === 'row' ? 'HORIZONTAL' : 'VERTICAL',
    gap: l.alignMain === 'space-between' ? 0 : l.gap,
    padding: { ...l.padding },
    primary: l.alignMain === 'start' ? 'MIN' : l.alignMain === 'center' ? 'CENTER' : l.alignMain === 'end' ? 'MAX' : 'SPACE_BETWEEN',
    counter: l.alignCross === 'center' ? 'CENTER' : l.alignCross === 'end' ? 'MAX' : 'MIN',
    stretch: l.alignCross === 'stretch',
  }
}

// --- Plan ---

export function weightStyleCandidates(weight: number): string[] {
  const w = Math.round(weight / 100) * 100
  switch (w) {
    case 100: return ['Thin', 'Hairline']
    case 200: return ['ExtraLight', 'Extra Light', 'UltraLight']
    case 300: return ['Light']
    case 500: return ['Medium']
    case 600: return ['SemiBold', 'Semi Bold', 'DemiBold', 'Demi Bold']
    case 700: return ['Bold']
    case 800: return ['ExtraBold', 'Extra Bold', 'UltraBold']
    case 900: return ['Black', 'Heavy']
    default: return ['Regular', 'Normal', 'Book']
  }
}

const alignOf = (a: 'left' | 'center' | 'right'): 'LEFT' | 'CENTER' | 'RIGHT' => (a === 'center' ? 'CENTER' : a === 'right' ? 'RIGHT' : 'LEFT')

export function primToPlan(p: SketchPrim): PlanPrim {
  switch (p.t) {
    case 'rect':
      return { t: 'rect', x: p.x, y: p.y, w: p.w, h: p.h, r: p.r ?? 0, fill: p.fill === undefined ? null : rgbaFromHex(p.fill), stroke: p.stroke === undefined ? null : { color: rgbaFromHex(p.stroke.color), width: p.stroke.width }, name: p.name ?? 'forme' }
    case 'ellipse':
      return { t: 'ellipse', x: p.x, y: p.y, w: p.w, h: p.h, fill: p.fill === undefined ? null : rgbaFromHex(p.fill), stroke: p.stroke === undefined ? null : { color: rgbaFromHex(p.stroke.color), width: p.stroke.width }, name: p.name ?? 'forme' }
    case 'line':
      return { t: 'line', x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, color: rgbaFromHex(p.color), width: p.width }
    case 'text':
      return { t: 'text', x: p.x, y: p.y, w: p.w, h: p.h, text: p.text, size: p.size, weight: p.weight, color: rgbaFromHex(p.color), align: alignOf(p.align), slot: p.slot ?? 'texte' }
    case 'image':
      return { t: 'image', x: p.x, y: p.y, w: p.w, h: p.h, src: p.src, fit: p.fit === 'contain' ? 'FIT' : 'FILL', radius: p.radius ?? 0 }
  }
}

// Slots de texte d'un composant -> valeur courante (ce qui varie d'une instance a l'autre).
export function textSlots(prims: SketchPrim[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of prims) if (p.t === 'text' && p.slot !== undefined) out[p.slot] = p.text
  return out
}

type Builder = {
  warnings: string[]
  fonts: Map<string, FontNeed>
  images: Set<string>
  // composants : cle -> plan ; (setName|variantName) -> tailles distinctes vues
  components: Map<string, ComponentPlan>
  sizesByVariant: Map<string, Set<string>>
  // Noeuds ouverts comme overlay par une interaction : masques en place (ils vivent dans leur propre cadre).
  overlayIds: Set<string>
}

function need(b: Builder, family: string, weight: number) {
  b.fonts.set(`${family}|${weight}`, { family, weight })
}

function visitPrims(b: Builder, prims: PlanPrim[]) {
  for (const p of prims) {
    if (p.t === 'text') need(b, 'Roboto', p.weight)
    if (p.t === 'image') b.images.add(p.src)
  }
}

function componentKey(node: ComponentNode, sizeInName: boolean): { key: string; variantName: string; setName: string } {
  const v = componentVariant(node)
  const props = Object.entries(v.properties).map(([k, val]) => `${k}=${val}`)
  if (sizeInName) props.push(`taille=${Math.round(node.frame.w)}×${Math.round(node.frame.h)}`)
  const variantName = props.join(', ')
  return { key: `${v.setName}|${variantName}`, variantName, setName: v.setName }
}

function mapNode(node: Node, b: Builder): PlanNode {
  const f = node.frame
  const common: Common = {
    name: node.name,
    sourceId: node.id,
    x: f.x,
    y: f.y,
    w: f.w,
    h: f.h,
    opacity: node.opacity,
    visible: node.visible && !b.overlayIds.has(node.id),
    locked: node.locked,
    ...(node.rotation !== 0 ? { transform: rotationTransform(f.x, f.y, f.w, f.h, node.rotation) } : {}),
  }
  switch (node.type) {
    case 'frame': {
      const sk = containerSketch(node)
      const under = sk.under.map(primToPlan)
      const over = sk.over.map(primToPlan)
      visitPrims(b, [...under, ...over])
      return {
        ...common,
        kind: 'frame',
        fill: solidFill(node.fills),
        stroke: firstStroke(node.strokes),
        radius: node.cornerRadius,
        clips: node.clipsContent,
        layout: autoLayoutOf(node),
        isScreen: node.device !== undefined,
        children: node.children.map((c) => mapNode(c, b)),
        decorUnder: under,
        decorOver: over,
      }
    }
    case 'rect':
      return { ...common, kind: 'rect', fill: solidFill(node.fills), stroke: firstStroke(node.strokes), radius: node.cornerRadius }
    case 'ellipse':
      return { ...common, kind: 'ellipse', fill: solidFill(node.fills), stroke: firstStroke(node.strokes) }
    case 'line':
      return { ...common, kind: 'line', stroke: { color: rgba(node.stroke.color), width: node.stroke.width } }
    case 'text': {
      need(b, node.style.fontFamily, node.style.fontWeight)
      return {
        ...common,
        kind: 'text',
        text: node.characters,
        fontFamily: node.style.fontFamily,
        fontWeight: node.style.fontWeight,
        fontSize: node.style.fontSize,
        lineHeight: node.style.lineHeight,
        letterSpacing: node.style.letterSpacing,
        color: rgba(node.style.color),
        align: alignOf(node.style.align),
      }
    }
    case 'image': {
      if (node.src !== '') b.images.add(node.src)
      return { ...common, kind: 'image', src: node.src, fit: node.fit === 'contain' ? 'FIT' : 'FILL' }
    }
    case 'component': {
      const sketch = componentSketch(node)
      const sizeKey = `${Math.round(f.w)}x${Math.round(f.h)}`
      const base = componentKey(node, false)
      const seen = b.sizesByVariant.get(base.key) ?? new Set<string>()
      seen.add(sizeKey)
      b.sizesByVariant.set(base.key, seen)
      // La cle finale depend du nombre de tailles distinctes : resolue apres le parcours (voir finalizeComponents).
      return { ...common, kind: 'instance', componentKey: `${base.key}@${sizeKey}`, texts: textSlots(sketch) }
    }
  }
}

// Une fois toutes les tailles connues : un composant par (variante, taille) ;
// la taille entre dans le nom de variante seulement quand elle differe.
function finalizeComponents(doc: CalqueDocument, plan: PlanNode[], b: Builder) {
  const nodesById = new Map<string, ComponentNode>()
  const collect = (ns: Node[]) => {
    for (const n of ns) {
      if (n.type === 'component') {
        nodesById.set(n.id, n)
        nodesById.set(`overlay:${n.id}`, n)
      }
      if (n.type === 'frame') collect(n.children)
    }
  }
  doc.pages.forEach((p) => collect(p.nodes))

  const rename = (n: PlanNode) => {
    if (n.kind === 'instance') {
      const src = nodesById.get(n.sourceId)!
      const base = componentKey(src, false)
      const sizes = b.sizesByVariant.get(base.key)!
      const withSize = sizes.size > 1
      const k = componentKey(src, withSize)
      n.componentKey = k.key
      if (!b.components.has(k.key)) {
        const prims = componentSketch(src).map(primToPlan)
        visitPrims(b, prims)
        b.components.set(k.key, { key: k.key, setName: k.setName, variantName: k.variantName, w: src.frame.w, h: src.frame.h, prims })
      }
    }
    if (n.kind === 'frame') n.children.forEach(rename)
  }
  plan.forEach(rename)
}

// --- Interactions -> reactions de prototype ---

function overlayTargets(doc: CalqueDocument): Set<string> {
  const out = new Set<string>()
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      for (const i of n.interactions ?? []) if (i.action.type === 'openOverlay') out.add(i.action.target)
      if (n.type === 'frame') visit(n.children)
    }
  }
  doc.pages.forEach((p) => visit(p.nodes))
  return out
}

const EASINGS: Record<string, PlanEasing> = {
  linear: { type: 'LINEAR' },
  easeIn: { type: 'EASE_IN' },
  easeOut: { type: 'EASE_OUT' },
  easeInOut: { type: 'EASE_IN_AND_OUT' },
  spring: { type: 'BOUNCY' },
}

// Transition Calque -> transition Figma. `direction` Figma est le cote d'ou
// ENTRE l'ecran : un glissement « vers la gauche » entre par la droite.
export function transitionOf(t: Transition): PlanTransition | null {
  if (t.type === 'none') return null
  const timing = { duration: t.durationMs / 1000, easing: EASINGS[t.easing]! }
  switch (t.type) {
    case 'fade':
      return { type: 'DISSOLVE', ...timing }
    case 'modal':
      return { type: 'MOVE_IN', direction: 'BOTTOM', matchLayers: false, ...timing }
    case 'push':
      return { type: 'PUSH', direction: 'RIGHT', matchLayers: false, ...timing }
    case 'slide': {
      const from = { left: 'RIGHT', right: 'LEFT', up: 'BOTTOM', down: 'TOP' } as const
      return { type: 'MOVE_IN', direction: from[t.direction], matchLayers: false, ...timing }
    }
  }
}

export function triggerOf(t: Trigger): PlanTrigger {
  switch (t.type) {
    case 'tap':
      return { type: 'ON_CLICK' }
    case 'longPress':
      // Figma n'a pas d'appui long : « souris enfoncee » apres 0,5 s.
      return { type: 'MOUSE_DOWN', delay: 0.5 }
    case 'afterDelay':
      return { type: 'AFTER_TIMEOUT', timeout: t.ms / 1000 }
  }
}

export function actionOf(i: Interaction): PlanAction {
  const a = i.action
  switch (a.type) {
    case 'navigate':
      return { type: 'NODE', navigation: 'NAVIGATE', destination: a.target, transition: transitionOf(i.transition) }
    case 'openOverlay':
      return { type: 'NODE', navigation: 'OVERLAY', destination: `overlay:${a.target}`, transition: transitionOf(i.transition) }
    case 'back':
      return { type: 'BACK' }
    case 'closeOverlay':
      return { type: 'CLOSE' }
    case 'openUrl':
      return { type: 'URL', url: a.url }
  }
}

function collectReactions(doc: CalqueDocument): ReactionPlan[] {
  const out: ReactionPlan[] = []
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      for (const i of n.interactions ?? []) out.push({ source: n.id, trigger: triggerOf(i.trigger), action: actionOf(i) })
      if (n.type === 'frame') visit(n.children)
    }
  }
  doc.pages.forEach((p) => visit(p.nodes))
  return out
}

function buildOverlayFrames(doc: CalqueDocument, b: Builder): OverlayFrame[] {
  const byId = new Map<string, { node: Node; kind: OverlayFrame['kind'] }>()
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      for (const i of n.interactions ?? []) if (i.action.type === 'openOverlay') byId.set(i.action.target, { node: n, kind: i.action.overlay })
      if (n.type === 'frame') visit(n.children)
    }
  }
  doc.pages.forEach((p) => visit(p.nodes))
  const find = (nodes: Node[], id: string): Node | null => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.type === 'frame') {
        const r = find(n.children, id)
        if (r) return r
      }
    }
    return null
  }
  const frames: OverlayFrame[] = []
  for (const [id, { kind }] of byId) {
    const node = doc.pages.map((p) => find(p.nodes, id)).find((n): n is Node => n !== null && n !== undefined)
    if (node === undefined) continue
    // Copie a l'origine, sous un autre id (l'original est masque en place).
    const copy = { ...node, id: `overlay:${id}`, visible: true, frame: { ...node.frame, x: 0, y: 0 } } as Node
    const mapped = mapNode(copy, b)
    frames.push({
      id,
      kind,
      frame: {
        kind: 'frame', name: `Overlay · ${node.name}`, sourceId: `overlay:${id}:frame`, x: 0, y: 0, w: node.frame.w, h: node.frame.h,
        opacity: 1, visible: true, locked: false, fill: null, stroke: null, radius: 0, clips: false, layout: null, isScreen: false,
        children: [mapped], decorUnder: [], decorOver: [],
      },
    })
  }
  return frames
}

export function buildPlan(bundle: Bundle): Plan {
  const b: Builder = { warnings: [], fonts: new Map(), images: new Set(), components: new Map(), sizesByVariant: new Map(), overlayIds: overlayTargets(bundle.document) }
  const screens: Plan['screens'] = []
  const loose: PlanNode[] = []
  const all: PlanNode[] = []
  for (const page of bundle.document.pages) {
    for (const node of page.nodes) {
      const mapped = mapNode(node, b)
      all.push(mapped)
      if (mapped.kind === 'frame') screens.push(mapped)
      else {
        loose.push(mapped)
        b.warnings.push(`« ${node.name} » est hors d'un écran : créé directement sur la page Figma`)
      }
    }
  }
  const overlays = buildOverlayFrames(bundle.document, b)
  all.push(...overlays.map((o) => o.frame))
  finalizeComponents(bundle.document, all, b)
  for (const src of b.images) {
    if (/^https?:\/\//.test(src)) b.warnings.push(`image distante « ${src} » : remplacée par un cadre vide (le plugin n'accède pas au réseau)`)
    else if (bundle.images[src] === undefined) b.warnings.push(`image « ${src} » absente du fichier : remplacée par un cadre vide`)
  }
  return {
    projectName: bundle.projectName,
    startScreenId: bundle.startScreenId,
    screens,
    loose,
    components: [...b.components.values()],
    reactions: collectReactions(bundle.document),
    overlays,
    fonts: [...b.fonts.values()],
    images: [...b.images].filter((s) => bundle.images[s] !== undefined),
    warnings: b.warnings,
  }
}

export { hexOf }
