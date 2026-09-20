import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CalqueDocument } from '@calque/core'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { loginScreenDocument } from './fixtures/login-screen'

const golden = (n: string) => readFileSync(join(__dirname, 'golden/swiftui', n), 'utf8')

describe('swiftUIExporter', () => {
  const result = swiftuiExporter.export(loginScreenDocument, { projectName: 'demo' })

  it('produit un fichier ecran', () => {
    expect(result.files.map((f) => f.path)).toEqual(['Sources/Screens/LoginScreen.swift'])
  })
  it('correspond au temoin de l ecran', () => {
    expect(result.files[0]!.contents).toBe(golden('LoginScreen.swift'))
  })
  // Correction Important 1/2 (vague de correction finale) : la fixture
  // login-screen a un frame racine en `alignCross: 'stretch'` et deux
  // frames `clipsContent: true` -- des le round precedent, mais jamais
  // verifie faute de test traversant figma -> codegen (Critical 4). Ce
  // generateur `preview` n'honore ni l'un ni l'autre : il doit desormais
  // le dire plutot que produire un rendu approxime en silence.
  it('avertit pour le stretch et le clipsContent non honores par cet exportateur preview', () => {
    expect(result.warnings).toEqual([
      "clipsContent non pris en charge par l export swiftui (apercu) (noeud frame-login-screen)",
      "alignCross: 'stretch' non pris en charge par l export swiftui (apercu) (noeud frame-login-screen)",
      'clipsContent non pris en charge par l export swiftui (apercu) (noeud frame-button)',
    ])
  })
  it('est deterministe', () => {
    expect(swiftuiExporter.export(loginScreenDocument, { projectName: 'demo' }).files).toEqual(result.files)
  })

  const baseDevice = loginScreenDocument.pages[0]!.device

  // Decision du brief Tache 9 : un LineNode ajoute a la fixture (pas la
  // fixture elle-meme, qui ne bouge pas) doit avertir plutot qu'etre
  // ignore en silence.
  it('avertit pour un noeud non couvert au lieu de l ignorer en silence', () => {
    const doc: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-with-line',
      name: 'WithLine',
      pages: [
        {
          id: 'page-with-line',
          name: 'WithLine',
          device: baseDevice,
          nodes: [
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
          ],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    expect(out.warnings).toContain('line non pris en charge par l export swiftui (apercu)')
  })

  function docWithNodes(nodes: CalqueDocument['pages'][number]['nodes']): CalqueDocument {
    return {
      version: loginScreenDocument.version,
      id: 'doc-sample',
      name: 'Sample',
      pages: [{ id: 'page-sample', name: 'Sample', device: baseDevice, nodes }],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }
  }

  it('rend une ellipse en Circle quand largeur == hauteur', () => {
    const doc = docWithNodes([
      {
        id: 'ellipse-a',
        name: 'Avatar',
        type: 'ellipse',
        frame: { x: 0, y: 0, w: 60, h: 60 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }],
        strokes: [],
      },
    ])
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('Circle()')
  })

  it('rend une image distante avec AsyncImage(url:)', () => {
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
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('AsyncImage(url:')
  })

  it('rend une image locale avec Image("...")', () => {
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
        src: 'logo',
        fit: 'contain',
      },
    ])
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('Image("logo")')
  })

  it('positionne les enfants d une frame absolute avec ZStack et offset', () => {
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
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    const contents = out.files[0]!.contents
    expect(contents).toContain('ZStack(alignment: .topLeading)')
    expect(contents).toContain('.offset(x: 10, y: 20)')
  })

  // Decision 7 du brief : echappement Swift propre a la cible. `$` et `'`
  // n'ont pas besoin d'etre echappes en Swift (pas de sens special hors
  // interpolation `\(...)`), a la difference de Dart.
  it('echappe correctement guillemet double, antislash et saut de ligne', () => {
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
    const out = swiftuiExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('Text("it\'s a \\"quote\\" \\\\b $100\\nline two")')
  })
})
