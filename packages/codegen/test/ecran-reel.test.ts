// Parcours reel (rapport e2e) : un document cree dans l'editeur contient un
// ECRAN (frame de premier niveau avec `device`) dont les enfants sont en
// mise en page absolue. Les exports ne doivent perdre ni la position de ces
// enfants, ni la taille de l'ecran, ni le nom accentue de l'ecran.
import { describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, createDocument, createScreenNode } from '@calque/core'
import type { CalqueDocument, RectNode } from '@calque/core'
import { composeExporter } from '../src/compose/compose'
import { flutterExporter } from '../src/flutter/flutter'
import { reactNativeExporter } from '../src/react-native/react-native'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import { toPascalCase } from '../src/shared/naming'
import { toSnakeCase } from '../src/flutter/dart-utils'

const rect = (id: string, x: number, y: number): RectNode => ({
  id, name: id, type: 'rect', frame: { x, y, w: 100, h: 60 }, visible: true, locked: false,
  opacity: 1, rotation: 0, fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }], strokes: [], cornerRadius: 0,
})

function docAvecEcrans(...noms: string[]): CalqueDocument {
  const doc = createDocument('Projet')
  const page = doc.pages[0]!
  const ecrans = noms.map((nom, i) =>
    createScreenNode(nom, DEVICE_PRESETS.iphone15, { x: i * 500, y: 0, w: 393, h: 852 }, [rect(`r${i}`, 50, 70)]),
  )
  return { ...doc, pages: [{ ...page, nodes: ecrans }] }
}

describe('un ecran exporte garde la position de ses enfants et sa taille', () => {
  const doc = docAvecEcrans('Accueil')

  it('Flutter : Positioned(left: 50, top: 70) et ecran de 393 x 852', () => {
    const f = flutterExporter.export(doc, { projectName: 'p' }).files.find((x) => x.path.includes('screens'))!
    expect(f.contents).toMatch(/Positioned\(\s*left: 50,\s*top: 70/)
    expect(f.contents).toContain('393')
  })

  it('React Native : position absolute left 50 top 70', () => {
    const f = reactNativeExporter.export(doc, { projectName: 'p' }).files.find((x) => x.path.includes('screens'))!
    expect(f.contents).toContain("position: 'absolute'")
    expect(f.contents).toContain('left: 50')
    expect(f.contents).toContain('top: 70')
  })

  it('SwiftUI : offset(x: 50, y: 70)', () => {
    const f = swiftuiExporter.export(doc, { projectName: 'p' }).files.find((x) => x.path.includes('Screens'))!
    expect(f.contents).toContain('.offset(x: 50, y: 70)')
  })

  it('Compose : offset(x = 50.dp, y = 70.dp)', () => {
    const f = composeExporter.export(doc, { projectName: 'p' }).files.find((x) => x.path.includes('screens'))!
    expect(f.contents).toContain('.offset(x = 50.dp, y = 70.dp)')
  })

  it('Compose : toute classe utilisee est importee', () => {
    const f = composeExporter.export(doc, { projectName: 'p' }).files[0]!
    if (/\bColumn\b/.test(f.contents)) expect(f.contents).toContain('layout.Column')
  })
})

describe('React Native : image locale', () => {
  it("require() recoit un chemin relatif ('./logo.png'), pas un nom de module nu", () => {
    const doc = docAvecEcrans('Accueil')
    const ecran = doc.pages[0]!.nodes[0]!
    if (ecran.type !== 'frame') throw new Error('ecran attendu')
    ecran.children.push({
      id: 'img', name: 'img', type: 'image', frame: { x: 0, y: 0, w: 10, h: 10 }, visible: true, locked: false,
      opacity: 1, rotation: 0, src: 'logo.png', fit: 'cover',
    })
    const f = reactNativeExporter.export(doc, { projectName: 'p' }).files.find((x) => x.path.includes('screens'))!
    expect(f.contents).toContain("require('./logo.png')")
  })
})

describe('noms de pages', () => {
  it('toPascalCase conserve les lettres accentuees (sans accent)', () => {
    expect(toPascalCase("Écran d'accueil")).toBe('EcranDAccueil')
    expect(toSnakeCase("Écran d'accueil")).toBe('ecran_d_accueil')
  })

  it('un nom vide ou non latin donne un identifiant de repli valide', () => {
    expect(toPascalCase('登录')).toBe('Screen')
    expect(toPascalCase('')).toBe('Screen')
    expect(toSnakeCase('登录')).toBe('screen')
  })

  it('un nom commencant par un chiffre recoit un prefixe', () => {
    expect(toPascalCase('2fa')).toBe('Screen2fa')
    expect(toSnakeCase('2fa')).toBe('screen_2fa')
  })

  it('deux pages de meme nom produisent deux fichiers distincts (4 cibles)', () => {
    const base = docAvecEcrans('Accueil')
    const page = base.pages[0]!
    const doc: CalqueDocument = {
      ...base,
      pages: [page, { ...page, id: 'page-2' }],
    }
    for (const exp of [flutterExporter, reactNativeExporter, swiftuiExporter, composeExporter]) {
      const paths = exp.export(doc, { projectName: 'p' }).files.map((f) => f.path)
      expect(new Set(paths).size, exp.id).toBe(paths.length)
    }
  })
})
