// Prototype d'application bancaire mobile « nacre » (marque FICTIVE, donnees
// manifestement fictives) : 16 ecrans de 390 x 844 plus la barre d'onglets,
// reproduits depuis la maquette de reference `fixtures/nacre/*.dc.html`.
//
// Chaine de fabrication : `mesurer.cjs` rend la maquette dans Electron et mesure
// chaque element, `convertir.mjs` en tire `nacre-spec.json` (arbre de frames,
// textes, pictogrammes et composants aux coordonnees mesurees). Ce fichier
// construit le document a partir de cette specification en passant UNIQUEMENT
// par les commandes du document (History : chaque etape est validee et
// annulable). Voir exemples/banque.maquio et test/integration/banque.test.ts.
import {
  History,
  createComponentNode,
  createContainerNode,
  createDocument,
  createNodeCommand,
  createScreenCommand,
  createScreenNode,
  setInteractionsCommand,
  setTokensCommand,
  withAutoLayout,
} from '@maquio/core'
import type { Color, ComponentKind, ComponentPropsMap, DevicePreset, FrameNode, IconName, Interaction, MaquioDocument, Node, Rect, TextNode, Transition } from '@maquio/core'
import canvas from './nacre/canvas.json'
import spec from './nacre/nacre-spec.json'

export const TELEPHONE: DevicePreset = { id: 'telephone-390', label: 'Téléphone 390 × 844', width: 390, height: 844, pixelRatio: 3 }

// --- Specification (forme de nacre-spec.json) ---
type Item = {
  t: 'frame' | 'text' | 'icon' | 'input' | 'tabbar' | 'switch' | 'progress' | 'chart'
  x?: number
  y?: number
  w?: number
  h?: number
  name?: string
  fill?: string
  alpha?: number
  radius?: number
  corners?: number[]
  ring?: { width: number; color: string; inset?: boolean } | null
  rot?: number
  opacity?: number
  clip?: boolean
  href?: string
  button?: boolean
  sheet?: boolean
  color?: string
  children?: Item[]
  // texte
  text?: string
  size?: number
  weight?: number
  ls?: number
  align?: 'left' | 'center' | 'right'
  lh?: number
  // champ
  value?: string | number
  placeholder?: string
  // onglets
  items?: { label: string; href?: string }[]
  selected?: number
  accent?: string
  // interrupteur
  on?: boolean
  label?: string
  // progression
  track?: string
  // courbe
  points?: [number, number][]
  width?: number
}
type Board = { w: number; h: number; fill: string; children: Item[] }
const BOARDS = spec as unknown as Record<string, Board>
const CANVAS = canvas as unknown as { boards: Record<string, { x: number; y: number; title: string }>; order: string[] }

// --- Outils ---
const color = (hex: string, alpha?: number): Color => {
  const h = hex.replace('#', '')
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
  return { r: v(0), g: v(2), b: v(4), a: alpha ?? 1 }
}
const ENCRE = '#0b0c10'
const ids = new Map<string, string>()
const screenId = (key: string): string => {
  if (!ids.has(key)) ids.set(key, `banque-${key}`)
  return ids.get(key)!
}

const push: Transition = { type: 'push', durationMs: 300, easing: 'easeInOut' }
const modal: Transition = { type: 'modal', durationMs: 350, easing: 'easeOut' }
const fade: Transition = { type: 'fade', durationMs: 350, easing: 'linear' }

// Transition d'une navigation : push par defaut, modale pour l'OTP et le code
// d'acces, fondu pour Bienvenue -> Code et pour le succes.
function transitionFor(from: string, to: string): Transition {
  if (to === 'Succes') return fade
  if (from === 'Bienvenue' && to === 'Connexion') return fade
  if (to === 'Recap') return modal
  if (to === 'Connexion') return modal
  if (to === 'Bienvenue') return fade
  return push
}

// Libelles « retour » : l'action revient a l'ecran precedent.
const BACK_LABELS = new Set(['Retour', 'Fermer'])

function interactionsOf(item: Item, board: string): Interaction[] {
  const out: Interaction[] = []
  if (item.href !== undefined && item.href !== board) {
    if (item.name !== undefined && BACK_LABELS.has(item.name)) out.push({ trigger: { type: 'tap' }, action: { type: 'back' }, transition: push })
    else out.push({ trigger: { type: 'tap' }, action: { type: 'navigate', target: screenId(item.href) }, transition: transitionFor(board, item.href) })
  }
  return out
}

