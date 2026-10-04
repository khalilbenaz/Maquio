// Prototype bancaire -> bundle Figma (exporteur) -> plan du plugin (mapping pur) :
// 21 ecrans, des reactions de prototype, des overlays, aucune erreur.
import { describe, expect, it } from 'vitest'
import { figmaExporter } from '../../packages/codegen/src/figma/figma'
import { buildPlan, parseBundle } from '../../apps/figma-plugin/src/mapping'
import { documentBanque } from './fixtures/banque'

describe('prototype bancaire vers Figma', () => {
  const result = figmaExporter.export(documentBanque(), { projectName: 'banque' })
  const file = result.files.find((f) => f.path.endsWith('.figma.json'))!
  const plan = buildPlan(parseBundle(file.contents))
  it('produit un bundle lisible avec les 21 ecrans', () => {
    expect(plan.screens).toHaveLength(21)
  })
  it('porte les reactions de prototype (navigation, overlays) et les overlays', () => {
    expect(plan.reactions.length).toBeGreaterThan(40)
    expect(plan.overlays.length).toBeGreaterThanOrEqual(6)
  })
  it('n emet aucun avertissement bloquant (hors limites connues de l API Figma)', () => {
    const inattendus = plan.warnings.filter((w) => !/overlay|superposition|position|voile/i.test(w))
    expect(inattendus).toEqual([])
  })
})
