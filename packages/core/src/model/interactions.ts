// Interactions de prototype : « quand l'utilisateur fait X sur ce noeud, faire
// Y, avec telle transition ». Remplace l'ancien `link` (un seul declencheur :
// le clic, une seule action : aller a un ecran), migre automatiquement en
// `tap -> navigate` (voir parseDocument).
import { z } from 'zod'

export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'] as const
export type Easing = (typeof EASINGS)[number]

export const SLIDE_DIRECTIONS = ['left', 'right', 'up', 'down'] as const
export type SlideDirection = (typeof SLIDE_DIRECTIONS)[number]

export const OVERLAY_KINDS = ['dialog', 'bottomSheet', 'snackbar'] as const
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

const timing = {
  durationMs: z.number().int().min(0).max(5000),
  easing: z.enum(EASINGS),
}

export const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tap') }).strict(),
  z.object({ type: z.literal('longPress') }).strict(),
  z.object({ type: z.literal('afterDelay'), ms: z.number().int().min(0).max(60000) }).strict(),
])

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), target: z.string() }).strict(),
  z.object({ type: z.literal('back') }).strict(),
  z.object({ type: z.literal('openOverlay'), overlay: z.enum(OVERLAY_KINDS), target: z.string() }).strict(),
  z.object({ type: z.literal('closeOverlay') }).strict(),
  z.object({ type: z.literal('openUrl'), url: z.string().regex(/^(https?:\/\/|mailto:|tel:)\S+$/, 'URL attendue : http(s)://, mailto: ou tel:') }).strict(),
])

export const transitionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('slide'), direction: z.enum(SLIDE_DIRECTIONS), ...timing }).strict(),
  z.object({ type: z.literal('push'), ...timing }).strict(),
  z.object({ type: z.literal('fade'), ...timing }).strict(),
  z.object({ type: z.literal('modal'), ...timing }).strict(),
])

export const interactionSchema = z
  .object({ trigger: triggerSchema, action: actionSchema, transition: transitionSchema })
  .strict()

export type Trigger = z.infer<typeof triggerSchema>
export type Action = z.infer<typeof actionSchema>
export type Transition = z.infer<typeof transitionSchema>
export type Interaction = z.infer<typeof interactionSchema>
export type TransitionType = Transition['type']

// Transition appliquee a un lien migre depuis l'ancien `link` et a un lien
// pose sans autre precision : la navigation native de la plateforme.
export const DEFAULT_TRANSITION: Transition = { type: 'push', durationMs: 300, easing: 'easeInOut' }

export function defaultTransition(type: TransitionType): Transition {
  switch (type) {
    case 'none':
      return { type: 'none' }
    case 'slide':
      return { type: 'slide', direction: 'left', durationMs: 300, easing: 'easeInOut' }
    case 'push':
      return { ...DEFAULT_TRANSITION } as Transition
    case 'fade':
      return { type: 'fade', durationMs: 300, easing: 'easeInOut' }
    case 'modal':
      return { type: 'modal', durationMs: 350, easing: 'easeOut' }
  }
}

// La transition par defaut de la plateforme (push, 300 ms, easeInOut) :
// les exportateurs la rendent par la navigation native, sans code de transition.
export function isDefaultTransition(t: Transition): boolean {
  return t.type === 'push' && t.durationMs === DEFAULT_TRANSITION_DURATION && t.easing === 'easeInOut'
}
const DEFAULT_TRANSITION_DURATION = 300

export function tapNavigation(interactions: Interaction[] | undefined): { target: string; transition: Transition } | null {
  const i = interactions?.find((x) => x.trigger.type === 'tap' && x.action.type === 'navigate')
  return i !== undefined && i.action.type === 'navigate' ? { target: i.action.target, transition: i.transition } : null
}

// Interaction « au clic, aller a l'ecran X » (le cas le plus courant).
export function tapLink(target: string, transition: Transition = DEFAULT_TRANSITION): Interaction {
  return { trigger: { type: 'tap' }, action: { type: 'navigate', target }, transition }
}