const uid = (): string => crypto.randomUUID()
const baseNode = (name: string, frame: Rect) => ({ id: uid(), name, frame, visible: true, locked: false, opacity: 1, rotation: 0 })
const round = (n: number): number => Math.round(n * 10) / 10

function textNode(i: Item): TextNode {
  const w = i.w ?? 0
  const slack = 6
  const align = i.align ?? 'left'
  // Marge laterale : evite un retour a la ligne si la police de la cible est un peu plus large.
  const x = i.x ?? 0
  const frame: Rect =
    align === 'center' ? { x: round(x - slack / 2), y: i.y ?? 0, w: round(w + slack), h: i.h ?? 0 } : align === 'right' ? { x: round(x - slack), y: i.y ?? 0, w: round(w + slack), h: i.h ?? 0 } : { x, y: i.y ?? 0, w: round(w + slack), h: i.h ?? 0 }
  return {
    ...baseNode(i.text!.length > 28 ? `${i.text!.slice(0, 26)}…` : i.text!, frame),
    type: 'text',
    characters: i.text!,
    style: { fontFamily: 'Geist', fontSize: i.size ?? 15, fontWeight: i.weight ?? 400, lineHeight: i.lh ?? Math.round((i.size ?? 15) * 1.25), letterSpacing: i.ls ?? 0, color: color(i.color ?? ENCRE), align },
  }
}

function comp<K extends ComponentKind>(kind: K, name: string, frame: Rect, props: Partial<ComponentPropsMap[K]>, interactions: Interaction[] = []): Node {
  const node = createComponentNode(kind, frame, props as never, name) as Node
  return { ...node, ...(interactions.length > 0 ? { interactions } : {}) } as Node
}

// Texte blanc ou presque ? (libelle d'un bouton plein)
const isLight = (hex: string): boolean => {
  const c = color(hex)
  return c.r > 0.9 && c.g > 0.9 && c.b > 0.9
}

const TAB_ICONS: Record<string, IconName> = { Accueil: 'home', Paiements: 'swap', Cartes: 'card', Coffres: 'vault', Profil: 'person' }

function build(item: Item, board: string): Node[] {
  const rect = (): Rect => ({ x: item.x ?? 0, y: item.y ?? 0, w: item.w ?? 0, h: item.h ?? 0 })
  switch (item.t) {
    case 'text':
      return [textNode(item)]
    case 'icon':
      return [comp('icon', `Icône ${(item as unknown as { name: string }).name}`, { x: item.x ?? 0, y: item.y ?? 0, w: (item as unknown as { size: number }).size, h: (item as unknown as { size: number }).size }, { name: (item as unknown as { name: IconName }).name, size: (item as unknown as { size?: number }).size ?? item.w ?? 24, color: color(item.color ?? ENCRE) })]
    case 'tabbar':
      return [
        comp('bottomNav', 'Barre d’onglets', rect(), {
          items: item.items!.map((it) => ({ label: it.label, icon: TAB_ICONS[it.label] ?? 'home', ...(it.href !== undefined ? { target: screenId(it.href) } : {}) })),
          selectedIndex: Math.max(0, item.selected ?? 0),
          color: color(item.accent ?? '#4338ff'),
        }),
      ]
    case 'switch':
      return [comp('switch', `Interrupteur ${item.label}`, rect(), { label: item.label!, checked: !!item.on, disabled: false, color: color(item.color ?? '#4338ff') })]
    case 'progress':
      return [comp('progressBar', item.name ?? 'Progression', rect(), { value: item.value as number, indeterminate: false, color: color(item.color!), trackColor: color(item.track!) })]
    case 'chart': {
      // Graphique simple : une polyligne faite de segments (rectangles tournes).
      const pts = item.points!
      const out: Node[] = []
      for (let k = 0; k < pts.length - 1; k += 1) {
        const [x1, y1] = pts[k]!
        const [x2, y2] = pts[k + 1]!
        const len = Math.hypot(x2 - x1, y2 - y1)
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const th = item.width ?? 2.5
        out.push({
          ...baseNode(`Segment ${k + 1}`, { x: round(cx - len / 2), y: round(cy - th / 2), w: round(len), h: th }),
          rotation: round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI),
          type: 'rect',
          fills: [{ type: 'solid', color: color(item.color ?? '#4338ff') }],
          strokes: [],
          cornerRadius: th / 2,
        })
      }
      return out
    }
    case 'input': {
      // Champ en pilule : cadre + texte.
      const shown = (item.value as string) !== '' ? (item.value as string) : (item.placeholder ?? '')
      const isPlaceholder = (item.value as string) === ''
      const size = item.size ?? 15
      const th = Math.round(size * 1.3)
      const inner: TextNode = {
        ...baseNode(shown, { x: item.align === 'center' ? 0 : 18, y: Math.round(((item.h ?? 40) - th) / 2), w: item.align === 'center' ? item.w! : item.w! - 36, h: th }),
        type: 'text',
        characters: shown,
        style: { fontFamily: 'Geist', fontSize: size, fontWeight: 400, lineHeight: th, letterSpacing: 0, color: isPlaceholder ? color('#6b6f7b') : color(item.color ?? ENCRE), align: item.align === 'center' ? 'center' : 'left' },
      }
      return [frameNode({ ...item, t: 'frame', name: item.name }, board, [inner])]
    }
    case 'frame': {
      const children = (item.children ?? []).flatMap((c) => build(c, board))
      // Bouton plein : un seul texte clair sur fond uni et pilule.
      const only = item.children?.length === 1 && item.children[0]!.t === 'text' ? item.children[0]! : null
      if (only && item.fill && item.alpha === undefined && item.h! >= 44 && item.w! > item.h! * 2 && (item.radius ?? 0) >= item.h! / 2 - 1 && isLight(only.color ?? ENCRE) && !isLight(item.fill) && !item.rot) {
        return [comp('button', `Bouton ${only.text}`, rect(), { label: only.text!, variant: 'primary', disabled: false, color: color(item.fill), fontSize: only.size, fontWeight: only.weight, flat: true }, interactionsOf(item, board))]
      }
      return [frameNode(item, board, children)]
    }
  }
}

