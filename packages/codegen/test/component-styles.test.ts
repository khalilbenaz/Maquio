// Proprietes de style ajoutees aux composants pour la maquette « nacre » :
// couleur d'accent de la barre d'onglets (barre plate), couleur de
// l'interrupteur, piste de la barre de progression, typographie et aplat du
// bouton. Chaque cible doit les emettre.
import { describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, PALETTE_ITEMS, createDocument, createScreenNode } from '@maquio/core'
import type { MaquioDocument, Node, Rect } from '@maquio/core'
import { flutterExporter } from '../src/flutter/flutter'
import { reactNativeExporter } from '../src/react-native/react-native'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { composeExporter } from '../src/compose/compose'

const accent = { r: 0.263, g: 0.22, b: 1, a: 1 }
const track = { r: 0.9, g: 0.91, b: 0.92, a: 1 }
function make(id: string, frame: Partial<Rect>, props: Record<string, unknown>): Node {
  const entry = PALETTE_ITEMS.find((i) => i.id === id)!
  const node = entry.build({ x: 0, y: 0, w: entry.size.w, h: entry.size.h, ...frame })
  return { ...node, props: { ...(node as { props: object }).props, ...props }, id: id } as Node
}
function doc(): MaquioDocument {
  const d = createDocument('Styles')
  const ecran = createScreenNode('Ecran', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [
    make('button', { x: 24, y: 100, w: 345, h: 54 }, { label: 'Continuer', color: accent, fontSize: 17, fontWeight: 700, flat: true }),
    make('switch', { x: 24, y: 200, w: 345, h: 48 }, { label: 'Sans contact', checked: true, color: accent }),
    make('progressBar', { x: 24, y: 300, w: 345, h: 8 }, { value: 0.5, color: accent, trackColor: track }),
    make('bottomNav', { x: 0, y: 756, w: 393, h: 96 }, { selectedIndex: 0, color: accent }),
  ])
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [{ ...ecran, id: 'ecran' }] }] }
}
const out = (e: { export: (d: MaquioDocument, o: { projectName: string }) => { files: { contents: string }[] } }) => e.export(doc(), { projectName: 'demo' }).files.map((f) => f.contents).join('\n')

describe('styles de composants', () => {
  it('Flutter', () => {
    const s = out(flutterExporter)
    expect(s).toContain('fontSize: 17')
    expect(s).toContain('FontWeight.w700')
    expect(s).toContain('elevation: 0')
    expect(s).toContain('activeTrackColor:')
    expect(s).toContain('backgroundColor: const Color')
    expect(s).toContain('minHeight: 8')
    expect(s).toContain('selectedItemColor:')
  })
  it('React Native', () => {
    const s = out(reactNativeExporter)
    expect(s).toMatch(/fontSize: 17/)
    expect(s).toMatch(/fontWeight: '700'/)
    expect(s).toMatch(/trackColor=\{\{ true: '#4338ff/i)
    expect(s).toMatch(/backgroundColor: '#e6e8eb/i)
  })
  it('SwiftUI', () => {
    const s = out(swiftuiExporter)
    expect(s).toContain('.font(.system(size: 17, weight: .bold))')
    expect((s.match(/\.tint\(/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
  it('Compose', () => {
    const s = out(composeExporter)
    expect(s).toContain('fontSize = 17.sp')
    expect(s).toContain('FontWeight(700)')
    expect(s).toContain('checkedTrackColor =')
    expect(s).toContain('trackColor =')
    expect(s).toContain('NavigationBarItemDefaults.colors(selectedIconColor =')
  })
})
