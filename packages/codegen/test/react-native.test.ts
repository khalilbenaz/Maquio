import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CalqueDocument } from '@calque/core'
import { reactNativeExporter } from '../src/react-native/react-native'
import { loginScreenDocument } from './fixtures/login-screen'

const golden = (n: string) => readFileSync(join(__dirname, 'golden/react-native', n), 'utf8')

describe('reactNativeExporter', () => {
  const result = reactNativeExporter.export(loginScreenDocument, { projectName: 'demo' })

  it('produit un ecran et un theme', () => {
    expect(result.files.map((f) => f.path).sort()).toEqual(['src/screens/LoginScreen.tsx', 'src/theme.ts'])
  })
  it('correspond au temoin de l ecran', () => {
    expect(result.files.find((f) => f.path.endsWith('.tsx'))!.contents).toBe(golden('LoginScreen.tsx'))
  })
  it('correspond au temoin du theme', () => {
    expect(result.files.find((f) => f.path.endsWith('theme.ts'))!.contents).toBe(golden('theme.ts'))
  })
  it('est deterministe', () => {
    expect(reactNativeExporter.export(loginScreenDocument, { projectName: 'demo' }).files).toEqual(result.files)
  })

  // Decision 5 du brief : React Native couvre les six types de noeud, ses
  // warnings sont vides sur la fixture.
  it('ne produit aucun avertissement sur la fixture', () => {
    expect(result.warnings).toEqual([])
  })

  const baseDevice = loginScreenDocument.pages[0]!.device

  function docWithNodes(nodes: CalqueDocument['pages'][number]['nodes'], pageName = 'Sample'): CalqueDocument {
    return {
      version: loginScreenDocument.version,
      id: 'doc-sample',
      name: pageName,
      pages: [{ id: 'page-sample', name: pageName, device: baseDevice, nodes }],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }
  }

  it('rend une ellipse avec un borderRadius egal a la moitie du plus petit cote', () => {
    const doc = docWithNodes([
      {
        id: 'ellipse-a',
        name: 'Avatar',
        type: 'ellipse',
        frame: { x: 0, y: 0, w: 80, h: 40 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }],
        strokes: [],
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain('borderRadius: 20')
    expect(out.warnings).toEqual([])
  })

  it('rend une image distante avec source uri', () => {
    const doc = docWithNodes([
      {
        id: 'image-a',
        name: 'Avatar',
        type: 'image',
        frame: { x: 0, y: 0, w: 80, h: 80 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        src: 'https://example.com/avatar.png',
        fit: 'cover',
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain("source={{ uri: 'https://example.com/avatar.png' }}")
  })

  it('rend une image locale avec require()', () => {
    const doc = docWithNodes([
      {
        id: 'image-b',
        name: 'Logo',
        type: 'image',
        frame: { x: 0, y: 0, w: 80, h: 80 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        src: './assets/logo.png',
        fit: 'contain',
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain("source={require('./assets/logo.png')}")
  })

  it('rend une ligne comme une View d un pixel', () => {
    const doc = docWithNodes([
      {
        id: 'line-a',
        name: 'Separator',
        type: 'line',
        frame: { x: 0, y: 0, w: 100, h: 0 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        stroke: { color: { r: 0, g: 0, b: 0, a: 1 }, width: 1 },
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain('width: 100')
    expect(file.contents).toContain('height: 1')
  })

  it('positionne les enfants d une frame absolute avec left/top/width/height', () => {
    const doc = docWithNodes([
      {
        id: 'frame-abs',
        name: 'Absolute',
        type: 'frame',
        frame: { x: 0, y: 0, w: 200, h: 200 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        layout: {
          mode: 'absolute',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          alignMain: 'start',
          alignCross: 'start',
        },
        fills: [{ type: 'none' }],
        strokes: [],
        cornerRadius: 0,
        clipsContent: true,
        children: [
          {
            id: 'rect-abs-child',
            name: 'Child',
            type: 'rect',
            frame: { x: 10, y: 20, w: 30, h: 40 },
            visible: true,
            locked: false,
            opacity: 1,
            rotation: 0,
            fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
            strokes: [],
            cornerRadius: 0,
          },
        ],
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain("position: 'absolute'")
    expect(file.contents).toContain('left: 10')
    expect(file.contents).toContain('top: 20')
    expect(file.contents).toContain('width: 30')
    expect(file.contents).toContain('height: 40')
  })

  it('applique opacity et transform: rotate en degres sans conversion', () => {
    const doc = docWithNodes([
      {
        id: 'rect-op',
        name: 'Faded',
        type: 'rect',
        frame: { x: 0, y: 0, w: 50, h: 50 },
        visible: true,
        locked: false,
        opacity: 0.5,
        rotation: 90,
        fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokes: [],
        cornerRadius: 0,
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain('opacity: 0.5')
    expect(file.contents).toContain("transform: [{ rotate: '90deg' }]")
  })

  it('n emet aucun noeud pour visible: false', () => {
    const doc = docWithNodes([
      {
        id: 'rect-hidden',
        name: 'Hidden',
        type: 'rect',
        frame: { x: 0, y: 0, w: 50, h: 50 },
        visible: false,
        locked: false,
        opacity: 1,
        rotation: 0,
        fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokes: [],
        cornerRadius: 0,
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).not.toContain('rectHidden')
  })

  // Decision 7 du brief : echappement JSX/TS propre a la cible (pas Dart).
  // Un `$` n'a pas besoin d'etre echappe dans une chaine JS a guillemets
  // simples (pas d'interpolation `${}` hors template literal), a la
  // difference de Dart, Swift ou Kotlin.
  it('echappe correctement apostrophe, guillemet double, antislash, dollar et saut de ligne', () => {
    const doc = docWithNodes([
      {
        id: 'text-tricky',
        name: 'Tricky',
        type: 'text',
        frame: { x: 0, y: 0, w: 200, h: 40 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        characters: 'it\'s a "quote" \\b $100\nline two',
        style: {
          fontFamily: 'Inter',
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 0,
          letterSpacing: 0,
          color: { r: 0, g: 0, b: 0, a: 1 },
          align: 'left',
        },
      },
    ])
    const out = reactNativeExporter.export(doc, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('.tsx'))!
    expect(file.contents).toContain("{'it\\'s a \"quote\" \\\\b $100\\nline two'}")
  })
})
