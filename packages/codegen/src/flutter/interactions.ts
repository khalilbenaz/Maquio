// Transitions et actions d'interaction pour Flutter : `lib/transitions.dart`
// (modele de transition, route animee), puis `lib/actions.dart` (une fonction
// par navigation animee, overlay ou URL utilisee par le design). Les ecrans
// n'appellent que ces fonctions courtes : `goDetailSlide(context)`.
import type { OverlayRef } from '../shared/interactions'
import type { ScreenRef } from '../shared/screens'
import type { Easing, Transition } from '@maquio/core'
import { escapeDartString } from './dart-utils'

export const TRANSITIONS_DART = `import 'package:flutter/material.dart';

/// Direction du mouvement du contenu pour une transition de type glissement.
enum SlideDirection { left, right, up, down }

/// Famille de transition.
enum TransitionKind { none, slide, push, fade, modal }

/// Transition entre deux ecrans (voir \`appRoute\`).
class AppTransition {
  const AppTransition.none()
    : this._(TransitionKind.none, SlideDirection.left, 0, Curves.linear);

  const AppTransition.slide(
    SlideDirection direction,
    int durationMs,
    Curve curve,
  ) : this._(TransitionKind.slide, direction, durationMs, curve);

  const AppTransition.push(int durationMs, Curve curve)
    : this._(TransitionKind.push, SlideDirection.left, durationMs, curve);

  const AppTransition.fade(int durationMs, Curve curve)
    : this._(TransitionKind.fade, SlideDirection.left, durationMs, curve);

  const AppTransition.modal(int durationMs, Curve curve)
    : this._(TransitionKind.modal, SlideDirection.up, durationMs, curve);

  const AppTransition._(this.kind, this.direction, this.durationMs, this.curve);

  final TransitionKind kind;
  final SlideDirection direction;
  final int durationMs;
  final Curve curve;

  /// Position de depart d'un ecran qui entre.
  Offset get offscreen {
    switch (kind) {
      case TransitionKind.modal:
        return const Offset(0, 1);
      case TransitionKind.slide:
        switch (direction) {
          case SlideDirection.left:
            return const Offset(1, 0);
          case SlideDirection.right:
            return const Offset(-1, 0);
          case SlideDirection.up:
            return const Offset(0, 1);
          case SlideDirection.down:
            return const Offset(0, -1);
        }
      case TransitionKind.none:
      case TransitionKind.push:
      case TransitionKind.fade:
        return const Offset(1, 0);
    }
  }
}

/// Route animee vers [page] : glissement, poussee, fondu ou montee modale.
Route<T> appRoute<T>(Widget page, AppTransition transition) {
  final duration = Duration(milliseconds: transition.durationMs);
  return PageRouteBuilder<T>(
    transitionDuration: duration,
    reverseTransitionDuration: duration,
    pageBuilder: (context, animation, secondaryAnimation) => page,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: transition.curve,
      );
      switch (transition.kind) {
        case TransitionKind.none:
          return child;
        case TransitionKind.fade:
          return FadeTransition(opacity: curved, child: child);
        case TransitionKind.push:
          final under = CurvedAnimation(
            parent: secondaryAnimation,
            curve: transition.curve,
          );
          return SlideTransition(
            position: Tween<Offset>(
              begin: Offset.zero,
              end: const Offset(-0.3, 0),
            ).animate(under),
            child: SlideTransition(
              position: Tween<Offset>(
                begin: transition.offscreen,
                end: Offset.zero,
              ).animate(curved),
              child: child,
            ),
          );
        case TransitionKind.slide:
        case TransitionKind.modal:
          return SlideTransition(
            position: Tween<Offset>(
              begin: transition.offscreen,
              end: Offset.zero,
            ).animate(curved),
            child: child,
          );
      }
    },
  );
}
`

const CURVES: Record<Easing, string> = {
  linear: 'Curves.linear',
  easeIn: 'Curves.easeIn',
  easeOut: 'Curves.easeOut',
  easeInOut: 'Curves.easeInOut',
  spring: 'Curves.easeOutBack',
}
export const curveOf = (e: Easing): string => CURVES[e]

const DIRECTIONS = { left: 'SlideDirection.left', right: 'SlideDirection.right', up: 'SlideDirection.up', down: 'SlideDirection.down' } as const

// `const AppTransition.slide(SlideDirection.left, 300, Curves.easeOut)`.
export function transitionExpr(t: Transition): string {
  switch (t.type) {
    case 'none':
      return 'const AppTransition.none()'
    case 'slide':
      return `const AppTransition.slide(${DIRECTIONS[t.direction]}, ${t.durationMs}, ${curveOf(t.easing)})`
    default:
      return `const AppTransition.${t.type}(${t.durationMs}, ${curveOf(t.easing)})`
  }
}

const q = (s: string) => `'${escapeDartString(s)}'`
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)

// Registre des actions utilisees dans tout le projet : attribue un nom de
// fonction stable et unique a chaque navigation animee / overlay / URL.
export class ActionRegistry {
  readonly navs = new Map<string, { name: string; screen: ScreenRef; transition: Transition }>()
  readonly overlays = new Map<string, { name: string; ref: OverlayRef; transition: Transition }>()
  readonly urls = new Map<string, string>()
  private readonly names = new Set<string>()

  private unique(base: string): string {
    let name = base
    for (let n = 2; this.names.has(name); n += 1) name = `${base}${n}`
    this.names.add(name)
    return name
  }

  navigate(screen: ScreenRef, t: Transition): string {
    const key = `${screen.id}|${JSON.stringify(t)}`
    const known = this.navs.get(key)
    if (known !== undefined) return known.name
    const name = this.unique(`go${screen.pascal}${cap(t.type)}`)
    this.navs.set(key, { name, screen, transition: t })
    return name
  }

  overlay(o: OverlayRef, t: Transition): string {
    const key = `${o.id}|${JSON.stringify(t)}`
    const known = this.overlays.get(key)
    if (known !== undefined) return known.name
    const name = this.unique(o.name.startsWith('show') ? o.name : `show${cap(o.name)}`)
    this.overlays.set(key, { name, ref: o, transition: t })
    return name
  }

  url(url: string): string {
    const known = this.urls.get(url)
    if (known !== undefined) return known
    const name = this.unique(`openUrl${this.urls.size + 1}`)
    this.urls.set(url, name)
    return name
  }

  get usesUrls(): boolean {
    return this.urls.size > 0
  }

  get isEmpty(): boolean {
    return this.navs.size === 0 && this.overlays.size === 0 && this.urls.size === 0
  }
}

export function navigationFunction(f: { name: string; screen: ScreenRef; transition: Transition }): string[] {
  return [
    `void ${f.name}(BuildContext context) {`,
    `  ${transitionExpr(f.transition).replace('const AppTransition', 'const t = AppTransition')};`,
    `  Navigator.of(context).push(appRoute(const ${f.screen.pascal}(), t));`,
    '}',
  ]
}

export function urlFunction(name: string, url: string): string[] {
  return [`Future<void> ${name}() => launchUrl(Uri.parse(${q(url)}));`]
}

export function animationStyle(t: Transition): string[] {
  if (t.type === 'none') return ['AnimationStyle.noAnimation']
  return ['const AnimationStyle(', `  duration: Duration(milliseconds: ${t.durationMs}),`, `  curve: ${curveOf(t.easing)},`, ')']
}
