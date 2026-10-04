// « Croquis » vectoriel des composants mobiles : chaque composant et chaque
// conteneur est decrit par une liste de primitives (rectangles, ellipses,
// textes, traits) en coordonnees LOCALES (0,0 = coin du noeud). Une seule
// description, partagee par les exports qui ne peuvent pas executer du code
// natif : SVG par ecran et plugin Figma (ou chaque composant devient un vrai
// composant, avec variantes). Style Material 3, comme le canevas.
import type { Color, ComponentNode, FrameNode } from '../model/types'
import type { ComponentKind } from '../components/props'
import type { IconName } from '../components/icons'

export const M3 = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondaryContainer: '#E8DEF8',
  surface: '#FEF7FF',
  surfaceContainer: '#F3EDF7',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#B3261E',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F5EFF7',
  disabledFg: '#1D1B2061',
  disabledBg: '#1D1B201F',
} as const

// Couleur « #rrggbb » ou « #rrggbbaa ».
export type Hex = string

export type SketchPrim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: Hex; stroke?: { color: Hex; width: number }; name?: string }
  | { t: 'ellipse'; x: number; y: number; w: number; h: number; fill?: Hex; stroke?: { color: Hex; width: number }; name?: string }
  | {
      t: 'text'
      x: number
      y: number
      w: number
      h: number
      text: string
      size: number
      weight: number
      color: Hex
      align: 'left' | 'center' | 'right'
      // Nom de l'emplacement de texte : permet de remplacer le texte sur une
      // instance de composant Figma sans toucher a sa structure.
      slot?: string
    }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: Hex; width: number }
  | { t: 'image'; x: number; y: number; w: number; h: number; src: string; fit: 'cover' | 'contain' | 'fill'; radius?: number }

