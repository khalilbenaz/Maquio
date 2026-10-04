// Interactions Compose : transitions de destination (NavHost), easing,
// declaration d'un champ de transition par ecran cible.
import type { Easing, Transition } from '@calque/core'

const EASINGS: Record<Easing, string> = { linear: 'LinearEasing', easeIn: 'EaseIn', easeOut: 'EaseOut', easeInOut: 'EaseInOut', spring: 'EaseOutBack' }

export const easingOf = (e: Easing): string => EASINGS[e]

export const ANIMATION_IMPORTS = [
  'androidx.compose.animation.EnterTransition',
  'androidx.compose.animation.ExitTransition',
  'androidx.compose.animation.core.tween',
]

// Arguments `enterTransition = ...` des quatre sens d'une destination
// (arrivee, depart, retour sur l'ecran, sortie par retour) : une transition
// du design anime l'ARRIVEE de l'ecran cible et sa sortie par retour.
export function destinationTransitions(t: Transition): { args: string[]; imports: string[] } {
  if (t.type === 'none') {
    return {
      args: ['enterTransition = { EnterTransition.None }', 'exitTransition = { ExitTransition.None }', 'popEnterTransition = { EnterTransition.None }', 'popExitTransition = { ExitTransition.None }'],
      imports: [],
    }
  }
  const spec = `tween(${t.durationMs}, easing = ${easingOf(t.easing)})`
  const imports = [`androidx.compose.animation.core.${easingOf(t.easing)}`]
  if (t.type === 'fade') {
    imports.push('androidx.compose.animation.fadeIn', 'androidx.compose.animation.fadeOut')
    return { args: [`enterTransition = { fadeIn(animationSpec = ${spec}) }`, `popExitTransition = { fadeOut(animationSpec = ${spec}) }`], imports }
  }
  const vertical = t.type === 'modal' || (t.type === 'slide' && (t.direction === 'up' || t.direction === 'down'))
  const reversed = t.type === 'slide' && (t.direction === 'right' || t.direction === 'down')
  const sign = reversed ? '-' : ''
  if (vertical) {
    imports.push('androidx.compose.animation.slideInVertically', 'androidx.compose.animation.slideOutVertically')
    return {
      args: [`enterTransition = { slideInVertically(initialOffsetY = { ${sign}it }, animationSpec = ${spec}) }`, `popExitTransition = { slideOutVertically(targetOffsetY = { ${sign}it }, animationSpec = ${spec}) }`],
      imports,
    }
  }
  imports.push('androidx.compose.animation.slideInHorizontally', 'androidx.compose.animation.slideOutHorizontally')
  return {
    args: [`enterTransition = { slideInHorizontally(initialOffsetX = { ${sign}it }, animationSpec = ${spec}) }`, `popExitTransition = { slideOutHorizontally(targetOffsetX = { ${sign}it }, animationSpec = ${spec}) }`],
    imports,
  }
}
