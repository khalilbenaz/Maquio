// Interactions de prototype resolues pour l'export : cibles d'ecran, overlays,
// transitions. Le plan d'export (screens.ts) en porte la table ; chaque
// exportateur traduit ensuite ces donnees neutres vers son API native.
import { isDefaultTransition } from '@calque/core'
import type { Action, Interaction, Node, OverlayKind, Transition, Trigger } from '@calque/core'
import type { ExportPlan, ScreenRef } from './screens'
import { toCamelCase } from './naming'

export type OverlayRef = {
  id: string
  kind: OverlayKind
  node: Node
  // Identifiant (camelCase) de la fonction / de l'etat qui l'affiche, unique dans le projet.
  name: string
}

export type RAction =
  | { type: 'navigate'; screen: ScreenRef }
  | { type: 'back' }
  | { type: 'openOverlay'; overlay: OverlayRef }
  | { type: 'closeOverlay' }
  | { type: 'openUrl'; url: string }

export type RInteraction = { trigger: Trigger; transition: Transition; action: RAction }

// Les overlays visees par au moins une interaction : ce sont des GABARITS
// (rendus a la demande), jamais inclus dans la mise en page de l'ecran.
export function collectOverlays(nodesList: Node[][]): Map<string, OverlayRef> {
  const byId = new Map<string, Node>()
  const targets: { id: string; kind: OverlayKind }[] = []
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      byId.set(n.id, n)
      for (const i of n.interactions ?? []) if (i.action.type === 'openOverlay') targets.push({ id: i.action.target, kind: i.action.overlay })
      if (n.type === 'frame') visit(n.children)
    }
  }
  nodesList.forEach(visit)
  const used = new Set<string>()
  const out = new Map<string, OverlayRef>()
  for (const t of targets) {
    const node = byId.get(t.id)
    if (node === undefined || out.has(t.id)) continue
    let base = toCamelCase(node.name) || t.kind
    let name = base
    for (let n = 2; used.has(name); n += 1) name = `${base}${n}`
    used.add(name)
    base = name
    out.set(t.id, { id: t.id, kind: t.kind, node, name })
  }
  return out
}

export function resolveInteractions(node: Node, plan: ExportPlan): RInteraction[] {
  const out: RInteraction[] = []
  for (const i of node.interactions ?? []) {
    const action = resolveAction(i.action, plan)
    if (action !== null) out.push({ trigger: i.trigger, transition: i.transition, action })
  }
  return out
}

function resolveAction(a: Action, plan: ExportPlan): RAction | null {
  switch (a.type) {
    case 'navigate': {
      const screen = plan.byId.get(a.target)
      return screen === undefined ? null : { type: 'navigate', screen }
    }
    case 'openOverlay': {
      const overlay = plan.overlays.get(a.target)
      return overlay === undefined ? null : { type: 'openOverlay', overlay }
    }
    case 'back':
      return { type: 'back' }
    case 'closeOverlay':
      return { type: 'closeOverlay' }
    case 'openUrl':
      return { type: 'openUrl', url: a.url }
  }
}

export function interactionFor(node: Node, plan: ExportPlan, trigger: Trigger['type']): RInteraction | null {
  return resolveInteractions(node, plan).find((i) => i.trigger.type === trigger) ?? null
}

// Cette navigation utilise-t-elle la transition native de la plateforme ?
export const isNativeTransition = (t: Transition): boolean => isDefaultTransition(t)

export type { Interaction }
