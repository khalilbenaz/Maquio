// Un dialogue de confirmation peut porter une interaction (ex. « Valider » ->
// ecran de succes). Elle doit etre exportee : sinon un virement ou une
// deconnexion ne peut jamais aboutir dans l'application generee.
// Bug decouvert en validant le prototype bancaire.
import { describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, PALETTE_ITEMS, createDocument, createScreenNode } from '@maquio/core'
import type { Interaction, MaquioDocument, Node, Rect } from '@maquio/core'
import { flutterExporter } from '../src/flutter/flutter'
import { reactNativeExporter } from '../src/react-native/react-native'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { composeExporter } from '../src/compose/compose'

function make(id: string, frame: Partial<Rect>, name: string, props: Record<string, unknown> = {}, interactions: Interaction[] = []): Node {
  const entry = PALETTE_ITEMS.find((i) => i.id === id)!
  const node = entry.build({ x: 0, y: 0, w: entry.size.w, h: entry.size.h, ...frame })
  const withProps = node.type === 'component' ? ({ ...node, props: { ...node.props, ...props } } as Node) : node
  return { ...withProps, name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ...(interactions.length > 0 ? { interactions } : {}) } as Node
}

function doc(): MaquioDocument {
  const d = createDocument('Dialogue')
  const dialogue = make('dialog', { x: 40, y: 300, w: 313, h: 200 }, 'Confirmation', { title: 'Code', message: 'Saisir le code', confirmLabel: 'Valider', cancelLabel: 'Annuler' }, [
    { trigger: { type: 'tap' }, action: { type: 'navigate', target: 'succes' }, transition: { type: 'fade', durationMs: 300, easing: 'linear' } },
  ])
  const ecran = (id: string, name: string, x: number, children: Node[]) => ({ ...createScreenNode(name, DEVICE_PRESETS.iphone15, { x, y: 0, w: 393, h: 852 }, children), id })
  const virement = ecran('virement', 'Virement', 0, [
    make('button', { x: 24, y: 100, w: 345, h: 48 }, 'Confirmer', { label: 'Confirmer' }, [{ trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay: 'dialog', target: 'confirmation' }, transition: { type: 'fade', durationMs: 200, easing: 'linear' } }]),
    dialogue,
  ])
  const succes = ecran('succes', 'Succes', 500, [make('button', { x: 24, y: 100, w: 345, h: 48 }, 'Fin', { label: 'Fin' })])
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [virement, succes] }] }
}

const run = (e: { export: (d: MaquioDocument, o: { projectName: string }) => { files: { path: string; contents: string }[] } }) => e.export(doc(), { projectName: 'demo' }).files
const all = (files: { contents: string }[]) => files.map((f) => f.contents).join('\n')

describe('dialogue qui navigue', () => {
  it('Flutter : Valider ferme le dialogue puis navigue', () => {
    const src = all(run(flutterExporter))
    expect(src).toMatch(/onPressed: \(\) \{\s*Navigator\.of\(context\)\.pop\(\);\s*goSuccesFade\(context\);\s*\}/)
  })
  it('React Native : Valider ferme le dialogue puis navigue', () => {
    const src = all(run(reactNativeExporter))
    expect(src).toMatch(/setOverlay\(null\);\s*navigation\.navigate\('Succes'/)
  })
  it('SwiftUI : Valider navigue vers l ecran de succes', () => {
    const src = all(run(swiftuiExporter))
    expect(src).toMatch(/Button\("Valider"\) \{[^}]*go\(\.succes/)
  })
  it('Compose : Valider ferme le dialogue puis navigue', () => {
    const src = all(run(composeExporter))
    expect(src).toMatch(/confirmButton = \{ TextButton\(onClick = \{ overlay = null; navController\.navigate\("succes"/)
  })
})
