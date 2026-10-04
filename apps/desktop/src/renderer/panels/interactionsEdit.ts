// Logique pure de l'edition des interactions (testee sans rendu) : valeurs par
// defaut, changement de declencheur / d'action / de transition, options.
import { DEFAULT_TRANSITION, defaultTransition } from '@maquio/core'
import type { Action, FrameNode, Interaction, Node, OverlayKind, Transition, TransitionType, Trigger } from '@maquio/core'

export type Ctx = {
  isScreen: boolean
  // Ecrans de la page, sauf celui qui contient le noeud (ou le noeud lui-meme).
  screens: { id: string; name: string }[]
  overlays: { id: string; name: string; overlay: OverlayKind }[]
}

export const TRIGGER_LABELS: Record<Trigger['type'], string> = { tap: 'Au clic', longPress: 'Appui long', afterDelay: 'Après un délai' }
export const ACTION_LABELS: Record<Action['type'], string> = { navigate: "Aller à l'écran", back: 'Retour', openOverlay: 'Ouvrir un overlay', closeOverlay: "Fermer l'overlay", openUrl: 'Ouvrir une URL' }
export const TRANSITION_LABELS: Record<TransitionType, string> = { none: 'Aucune', slide: 'Glissement', push: 'Poussée', fade: 'Fondu', modal: 'Modale (montée)' }
export const DIRECTION_LABELS = { left: 'Vers la gauche', right: 'Vers la droite', up: 'Vers le haut', down: 'Vers le bas' } as const
export const EASING_LABELS = { linear: 'Linéaire', easeIn: 'Accélérée', easeOut: 'Ralentie', easeInOut: 'Accélérée puis ralentie', spring: 'Ressort' } as const
export const OVERLAY_LABELS: Record<OverlayKind, string> = { dialog: 'Dialogue', bottomSheet: 'Feuille basse', snackbar: 'Snackbar' }

// Overlays disponibles dans la page (dialogues, snackbars, feuilles basses).
export function overlaysOf(nodes: Node[]): Ctx['overlays'] {
  const out: Ctx['overlays'] = []
  const visit = (list: Node[]) => {
    for (const n of list) {
      if (n.type === 'component' && n.kind === 'dialog') out.push({ id: n.id, name: n.name, overlay: 'dialog' })
      if (n.type === 'component' && n.kind === 'snackbar') out.push({ id: n.id, name: n.name, overlay: 'snackbar' })
      if (n.type === 'frame') {
        if (n.container?.kind === 'bottomSheet') out.push({ id: n.id, name: n.name, overlay: 'bottomSheet' })
        visit((n as FrameNode).children)
      }
    }
  }
  visit(nodes)
  return out
}

export function availableTriggers(list: Interaction[], index: number, ctx: Ctx): Trigger['type'][] {
  const used = new Set(list.filter((_, i) => i !== index).map((i) => i.trigger.type))
  return (['tap', 'longPress', 'afterDelay'] as const).filter((t) => !used.has(t) && (t !== 'afterDelay' || ctx.isScreen))
}

export function defaultAction(type: Action['type'], ctx: Ctx, previous?: Action): Action {
  switch (type) {
    case 'navigate':
      return { type: 'navigate', target: previous?.type === 'navigate' ? previous.target : (ctx.screens[0]?.id ?? '') }
    case 'openOverlay': {
      const o = ctx.overlays[0]
      return { type: 'openOverlay', overlay: o?.overlay ?? 'dialog', target: o?.id ?? '' }
    }
    case 'openUrl':
      return { type: 'openUrl', url: previous?.type === 'openUrl' ? previous.url : 'https://exemple.com' }
    case 'back':
      return { type: 'back' }
    case 'closeOverlay':
      return { type: 'closeOverlay' }
  }
}

// Une action est utilisable si sa cible existe (sinon la commande la refuserait).
export function actionUsable(type: Action['type'], ctx: Ctx): boolean {
  if (type === 'navigate') return ctx.screens.length > 0
  if (type === 'openOverlay') return ctx.overlays.length > 0
  return true
}

// Nouvelle interaction par defaut : premier declencheur libre, action la plus
// utile disponible (navigation, sinon retour).
export function newInteraction(list: Interaction[], ctx: Ctx): Interaction | null {
  const trigger = availableTriggers(list, -1, ctx)[0]
  if (trigger === undefined) return null
  const action = actionUsable('navigate', ctx) ? defaultAction('navigate', ctx) : defaultAction('back', ctx)
  return { trigger: trigger === 'afterDelay' ? { type: 'afterDelay', ms: 2000 } : { type: trigger }, action, transition: { ...DEFAULT_TRANSITION } }
}

export function withTrigger(it: Interaction, type: Trigger['type']): Interaction {
  const trigger: Trigger = type === 'afterDelay' ? { type, ms: it.trigger.type === 'afterDelay' ? it.trigger.ms : 2000 } : { type }
  return { ...it, trigger }
}

export function withAction(it: Interaction, type: Action['type'], ctx: Ctx): Interaction {
  return { ...it, action: defaultAction(type, ctx, it.action) }
}

export function withTransitionType(it: Interaction, type: TransitionType): Interaction {
  const prev = it.transition
  const next = defaultTransition(type)
  if (prev.type !== 'none' && next.type !== 'none') {
    // On garde la duree et la courbe deja choisies.
    return { ...it, transition: { ...next, durationMs: prev.durationMs, easing: prev.easing } as Transition }
  }
  return { ...it, transition: next }
}

export function withTransitionField(it: Interaction, patch: Partial<{ direction: 'left' | 'right' | 'up' | 'down'; durationMs: number; easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' }>): Interaction {
  if (it.transition.type === 'none') return it
  return { ...it, transition: { ...it.transition, ...patch } as Transition }
}