export function hexOf(c: Color): Hex {
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a < 1 ? h(c.a) : ''}`
}

export const ICON_GLYPHS: Record<IconName, string> = {
  home: '⌂',
  search: '⌕',
  menu: '☰',
  add: '+',
  close: '✕',
  check: '✓',
  arrowBack: '←',
  arrowForward: '→',
  chevronRight: '›',
  chevronDown: '⌄',
  settings: '⚙',
  person: '☺',
  favorite: '♥',
  star: '★',
  delete: '✖',
  edit: '✎',
  share: '⇪',
  moreVert: '⋮',
  info: 'i',
  notifications: '♪',
  email: '✉',
  phone: '☎',
  lock: '⚿',
  calendar: '▦',
  cart: '⛒',
  send: '➤',
  refresh: '↻',
  warning: '!',
  location: '⌖',
  list: '≣',
  face: '☻',
  backspace: '⌫',
  swap: '⇄',
  moreHoriz: '⋯',
  card: '▭',
  vault: '▤',
  copy: '⧉',
  coffee: '☕',
  shield: '⛨',
  shieldCheck: '⛨',
  arrowUp: '↑',
  arrowDown: '↓',
  eye: '◉',
  snowflake: '❄',
  sliders: '≡',
  plane: '✈',
  bike: '⚲',
  document: '▯',
  globe: '◍',
  contrast: '◐',
  smartphone: '▯',
  logout: '⇥',
  chevronLeft: '‹',
  upload: '⇧',
}

function icon(name: IconName, x: number, y: number, size: number, color: Hex): SketchPrim {
  return { t: 'text', x, y, w: size, h: size, text: ICON_GLYPHS[name], size: Math.round(size * 0.9), weight: 400, color, align: 'center' }
}

function label(text: string, x: number, y: number, w: number, h: number, size: number, color: Hex, o: { weight?: number; align?: 'left' | 'center' | 'right'; slot?: string } = {}): SketchPrim {
  return { t: 'text', x, y, w, h, text, size, weight: o.weight ?? 400, color, align: o.align ?? 'left', ...(o.slot !== undefined ? { slot: o.slot } : {}) }
}

// Dimensions « de reference » du composant : celles d'un exemplaire de
// composant Figma (les variantes d'un meme ensemble partagent leur cadre).
export function componentSketch(node: ComponentNode): SketchPrim[] {
  const { w, h } = node.frame
  const main = (c: Color | undefined): Hex => (c === undefined ? M3.primary : hexOf(c))
  const out: SketchPrim[] = []
  switch (node.kind) {
    case 'button': {
      const p = node.props
      const fg = p.disabled ? M3.disabledFg : p.variant === 'primary' ? M3.onPrimary : main(p.color)
      if (p.variant === 'primary') out.push({ t: 'rect', x: 0, y: 0, w, h, r: h / 2, fill: p.disabled ? M3.disabledBg : main(p.color), name: 'fond' })
      else if (p.variant === 'secondary') out.push({ t: 'rect', x: 0, y: 0, w, h, r: h / 2, stroke: { color: p.disabled ? M3.disabledBg : M3.outline, width: 1 }, name: 'contour' })
      const pad = p.icon !== undefined ? 36 : 0
      if (p.icon !== undefined) out.push(icon(p.icon, 16, (h - 18) / 2, 18, fg))
      out.push(label(p.label, pad, 0, w - pad, h, p.fontSize ?? 14, fg, { weight: p.fontWeight ?? 500, align: 'center', slot: 'label' }))
      break
    }
    case 'iconButton': {
      const p = node.props
      const fg = p.disabled ? M3.disabledFg : p.variant === 'filled' ? M3.onPrimary : p.variant === 'outlined' ? M3.onSurfaceVariant : main(p.color)
      if (p.variant === 'filled') out.push({ t: 'ellipse', x: 0, y: 0, w, h, fill: p.disabled ? M3.disabledBg : main(p.color) })
      if (p.variant === 'outlined') out.push({ t: 'ellipse', x: 0, y: 0, w, h, stroke: { color: M3.outline, width: 1 } })
      out.push(icon(p.icon, (w - 24) / 2, (h - 24) / 2, 24, fg))
      break
    }
    case 'fab': {
      const p = node.props
      const r = p.size === 'large' ? 28 : p.size === 'small' ? 12 : 16
      out.push({ t: 'rect', x: 0, y: 0, w, h, r, fill: p.color === undefined ? M3.primaryContainer : hexOf(p.color), name: 'fond' })
      const s = p.size === 'large' ? 36 : 24
      out.push(icon(p.icon, p.label === '' ? (w - s) / 2 : 16, (h - s) / 2, s, M3.onPrimaryContainer))
      if (p.label !== '') out.push(label(p.label, 52, 0, w - 60, h, 14, M3.onPrimaryContainer, { weight: 500, slot: 'label' }))
      break
    }
    case 'textField': {
      const p = node.props
      const support = p.errorText !== '' || p.helperText !== ''
      const fh = support ? Math.max(h - 20, 40) : h
      const err = p.errorText !== ''
      const border = err ? M3.error : p.disabled ? M3.disabledBg : M3.outline
      out.push({ t: 'rect', x: 0, y: 0, w, h: fh, r: 4, stroke: { color: border, width: 1 }, name: 'contour' })
      const lead = p.leadingIcon !== undefined ? 36 : 0
      if (p.leadingIcon !== undefined) out.push(icon(p.leadingIcon, 12, (fh - 20) / 2, 20, M3.onSurfaceVariant))
      if (p.label !== '') out.push(label(p.label, 12 + lead, -8, Math.min(w - 24, p.label.length * 7 + 8), 14, 12, err ? M3.error : M3.onSurfaceVariant, { slot: 'label' }))
      const shown = p.value !== '' ? (p.password ? '•'.repeat(Math.max(p.value.length, 1)) : p.value) : p.placeholder
      out.push(label(shown, 16 + lead, 0, w - 32 - lead, fh, 16, p.value !== '' ? M3.onSurface : M3.onSurfaceVariant, { slot: 'value' }))
      if (support) out.push(label(err ? p.errorText : p.helperText, 16, fh + 4, w - 32, 16, 12, err ? M3.error : M3.onSurfaceVariant, { slot: 'support' }))
      break
    }
    case 'checkbox': {
      const p = node.props
      const c = p.disabled ? M3.disabledFg : M3.primary
      out.push(p.checked ? { t: 'rect', x: 0, y: (h - 18) / 2, w: 18, h: 18, r: 2, fill: c } : { t: 'rect', x: 0, y: (h - 18) / 2, w: 18, h: 18, r: 2, stroke: { color: M3.onSurfaceVariant, width: 2 } })
      if (p.checked) out.push(icon('check', 0, (h - 18) / 2, 18, M3.onPrimary))
      out.push(label(p.label, 30, 0, w - 30, h, 14, p.disabled ? M3.disabledFg : M3.onSurface, { slot: 'label' }))
      break
    }
    case 'switch': {
      const p = node.props
      const tw = 52
      const th = 32
      const ty = (h - th) / 2
      const on = p.checked
      out.push({ t: 'rect', x: w - tw, y: ty, w: tw, h: th, r: 16, fill: on ? main(p.color) : M3.surfaceContainer, stroke: on ? undefined : { color: M3.outline, width: 2 }, name: 'piste' })
      out.push({ t: 'ellipse', x: on ? w - tw + 24 : w - tw + 6, y: ty + (on ? 4 : 8), w: on ? 24 : 16, h: on ? 24 : 16, fill: on ? M3.onPrimary : M3.outline, name: 'curseur' })
      out.push(label(p.label, 0, 0, w - tw - 8, h, 14, p.disabled ? M3.disabledFg : M3.onSurface, { slot: 'label' }))
      break
    }
    case 'radio': {
      const p = node.props
      const y = (h - 20) / 2
      out.push({ t: 'ellipse', x: 0, y, w: 20, h: 20, stroke: { color: p.selected ? M3.primary : M3.onSurfaceVariant, width: 2 } })
      if (p.selected) out.push({ t: 'ellipse', x: 5, y: y + 5, w: 10, h: 10, fill: M3.primary })
      out.push(label(p.label, 30, 0, w - 30, h, 14, p.disabled ? M3.disabledFg : M3.onSurface, { slot: 'label' }))
      break
    }
    case 'slider': {
      const p = node.props
      const f = (p.value - p.min) / (p.max - p.min)
      const y = h / 2
      out.push({ t: 'rect', x: 0, y: y - 2, w, h: 4, r: 2, fill: M3.secondaryContainer, name: 'piste' })
      out.push({ t: 'rect', x: 0, y: y - 2, w: Math.max(4, w * f), h: 4, r: 2, fill: p.disabled ? M3.disabledFg : M3.primary, name: 'actif' })
      out.push({ t: 'ellipse', x: Math.min(w - 20, Math.max(0, w * f - 10)), y: y - 10, w: 20, h: 20, fill: p.disabled ? M3.disabledFg : M3.primary, name: 'poignee' })
      break
    }
    case 'dropdown': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: 4, stroke: { color: M3.outline, width: 1 }, name: 'contour' })
      const shown = p.selectedIndex >= 0 ? (p.options[p.selectedIndex] ?? '') : p.label
      out.push(label(shown, 16, 0, w - 52, h, 16, p.selectedIndex >= 0 ? M3.onSurface : M3.onSurfaceVariant, { slot: 'value' }))
      out.push(icon('chevronDown', w - 36, (h - 24) / 2, 24, M3.onSurfaceVariant))
      break
    }
    case 'datePicker': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: 4, stroke: { color: M3.outline, width: 1 }, name: 'contour' })
      out.push(label(p.value !== '' ? p.value : p.label, 16, 0, w - 52, h, 16, p.value !== '' ? M3.onSurface : M3.onSurfaceVariant, { slot: 'value' }))
      out.push(icon('calendar', w - 36, (h - 24) / 2, 24, M3.onSurfaceVariant))
      break
    }
    case 'icon': {
      const p = node.props
      out.push(icon(p.name, (w - p.size) / 2, (h - p.size) / 2, p.size, p.color === undefined ? M3.onSurface : hexOf(p.color)))
      break
    }
    case 'avatar': {
      const p = node.props
      if (p.src !== '') out.push({ t: 'image', x: 0, y: 0, w, h, src: p.src, fit: 'cover', radius: Math.min(w, h) / 2 })
      else {
        out.push({ t: 'ellipse', x: 0, y: 0, w, h, fill: p.color === undefined ? M3.primaryContainer : hexOf(p.color) })
        out.push(label(p.initials, 0, 0, w, h, Math.round(h * 0.4), M3.onPrimaryContainer, { weight: 500, align: 'center', slot: 'initials' }))
      }
      break
    }
    case 'badge': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: h / 2, fill: p.color === undefined ? M3.error : hexOf(p.color) })
      if (p.text !== '') out.push(label(p.text, 0, 0, w, h, 11, '#FFFFFF', { weight: 500, align: 'center', slot: 'label' }))
      break
    }
    case 'chip': {
      const p = node.props
      const sel = p.selected
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: 8, fill: sel ? M3.secondaryContainer : undefined, stroke: sel ? undefined : { color: M3.outline, width: 1 } })
      const lead = p.icon !== undefined ? 26 : sel && p.variant === 'filter' ? 26 : 0
      if (p.icon !== undefined) out.push(icon(p.icon, 8, (h - 18) / 2, 18, M3.onSurfaceVariant))
      else if (sel && p.variant === 'filter') out.push(icon('check', 8, (h - 18) / 2, 18, M3.onSurfaceVariant))
      out.push(label(p.label, 12 + lead, 0, w - 16 - lead, h, 14, M3.onSurfaceVariant, { weight: 500, align: 'center', slot: 'label' }))
      break
    }
    case 'divider': {
      const p = node.props
      const c = p.color === undefined ? M3.outlineVariant : hexOf(p.color)
      out.push(p.vertical ? { t: 'line', x1: w / 2, y1: p.indent, x2: w / 2, y2: h, color: c, width: p.thickness } : { t: 'line', x1: p.indent, y1: h / 2, x2: w, y2: h / 2, color: c, width: p.thickness })
      break
    }
    case 'progressBar': {
      const p = node.props
      const th = Math.max(2, Math.min(h, 16))
      out.push({ t: 'rect', x: 0, y: (h - th) / 2, w, h: th, r: th / 2, fill: p.trackColor === undefined ? M3.secondaryContainer : hexOf(p.trackColor) })
      out.push({ t: 'rect', x: 0, y: (h - th) / 2, w: Math.max(th, w * (p.indeterminate ? 0.4 : p.value)), h: th, r: th / 2, fill: main(p.color) })
      break
    }
    case 'spinner': {
      const d = Math.min(w, h)
      out.push({ t: 'ellipse', x: (w - d) / 2, y: (h - d) / 2, w: d, h: d, stroke: { color: main(node.props.color), width: 4 } })
      break
    }
    case 'listTile': {
      const p = node.props
      const lead = p.leadingIcon !== undefined ? 56 : 16
      if (p.leadingIcon !== undefined) out.push(icon(p.leadingIcon, 16, (h - 24) / 2, 24, M3.onSurfaceVariant))
      const trail = p.trailingIcon !== undefined ? 40 : 16
      if (p.subtitle !== '') {
        out.push(label(p.title, lead, 8, w - lead - trail, 24, 16, M3.onSurface, { slot: 'title' }))
        out.push(label(p.subtitle, lead, 32, w - lead - trail, 20, 14, M3.onSurfaceVariant, { slot: 'subtitle' }))
      } else out.push(label(p.title, lead, 0, w - lead - trail, h, 16, M3.onSurface, { slot: 'title' }))
      if (p.trailingIcon !== undefined) out.push(icon(p.trailingIcon, w - 40, (h - 24) / 2, 24, M3.onSurfaceVariant))
      break
    }
    case 'spacer':
      break
    case 'appBar': {
      const p = node.props
      const bg = p.color === undefined ? M3.surface : hexOf(p.color)
      out.push({ t: 'rect', x: 0, y: 0, w, h, fill: bg, name: 'fond' })
      if (p.leading !== 'none') out.push(icon(p.leading === 'back' ? 'arrowBack' : 'menu', 12, (h - 24) / 2, 24, M3.onSurface))
      const acts = p.actions.length * 40
      const startX = p.leading === 'none' ? 16 : 56
      out.push(label(p.title, startX, 0, w - startX - acts - 8, h, 22, M3.onSurface, { align: p.centerTitle ? 'center' : 'left', slot: 'title' }))
      p.actions.forEach((a, i) => out.push(icon(a, w - 8 - (p.actions.length - i) * 40 + 8, (h - 24) / 2, 24, M3.onSurfaceVariant)))
      break
    }
    case 'bottomNav': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, fill: p.color === undefined ? M3.surfaceContainer : '#ffffff', name: 'fond' })
      const cw = w / p.items.length
      p.items.forEach((it, i) => {
        const sel = i === p.selectedIndex
        const accent = p.color === undefined ? undefined : hexOf(p.color)
        if (sel && accent === undefined) out.push({ t: 'rect', x: i * cw + cw / 2 - 32, y: 12, w: 64, h: 32, r: 16, fill: M3.secondaryContainer })
        out.push(icon(it.icon, i * cw + cw / 2 - 12, 16, 24, sel ? (accent ?? M3.onPrimaryContainer) : M3.onSurfaceVariant))
        out.push(label(it.label, i * cw, 48, cw, 16, 12, sel ? (accent ?? M3.onSurface) : M3.onSurfaceVariant, { weight: sel ? 700 : 500, align: 'center', slot: `item${i}` }))
      })
      break
    }
    case 'tabs': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, fill: M3.surface })
      const cw = w / p.items.length
      p.items.forEach((it, i) => {
        const sel = i === p.selectedIndex
        out.push(label(it.label, i * cw, 0, cw, h - 3, 14, sel ? M3.primary : M3.onSurfaceVariant, { weight: 500, align: 'center', slot: `item${i}` }))
        if (sel) out.push({ t: 'rect', x: i * cw + 8, y: h - 3, w: cw - 16, h: 3, r: 2, fill: M3.primary })
      })
      out.push({ t: 'line', x1: 0, y1: h - 0.5, x2: w, y2: h - 0.5, color: M3.outlineVariant, width: 1 })
      break
    }
    case 'dialog': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: 28, fill: M3.surfaceContainer, name: 'fond' })
      out.push(label(p.title, 24, 24, w - 48, 32, 24, M3.onSurface, { slot: 'title' }))
      out.push(label(p.message, 24, 64, w - 48, Math.max(20, h - 140), 14, M3.onSurfaceVariant, { slot: 'message' }))
      out.push(label(p.confirmLabel, w - 24 - 80, h - 56, 80, 40, 14, M3.primary, { weight: 500, align: 'right', slot: 'confirm' }))
      if (p.cancelLabel !== '') out.push(label(p.cancelLabel, w - 24 - 80 - 88, h - 56, 80, 40, 14, M3.primary, { weight: 500, align: 'right', slot: 'cancel' }))
      break
    }
    case 'snackbar': {
      const p = node.props
      out.push({ t: 'rect', x: 0, y: 0, w, h, r: 4, fill: M3.inverseSurface, name: 'fond' })
      out.push(label(p.message, 16, 0, w - 32 - (p.actionLabel === '' ? 0 : 80), h, 14, M3.inverseOnSurface, { slot: 'message' }))
      if (p.actionLabel !== '') out.push(label(p.actionLabel, w - 88, 0, 72, h, 14, '#D0BCFF', { weight: 500, align: 'right', slot: 'action' }))
      break
    }
  }
  return out
}

// Decor d'un conteneur semantique (carte, tiroir, feuille basse, liste...) :
// ce qui le distingue d'un simple groupe, sous ses enfants.
export function containerSketch(frame: FrameNode): { under: SketchPrim[]; over: SketchPrim[] } {
  const spec = frame.container
  const under: SketchPrim[] = []
  const over: SketchPrim[] = []
  if (spec === undefined) return { under, over }
  const { w, h } = frame.frame
  if (spec.kind === 'bottomSheet' && spec.handle) over.push({ t: 'rect', x: w / 2 - 16, y: 8, w: 32, h: 4, r: 2, fill: M3.outlineVariant })
  if (spec.kind === 'listView' && spec.dividers && spec.axis === 'vertical') {
    frame.children.slice(0, -1).forEach((c) => {
      const y = c.frame.y + c.frame.h + frame.layout.gap / 2
      over.push({ t: 'line', x1: 0, y1: y, x2: w, y2: y, color: M3.outlineVariant, width: 1 })
    })
  }
  if (spec.kind === 'safeArea') over.push({ t: 'rect', x: 0, y: 0, w, h, stroke: { color: '#6750A473', width: 1 } })
  return { under, over }
}

// Variante Figma d'un composant : nom de l'ensemble + proprietes de variante
// (dimensions qui changent l'APPARENCE, pas le texte). Deux composants de
// meme `setName` et de proprietes identiques partagent le meme composant Figma.
export function componentVariant(node: ComponentNode): { setName: string; properties: Record<string, string> } {
  const yn = (b: boolean) => (b ? 'oui' : 'non')
  switch (node.kind) {
    case 'button':
      return { setName: 'Bouton', properties: { variante: node.props.variant, désactivé: yn(node.props.disabled), icône: yn(node.props.icon !== undefined) } }
    case 'iconButton':
      return { setName: 'Bouton icône', properties: { variante: node.props.variant, désactivé: yn(node.props.disabled) } }
    case 'fab':
      return { setName: 'Bouton flottant', properties: { taille: node.props.size, étendu: yn(node.props.label !== '') } }
    case 'textField':
      return { setName: 'Champ de saisie', properties: { état: node.props.errorText !== '' ? 'erreur' : node.props.disabled ? 'désactivé' : 'normal', multiligne: yn(node.props.multiline) } }
    case 'checkbox':
      return { setName: 'Case à cocher', properties: { cochée: yn(node.props.checked), désactivée: yn(node.props.disabled) } }
    case 'switch':
      return { setName: 'Interrupteur', properties: { activé: yn(node.props.checked), désactivé: yn(node.props.disabled) } }
    case 'radio':
      return { setName: 'Bouton radio', properties: { sélectionné: yn(node.props.selected), désactivé: yn(node.props.disabled) } }
    case 'chip':
      return { setName: 'Puce', properties: { variante: node.props.variant, sélectionnée: yn(node.props.selected) } }
    case 'divider':
      return { setName: 'Séparateur', properties: { orientation: node.props.vertical ? 'vertical' : 'horizontal' } }
    case 'appBar':
      return { setName: "Barre d'application", properties: { retour: node.props.leading, titreCentré: yn(node.props.centerTitle) } }
    case 'dropdown':
      return { setName: 'Liste déroulante', properties: { désactivée: yn(node.props.disabled) } }
    case 'datePicker':
      return { setName: 'Sélecteur de date', properties: { désactivé: yn(node.props.disabled) } }
    default:
      return { setName: COMPONENT_SET_NAMES[node.kind] ?? node.kind, properties: {} }
  }
}

const COMPONENT_SET_NAMES: Partial<Record<ComponentKind, string>> = {
  slider: 'Curseur',
  icon: 'Icône',
  avatar: 'Avatar',
  badge: 'Pastille',
  progressBar: 'Barre de progression',
  spinner: 'Indicateur de chargement',
  listTile: 'Élément de liste',
  spacer: 'Espaceur',
  bottomNav: 'Barre de navigation basse',
  tabs: 'Onglets',
  dialog: 'Boîte de dialogue',
  snackbar: 'Snackbar',
}
