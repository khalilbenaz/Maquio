import { describe, expect, it } from 'vitest'
import { nodeSchema } from './schema'

describe('nodeSchema', () => {
  it('accepte une frame avec enfants imbriques', () => {
    const frame = {
      id: 'f1', name: 'Ecran', type: 'frame',
      frame: { x: 0, y: 0, w: 393, h: 852 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'column', gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'stretch' },
      fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }],
      strokes: [], cornerRadius: 0, clipsContent: true,
      children: [{ id: 't1', name: 'Titre', type: 'text', frame: { x: 0, y: 0, w: 100, h: 20 }, visible: true, locked: false, opacity: 1, rotation: 0, characters: 'Bonjour', style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' } }],
    }
    expect(nodeSchema.parse(frame)).toEqual(frame)
  })

  it('rejette un type de noeud inconnu', () => {
    expect(() => nodeSchema.parse({ type: 'hologramme' })).toThrow()
  })
})
