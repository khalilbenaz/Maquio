import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFINITIONS, createComponentNode, createContainerNode } from '../components/catalog'
import { COMPONENT_KINDS, CONTAINER_KINDS } from '../components/props'
import type { ComponentNode } from '../model/types'
import { componentSketch, componentVariant, containerSketch, hexOf } from './sketch'

const make = (kind: (typeof COMPONENT_KINDS)[number], overrides: Record<string, unknown> = {}) => {
  const d = COMPONENT_DEFINITIONS[kind]
  return createComponentNode(kind, { x: 0, y: 0, ...d.size }, overrides as never) as ComponentNode
}

describe('hexOf', () => {
  it('convertit en #rrggbb, avec l alpha seulement s il est < 1', () => {
    expect(hexOf({ r: 1, g: 0, b: 0.5, a: 1 })).toBe('#ff0080')
    expect(hexOf({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
  })
})

describe('componentSketch : chaque composant du catalogue a un croquis', () => {
  for (const kind of COMPONENT_KINDS) {
    it(`${kind} : primitives valides, dans le cadre`, () => {
      const node = make(kind)
      const prims = componentSketch(node)
      if (kind !== 'spacer') expect(prims.length).toBeGreaterThan(0)
      for (const p of prims) {
        if (p.t === 'line') {
          expect(Number.isFinite(p.x1 + p.y1 + p.x2 + p.y2)).toBe(true)
        } else {
          expect(Number.isFinite(p.x + p.y + p.w + p.h)).toBe(true)
          expect(p.w).toBeGreaterThanOrEqual(0)
          expect(p.h).toBeGreaterThanOrEqual(0)
        }
      }
    })
  }
  it('le libelle d un bouton est un emplacement de texte nomme (« label »)', () => {
    const prims = componentSketch(make('button', { label: 'Valider' }))
    expect(prims.find((p) => p.t === 'text' && p.slot === 'label')).toMatchObject({ text: 'Valider' })
  })
  it('un presets du catalogue produit aussi un croquis', () => {
    for (const kind of COMPONENT_KINDS) for (const preset of COMPONENT_DEFINITIONS[kind].presets) expect(() => componentSketch(make(kind, preset.props as Record<string, unknown>))).not.toThrow()
  })
})

describe('componentVariant', () => {
  it('deux boutons de meme apparence partagent la meme variante, le texte n y entre pas', () => {
    const a = componentVariant(make('button', { label: 'A' }))
    const b = componentVariant(make('button', { label: 'B' }))
    expect(a).toEqual(b)
    expect(a.setName).toBe('Bouton')
  })
  it('les variantes distinguent variante, etat et icone', () => {
    const p = componentVariant(make('button', { variant: 'primary' }))
    const s = componentVariant(make('button', { variant: 'secondary' }))
    const d = componentVariant(make('button', { disabled: true }))
    expect(new Set([JSON.stringify(p), JSON.stringify(s), JSON.stringify(d)]).size).toBe(3)
  })
  it('un composant sans variante a un ensemble nomme et aucune propriete', () => {
    expect(componentVariant(make('slider'))).toEqual({ setName: 'Curseur', properties: {} })
  })
})

describe('containerSketch', () => {
  it('poignee de la feuille basse et separateurs de liste', () => {
    const sheet = createContainerNode('bottomSheet', { x: 0, y: 0, w: 300, h: 200 })
    expect(containerSketch(sheet).over.some((p) => p.t === 'rect' && p.w === 32)).toBe(true)
    for (const kind of CONTAINER_KINDS) expect(() => containerSketch(createContainerNode(kind, { x: 0, y: 0, w: 100, h: 100 }))).not.toThrow()
  })
})