function frameNode(item: Item, board: string, children: Node[]): FrameNode {
  const frame: Rect = { x: item.x ?? 0, y: item.y ?? 0, w: item.w ?? 0, h: item.h ?? 0 }
  const name = item.name ?? (item.fill ? 'Bloc' : 'Zone')
  const white = item.fill === '#ffffff' && item.alpha === undefined && (item.radius ?? 0) >= 20 && (item.h ?? 0) > 40 && children.length > 0
  const base: FrameNode = item.sheet
    ? createContainerNode('bottomSheet', { ...frame, h: frame.h + 28 }, { handle: false } as never, name)
    : white
      ? createContainerNode('card', frame, { elevation: 0 } as never, name)
      : { ...baseNode(name, frame), type: 'frame', layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' }, fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [] }
  const interactions = interactionsOf(item, board)
  // Anneau interieur (CSS inset) : le trait de Maquio est centre sur le bord, on rentre le cadre.
  const inset = item.ring?.inset === true ? item.ring.width / 2 : 0
  return {
    ...base,
    id: uid(),
    frame: { x: round(frame.x + inset), y: round(frame.y + inset), w: round(frame.w - 2 * inset), h: round(frame.h - 2 * inset) },
    fills: item.fill ? [{ type: 'solid', color: color(item.fill, item.alpha) }] : [{ type: 'none' }],
    strokes: item.ring ? [{ color: color(item.ring.color), width: item.ring.width }] : [],
    cornerRadius: item.sheet ? 28 : Math.max(0, (item.radius ?? 0) - inset),
    clipsContent: !!item.clip || !!item.sheet,
    rotation: item.rot ?? 0,
    opacity: item.opacity ?? 1,
    layout: { ...base.layout, mode: 'absolute' },
    children,
    ...(interactions.length > 0 ? { interactions } : {}),
  }
}

const ORDER = CANVAS.order.map((f) => f.replace('.dc.html', '')).filter((k) => k in BOARDS)

export const BANQUE_ECRANS = (): string[] => [...ORDER.map((k) => CANVAS.boards[`${k}.dc.html`]!.title), CANVAS.boards['TabBar.dc.html']!.title]

export function documentBanque(): MaquioDocument {
  const base = createDocument('Nacre', TELEPHONE)
  const pageId = base.pages[0]!.id
  const history = new History(base)
  const run = (cmd: Parameters<typeof withAutoLayout>[0]) => history.execute(withAutoLayout(cmd))

  // Jetons de design de la marque : couleurs et typographie.
  const typo = (size: number, weight: number, ls: number) => ({ fontFamily: 'Geist', fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.25), letterSpacing: ls, color: color('#0b0c10'), align: 'left' as const })
  run(
    setTokensCommand({
      colors: { fond: color('#f4f5f7'), carte: color('#ffffff'), encre: color('#0b0c10'), secondaire: color('#6b6f7b'), accent: color('#4338ff'), accentLeger: color('#e8eafe'), positif: color('#0b8a5c'), negatif: color('#d93644') },
      typography: { titre: typo(30, 800, -0.6), montant: typo(48, 800, -1.4), corps: typo(15, 500, 0), legende: typo(13, 500, 0) },
      spacing: { s: 8, m: 16, l: 20 },
    }),
  )

  for (const key of ORDER) {
    const board = BOARDS[key]!
    const geo = CANVAS.boards[`${key}.dc.html`]!
    const screen: FrameNode = { ...createScreenNode(geo.title, TELEPHONE, { x: geo.x, y: geo.y, w: board.w, h: board.h }), id: screenId(key), fills: [{ type: 'solid', color: color(board.fill) }] }
    run(createScreenCommand(pageId, screen))
    // Chaque element est cree PAR COMMANDE dans son ecran (annulable, valide).
    for (const item of board.children) for (const node of build(item, key)) run(createNodeCommand(pageId, screen.id, node))
  }

  // Composant « barre d'onglets » : une barre seule sous les ecrans (documentation).
  const tabGeo = CANVAS.boards['TabBar.dc.html']!
  const tabScreen: FrameNode = { ...createScreenNode(tabGeo.title, TELEPHONE, { x: tabGeo.x, y: tabGeo.y, w: 390, h: 96 }), id: screenId('TabBar'), fills: [{ type: 'solid', color: color('#ffffff') }] }
  run(createScreenCommand(pageId, tabScreen))
  const tabs = BOARDS.Main!.children.find((c) => c.t === 'tabbar')!
  run(createNodeCommand(pageId, tabScreen.id, build({ ...tabs, x: 0, y: 0 }, 'TabBar')[0]!))

  // La touche « reconnaissance faciale » du pave ouvre l'accueil.
  const connexion = history.document.pages[0]!.nodes.find((n) => n.id === screenId('Connexion'))!
  const face = findDeep(connexion, (n) => n.name === 'Reconnaissance faciale')
  if (face !== undefined) run(setInteractionsCommand(pageId, face.id, [{ trigger: { type: 'tap' }, action: { type: 'navigate', target: screenId('Main') }, transition: fade }]))
  return stabiliser(history.document)
}

