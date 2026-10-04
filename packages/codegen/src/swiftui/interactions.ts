// Interactions SwiftUI : transitions personnalisees (pile de navigation
// maison, utilisee des qu'une navigation du design n'est pas la poussee
// native), actions, URL. Le modele de transition vit dans Navigation.swift.
import type { Easing, Transition } from '@calque/core'

const CURVES: Record<Easing, string> = { linear: '.linear', easeIn: '.easeIn', easeOut: '.easeOut', easeInOut: '.easeInOut', spring: '.spring' }

// `.slide(.left, duration: 0.3, curve: .easeOut)` : valeur de AppTransition.
export function transitionExpr(t: Transition): string {
  const seconds = (ms: number) => String(ms / 1000)
  switch (t.type) {
    case 'none':
      return '.none'
    case 'slide':
      return `.slide(.${t.direction}, duration: ${seconds(t.durationMs)}, curve: ${CURVES[t.easing]})`
    default:
      return `.${t.type}(duration: ${seconds(t.durationMs)}, curve: ${CURVES[t.easing]})`
  }
}

export const APP_TRANSITION_SWIFT = [
  '/// Transition entre deux ecrans : glissement, poussee, fondu ou montee modale.',
  'struct AppTransition {',
  '    enum Kind { case none, slide, push, fade, modal }',
  '    enum Direction { case left, right, up, down }',
  '    enum Curve { case linear, easeIn, easeOut, easeInOut, spring }',
  '',
  '    var kind: Kind',
  '    var direction: Direction = .left',
  '    var duration: Double = 0.3',
  '    var curve: Curve = .easeInOut',
  '',
  '    /// Navigation par defaut : la poussee.',
  '    static let push = AppTransition(kind: .push)',
  '    static let none = AppTransition(kind: .none, duration: 0)',
  '',
  '    static func slide(_ direction: Direction, duration: Double, curve: Curve) -> AppTransition {',
  '        AppTransition(kind: .slide, direction: direction, duration: duration, curve: curve)',
  '    }',
  '',
  '    static func push(duration: Double, curve: Curve) -> AppTransition {',
  '        AppTransition(kind: .push, duration: duration, curve: curve)',
  '    }',
  '',
  '    static func fade(duration: Double, curve: Curve) -> AppTransition {',
  '        AppTransition(kind: .fade, duration: duration, curve: curve)',
  '    }',
  '',
  '    static func modal(duration: Double, curve: Curve) -> AppTransition {',
  '        AppTransition(kind: .modal, direction: .up, duration: duration, curve: curve)',
  '    }',
  '',
  '    var animation: Animation? {',
  '        if kind == .none { return nil }',
  '        switch curve {',
  '        case .linear: return .linear(duration: duration)',
  '        case .easeIn: return .easeIn(duration: duration)',
  '        case .easeOut: return .easeOut(duration: duration)',
  '        case .easeInOut: return .easeInOut(duration: duration)',
  '        case .spring: return .spring(duration: duration, bounce: 0.25)',
  '        }',
  '    }',
  '',
  '    /// Mouvement de l\'ecran qui entre (et, a l\'envers, de celui qui sort).',
  '    var transition: AnyTransition {',
  '        switch kind {',
  '        case .none: return .identity',
  '        case .fade: return .opacity',
  '        case .modal: return .move(edge: .bottom)',
  '        case .push: return .move(edge: .trailing)',
  '        case .slide:',
  '            switch direction {',
  '            case .left: return .move(edge: .trailing)',
  '            case .right: return .move(edge: .leading)',
  '            case .up: return .move(edge: .bottom)',
  '            case .down: return .move(edge: .top)',
  '            }',
  '        }',
  '    }',
  '}',
]
