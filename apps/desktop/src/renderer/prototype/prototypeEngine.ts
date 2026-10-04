// Moteur du mode prototype : etat de navigation (pile d'ecrans, overlays
// ouverts), resolution d'un geste en interaction, animations de transition.
// Pur et teste sans rendu ; PrototypeView.tsx ne fait que l'afficher.
import { absoluteFrame, hitTest, isScreenNode, pathToNode } from '@maquio/core'
import type { Action, Easing, Interaction, Node, Transition, Trigger } from '@maquio/core'

export type StackEntry = { screenId: string; via: Transition | null }
export type ProtoState = { stack: StackEntry[]; overlays: string[] }

// Ce qui doit s'animer a la suite d'une action.
export type Anim =
  | { kind: 'enter'; transition: Transition; fromScreenId: string; toScreenId: string }
  | { kind: 'back'; transition: Transition; fromScreenId: string; toScreenId: string }
  | { kind: 'overlayOpen'; transition: Transition; overlayId: string }
  | { kind: 'overlayClose'; transition: Transition; overlayId: string }

export type Step = { state: ProtoState; anim: Anim | null; toast: string | null }

export function startState(screenId: string): ProtoState {
  return { stack: [{ screenId, via: null }], overlays: [] }
}

export const currentScreenId = (s: ProtoState): string => s.stack[s.stack.length - 1]!.screenId

export function applyAction(state: ProtoState, action: Action, transition: Transition, screenIds: Set<string>): Step {
  const same: Step = { state, anim: null, toast: null }
  switch (action.type) {
    case 'navigate': {
      if (!screenIds.has(action.target) || action.target === currentScreenId(state)) return same
      return {
        state: { stack: [...state.stack, { screenId: action.target, via: transition }], overlays: [] },
        anim: { kind: 'enter', transition, fromScreenId: currentScreenId(state), toScreenId: action.target },
        toast: null,
      }
    }
    case 'back': {
      if (state.overlays.length > 0) return closeLast(state, transition)
      if (state.stack.length <= 1) return same
      const popped = state.stack[state.stack.length - 1]!
      const next = state.stack.slice(0, -1)
      return {
        state: { stack: next, overlays: [] },
        anim: { kind: 'back', transition: popped.via ?? { type: 'none' }, fromScreenId: popped.screenId, toScreenId: next[next.length - 1]!.screenId },
        toast: null,
      }
    }
    case 'openOverlay':
      if (state.overlays.includes(action.target)) return same
      return { state: { ...state, overlays: [...state.overlays, action.target] }, anim: { kind: 'overlayOpen', transition, overlayId: action.target }, toast: null }
    case 'closeOverlay':
      return closeLast(state, transition)
    case 'openUrl':
      return { state, anim: null, toast: `Ouvrirait ${action.url}` }
  }
}

function closeLast(state: ProtoState, transition: Transition): Step {
  const id = state.overlays[state.overlays.length - 1]
  if (id === undefined) return { state, anim: null, toast: null }
  return { state: { ...state, overlays: state.overlays.slice(0, -1) }, anim: { kind: 'overlayClose', transition, overlayId: id }, toast: null }
}

// --- Resolution d'un geste ---

// Overlays referencees par au moins une interaction : masquees tant qu'elles
// ne sont pas ouvertes.
export function referencedOverlays(nodes: Node[]): Set<string> {
  const out = new Set<string>()
  const visit = (list: Node[]) => {
    for (const n of list) {
      for (const i of n.interactions ?? []) if (i.action.type === 'openOverlay') out.add(i.action.target)
      if (n.type === 'frame') visit(n.children)
    }
  }
  visit(nodes)
  return out
}

export type Fired = { action: Action; transition: Transition; sourceId: string } | null

const NONE: Transition = { type: 'none' }

// Interaction declenchee par `trigger` au point `point` (coordonnees de PAGE)
// dans l'ecran `screen` : le noeud le plus haut sous le point, puis ses
// ancetres de l'interieur vers l'exterieur ; un overlay ouvert recouvre
// l'ecran et capte d'abord le geste.
export function resolveGesture(nodes: Node[], screen: Node, point: { x: number; y: number }, trigger: Trigger['type'], openOverlays: string[]): Fired {
  const find = (n: Node): Interaction | undefined => n.interactions?.find((i) => i.trigger.type === trigger)

  // Overlay ouvert (le plus recent d'abord) : un geste dessus declenche SON interaction ;
  // un « tap » sans interaction le ferme (boutons du dialogue, scrim).
  for (const id of [...openOverlays].reverse()) {
    const ov = findById(nodes, id)
    if (ov === null) continue
    const f = absoluteFrame(nodes, id)
    const inside = point.x >= f.x && point.x < f.x + f.w && point.y >= f.y && point.y < f.y + f.h
    if (inside) {
      const own = find(ov)
      if (own !== undefined) return { action: own.action, transition: own.transition, sourceId: id }
    }
    if (trigger === 'tap') return { action: { type: 'closeOverlay' }, transition: NONE, sourceId: id }
    return null
  }

  if (screen.type !== 'frame') return null
  // Les overlays references mais fermes n'existent pas a l'ecran : ils ne recoivent aucun geste.
  const closed = new Set([...referencedOverlays(nodes)].filter((id) => !openOverlays.includes(id)))
  const hit = hitTest([prune(screen, closed)], point)
  if (hit === null) return null
  const chain = pathToNode([screen], hit.id).reverse() // du plus profond au plus haut
  for (const id of chain) {
    const n = findById(nodes, id)
    if (n === null || isScreenNode(n)) {
      // l'ecran lui-meme : ses propres interactions « tap » comptent aussi
      if (n !== null) {
        const i = find(n)
        if (i !== undefined) return { action: i.action, transition: i.transition, sourceId: n.id }
      }
      continue
    }
    const i = find(n)
    if (i !== undefined) return { action: i.action, transition: i.transition, sourceId: id }
    // Composants a cibles internes : entrees d'une barre de navigation / onglets, retour d'une barre d'application.
    if (trigger === 'tap' && n.type === 'component') {
      const f = absoluteFrame(nodes, n.id)
      if (n.kind === 'bottomNav' || n.kind === 'tabs') {
        const items = n.props.items as { target?: string }[]
        const idx = Math.min(items.length - 1, Math.max(0, Math.floor(((point.x - f.x) / f.w) * items.length)))
        const target = items[idx]?.target
        if (target !== undefined) return { action: { type: 'navigate', target }, transition: { type: 'fade', durationMs: 150, easing: 'linear' }, sourceId: n.id }
      }
      if (n.kind === 'appBar' && n.props.leading === 'back' && point.x - f.x < 56) return { action: { type: 'back' }, transition: NONE, sourceId: n.id }
    }
  }
  return null
}