function findDeep(node: Node, pred: (n: Node) => boolean): Node | undefined {
  if (pred(node)) return node
  if (node.type === 'frame') {
    for (const c of node.children) {
      const r = findDeep(c, pred)
      if (r) return r
    }
  }
  return undefined
}

// Identifiants STABLES (`bq-1`...) : le fichier livre doit etre reproductible
// octet pour octet. Les cibles de navigation et de barre basse suivent.
function stabiliser(doc: MaquioDocument): MaquioDocument {
  const map = new Map<string, string>()
  let n = 0
  const renum = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      const nid = `bq-${++n}`
      map.set(node.id, nid)
      return node.type === 'frame' ? { ...node, id: nid, children: renum(node.children) } : ({ ...node, id: nid } as Node)
    })
  const retarget = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      let next: Node = node
      if (next.interactions) {
        next = { ...next, interactions: next.interactions.map((i) => ('target' in i.action && i.action.target ? { ...i, action: { ...i.action, target: map.get(i.action.target) ?? i.action.target } } : i)) as Interaction[] }
      }
      if (next.type === 'component' && next.kind === 'bottomNav') {
        const items = (next.props.items as { target?: string }[]).map((it) => (it.target === undefined ? it : { ...it, target: map.get(it.target) ?? it.target }))
        next = { ...next, props: { ...next.props, items } } as Node
      }
      return next.type === 'frame' ? { ...next, children: retarget(next.children) } : next
    })
  const page = doc.pages[0]!
  return { ...doc, id: 'exemple-banque', pages: [{ ...page, id: 'page-1', nodes: retarget(renum(page.nodes)) }] }
}
