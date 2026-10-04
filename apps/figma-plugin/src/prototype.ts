// Prototype Figma : les interactions Maquio deviennent des reactions
// (declencheur, action, transition) posees sur les noeuds sources, plus un
// point de depart de flux sur l'ecran de depart.
import type { Plan, PlanAction, PlanEasing, PlanTransition, ReactionPlan } from './mapping'

type Created = Map<string, SceneNode>

function easingOf(e: PlanEasing): Easing {
  return { type: e.type }
}

function transitionOf(t: PlanTransition | null): Transition | null {
  if (t === null) return null
  if (t.type === 'DISSOLVE') return { type: 'DISSOLVE', duration: t.duration, easing: easingOf(t.easing) }
  return { type: t.type, direction: t.direction, matchLayers: t.matchLayers, duration: t.duration, easing: easingOf(t.easing) }
}

// Reaction Figma d'une reaction du plan, ou null si sa cible n'a pas ete creee.
export function toFigmaReaction(r: ReactionPlan, created: Created): Reaction | null {
  const trigger: Trigger =
    r.trigger.type === 'ON_CLICK' ? { type: 'ON_CLICK' } : r.trigger.type === 'MOUSE_DOWN' ? { type: 'MOUSE_DOWN', delay: r.trigger.delay } : { type: 'AFTER_TIMEOUT', timeout: r.trigger.timeout }
  const action = actionOf(r.action, created)
  return action === null ? null : { trigger, actions: [action] }
}

function actionOf(a: PlanAction, created: Created): Action | null {
  switch (a.type) {
    case 'BACK':
      return { type: 'BACK' }
    case 'CLOSE':
      return { type: 'CLOSE' }
    case 'URL':
      return { type: 'URL', url: a.url, openInNewTab: true }
    case 'NODE': {
      const dest = created.get(a.destination)
      if (dest === undefined) return null
      return { type: 'NODE', destinationId: dest.id, navigation: a.navigation, transition: transitionOf(a.transition), resetVideoPosition: false }
    }
  }
}

export async function applyPrototype(figma: PluginAPI, plan: Plan, created: Created): Promise<{ reactions: number; warnings: string[] }> {
  const warnings: string[] = []
  const bySource = new Map<string, Reaction[]>()
  let count = 0
  for (const r of plan.reactions) {
    const reaction = toFigmaReaction(r, created)
    if (reaction === null) {
      warnings.push(`interaction ignorée : la cible « ${'destination' in r.action ? r.action.destination : r.action.type} » n'a pas été créée`)
      continue
    }
    bySource.set(r.source, [...(bySource.get(r.source) ?? []), reaction])
    count += 1
  }
  for (const [source, reactions] of bySource) {
    const node = created.get(source)
    if (node === undefined || !('setReactionsAsync' in node)) {
      warnings.push(`interaction ignorée : le calque source « ${source} » n'accepte pas de réaction`)
      count -= reactions.length
      continue
    }
    await node.setReactionsAsync(reactions)
  }
  // Point de depart du flux : l'ecran de depart.
  const start = plan.startScreenId === null ? undefined : created.get(plan.startScreenId)
  const first = start ?? created.get(plan.screens[0]?.sourceId ?? '')
  if (first !== undefined && plan.reactions.length > 0) figma.currentPage.flowStartingPoints = [{ nodeId: first.id, name: 'Départ' }]
  return { reactions: count, warnings }
}
