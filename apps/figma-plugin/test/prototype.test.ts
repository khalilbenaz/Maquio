import { describe, expect, it } from 'vitest'
import { createComponentNode, createDocument, createScreenNode, DEVICE_PRESETS } from '@calque/core'
import type { Interaction, Node } from '@calque/core'
import { applyPrototype, toFigmaReaction } from '../src/prototype'
import { buildPlan } from '../src/mapping'

function fakeNode(id: string, canReact = true) {
  const reactions: unknown[][] = []
  const n: Record<string, unknown> = { id, reactions }
  if (canReact) n['setReactionsAsync'] = async (r: unknown[]) => { reactions.push(r) }
  return n as unknown as SceneNode & { reactions: unknown[][] }
}

function doc() {
  const nav = (target: string): Interaction => ({ trigger: { type: 'tap' }, action: { type: 'navigate', target }, transition: { type: 'slide', direction: 'left', durationMs: 300, easing: 'easeInOut' } })
  const bouton = { ...createComponentNode('button', { x: 0, y: 0, w: 200, h: 48 }), id: 'btn', interactions: [nav('e2')] } as Node
  const e1 = { ...createScreenNode('A', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [bouton]), id: 'e1' }
  const e2 = { ...createScreenNode('B', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, []), id: 'e2' }
  const d = createDocument('P')
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [e1, e2] }] }
}

describe('applyPrototype', () => {
  const plan = buildPlan({ document: doc(), images: {}, projectName: 'p', startScreenId: 'e1' })

  it('pose les reactions sur le calque source avec l identifiant Figma de la destination', async () => {
    const created = new Map<string, SceneNode>([['btn', fakeNode('1:10')], ['e1', fakeNode('1:1')], ['e2', fakeNode('1:2')]])
    const page = { flowStartingPoints: [] as unknown[] }
    const result = await applyPrototype({ currentPage: page } as unknown as PluginAPI, plan, created)
    expect(result.reactions).toBe(1)
    const sent = (created.get('btn') as unknown as { reactions: unknown[][] }).reactions[0]
    expect(sent).toEqual([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: '1:2', navigation: 'NAVIGATE', transition: { type: 'MOVE_IN', direction: 'RIGHT', matchLayers: false, duration: 0.3, easing: { type: 'EASE_IN_AND_OUT' } }, resetVideoPosition: false }] }])
  })
  it('definit l ecran de depart comme point de depart du flux', async () => {
    const created = new Map<string, SceneNode>([['btn', fakeNode('1:10')], ['e1', fakeNode('1:1')], ['e2', fakeNode('1:2')]])
    const page = { flowStartingPoints: [] as unknown[] }
    await applyPrototype({ currentPage: page } as unknown as PluginAPI, plan, created)
    expect(page.flowStartingPoints).toEqual([{ nodeId: '1:1', name: 'Départ' }])
  })
  it('une cible non creee ou un calque sans reactions est signale, sans rien casser', async () => {
    const created = new Map<string, SceneNode>([['btn', fakeNode('1:10', false)], ['e1', fakeNode('1:1')]])
    const result = await applyPrototype({ currentPage: { flowStartingPoints: [] } } as unknown as PluginAPI, plan, created)
    expect(result.reactions).toBe(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
  it('toFigmaReaction : retour, fermeture et URL n ont pas de destination', () => {
    const none = new Map<string, SceneNode>()
    expect(toFigmaReaction({ source: 'x', trigger: { type: 'ON_CLICK' }, action: { type: 'BACK' } }, none)).toEqual({ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] })
    expect(toFigmaReaction({ source: 'x', trigger: { type: 'AFTER_TIMEOUT', timeout: 2 }, action: { type: 'URL', url: 'https://x.test' } }, none)).toEqual({ trigger: { type: 'AFTER_TIMEOUT', timeout: 2 }, actions: [{ type: 'URL', url: 'https://x.test', openInNewTab: true }] })
    expect(toFigmaReaction({ source: 'x', trigger: { type: 'ON_CLICK' }, action: { type: 'CLOSE' } }, none)?.actions).toEqual([{ type: 'CLOSE' }])
  })
})
