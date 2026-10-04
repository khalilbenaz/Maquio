// Prototype bancaire -> bundle Figma (exporteur) -> plan du plugin (mapping pur) :
// 16 ecrans, des reactions de prototype, aucune erreur.
import { describe, expect, it } from 'vitest'
import { figmaExporter } from '../../packages/codegen/src/figma/figma'
import { buildPlan, parseBundle } from '../../apps/figma-plugin/src/mapping'
import { documentBanque } from './fixtures/banque'

describe('prototype bancaire vers Figma', () => {
  const result = figmaExporter.export(documentBanque(), { projectName: 'banque' })
  const file = result.files.find((f) => f.path.endsWith('.figma.json'))!
  const plan = buildPlan(parseBundle(file.contents))
  it('produit un bundle lisible avec les 16 ecrans et la barre d onglets', () => {
    expect(plan.screens).toHaveLength(17)
  })
  it('porte les reactions de prototype (navigation, retour, barre d onglets)', () => {
    expect(plan.reactions.length).toBeGreaterThan(30)
  })
  it('n emet aucun avertissement bloquant (hors limites connues de l API Figma)', () => {
    const inattendus = plan.warnings.filter((w) => !/overlay|superposition|position|voile/i.test(w))
    expect(inattendus).toEqual([])
  })
})