function prune(node: Node, closed: Set<string>): Node {
  if (node.type !== 'frame') return node
  return { ...node, children: node.children.filter((c) => !closed.has(c.id)).map((c) => prune(c, closed)) }
}

function findById(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'frame') {
      const r = findById(n.children, id)
      if (r !== null) return r
    }
  }
  return null
}

// Interactions « apres un delai » d'un ecran.
export function delayInteractions(screen: Node): { ms: number; action: Action; transition: Transition }[] {
  return (screen.interactions ?? []).flatMap((i) => (i.trigger.type === 'afterDelay' ? [{ ms: i.trigger.ms, action: i.action, transition: i.transition }] : []))
}

// --- Animations ---

export const CSS_EASING: Record<Easing, string> = {
  linear: 'linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export type Role = 'enter' | 'underEnter' | 'exitBack' | 'underBack'

// Mouvement (en fraction de la taille de l'ecran) qui fait ENTRER un ecran.
function offscreen(t: Transition): { x: number; y: number } {
  if (t.type === 'slide') {
    // `direction` est le sens du mouvement du contenu : vers la gauche = entre par la droite.
    return t.direction === 'left' ? { x: 1, y: 0 } : t.direction === 'right' ? { x: -1, y: 0 } : t.direction === 'up' ? { x: 0, y: 1 } : { x: 0, y: -1 }
  }
  if (t.type === 'modal') return { x: 0, y: 1 }
  return { x: 1, y: 0 } // push
}

const pct = (v: number) => `${v * 100}%`
const tr = (x: number, y: number) => `translate(${pct(x)}, ${pct(y)})`

// Image-cles Web Animations d'un ecran selon son role dans la transition, ou
// null quand rien ne bouge.
//  - enter     : le nouvel ecran arrive ;
//  - underEnter: l'ecran precedent pendant une poussee (recule d'un tiers) ;
//  - exitBack  : l'ecran retire par « retour » repart d'ou il etait venu ;
//  - underBack : l'ecran revele par « retour » (revient de sa position reculee).
export function animationFor(t: Transition, role: Role): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } | null {
  if (t.type === 'none') return null
  const options: KeyframeAnimationOptions = { duration: t.durationMs, easing: CSS_EASING[t.easing], fill: 'both' }
  const o = offscreen(t)
  switch (role) {
    case 'enter':
      if (t.type === 'fade') return { keyframes: [{ opacity: 0 }, { opacity: 1 }], options }
      return { keyframes: [{ transform: tr(o.x, o.y) }, { transform: tr(0, 0) }], options }
    case 'underEnter':
      if (t.type === 'push') return { keyframes: [{ transform: tr(0, 0) }, { transform: tr(-0.3 * o.x, 0) }], options }
      return null
    case 'exitBack':
      if (t.type === 'fade') return { keyframes: [{ opacity: 1 }, { opacity: 0 }], options }
      return { keyframes: [{ transform: tr(0, 0) }, { transform: tr(o.x, o.y) }], options }
    case 'underBack':
      if (t.type === 'push') return { keyframes: [{ transform: tr(-0.3 * o.x, 0) }, { transform: tr(0, 0) }], options }
      return null
  }
}

// Ouverture / fermeture d'un overlay : memes mouvements, plus courts decalages.
export function overlayAnimation(t: Transition, opening: boolean): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } | null {
  if (t.type === 'none') return null
  const options: KeyframeAnimationOptions = { duration: t.durationMs, easing: CSS_EASING[t.easing], fill: 'both' }
  const o = offscreen(t)
  const hidden: Keyframe = t.type === 'fade' || t.type === 'push' ? { opacity: 0, transform: 'scale(0.95)' } : { opacity: 1, transform: tr(o.x * 0.4, o.y * 0.4) }
  const shown: Keyframe = { opacity: 1, transform: 'none' }
  return { keyframes: opening ? [hidden, shown] : [shown, hidden], options }
}
