// Interactions React Native : gestionnaires (onPress / onLongPress), transitions
// par parametres de route (native-stack), overlays (Modal, snackbar), URL et
// minuteur. `src/transitions.ts` convertit les parametres d'une navigation en
// options natives de l'ecran cible.
import type { Easing, Transition } from '@calque/core'
import type { OverlayRef } from '../shared/interactions'
import { jsString } from './rn-utils'

export const TRANSITIONS_TS = `import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

// Parametres de route : la transition choisie pour CETTE navigation.
export type TransitionParams = {
  transition?: 'none' | 'slide' | 'push' | 'fade' | 'modal';
  direction?: 'left' | 'right' | 'up' | 'down';
  durationMs?: number;
};

// Options natives de l'ecran cible selon la transition demandee.
export function screenOptions(params?: TransitionParams): NativeStackNavigationOptions {
  const duration = params?.durationMs;
  const timing: NativeStackNavigationOptions = duration === undefined ? {} : { animationDuration: duration };
  switch (params?.transition) {
    case 'none':
      return { animation: 'none' };
    case 'fade':
      return { animation: 'fade', ...timing };
    case 'modal':
      return { presentation: 'modal', animation: 'slide_from_bottom', ...timing };
    case 'slide':
      if (params.direction === 'right') return { animation: 'slide_from_left', ...timing };
      if (params.direction === 'up' || params.direction === 'down') return { animation: 'slide_from_bottom', ...timing };
      return { animation: 'slide_from_right', ...timing };
    default:
      return timing;
  }
}
`

export const OVERLAY_STATE = "const [overlay, setOverlay] = useState<string | null>(null);"

// Parametres passes a navigation.navigate(...) pour une transition non native.
export function transitionParams(t: Transition): string {
  switch (t.type) {
    case 'none':
      return "{ transition: 'none' }"
    case 'slide':
      return `{ transition: 'slide', direction: ${jsString(t.direction)}, durationMs: ${t.durationMs} }`
    default:
      return `{ transition: ${jsString(t.type)}, durationMs: ${t.durationMs} }`
  }
}

export function modalAnimation(t: Transition): 'none' | 'fade' | 'slide' {
  return t.type === 'none' ? 'none' : t.type === 'fade' ? 'fade' : 'slide'
}

// Une courbe n'est pas configurable avec native-stack : signalee une fois.
export function easingWarning(e: Easing): string {
  return `React Native : la courbe d'animation « ${e} » n'est pas configurable avec native-stack, la courbe native est utilisee`
}

export type OverlayUse = { ref: OverlayRef; transition: Transition }
