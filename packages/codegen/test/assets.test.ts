import { describe, expect, it } from 'vitest'
import { createDocument, createScreenNode, DEVICE_PRESETS } from '@maquio/core'
import type { MaquioDocument, ImageNode } from '@maquio/core'
import { composeExporter } from '../src/compose/compose'
import { flutterExporter } from '../src/flutter/flutter'
import { reactNativeExporter } from '../src/react-native/react-native'
import { swiftuiExporter } from '../src/swiftui/swiftui'

function image(id: string, src: string): ImageNode {
  return { id, name: id, type: 'image', frame: { x: 0, y: 0, w: 40, h: 40 }, visible: true, locked: false, opacity: 1, rotation: 0, src, fit: 'cover' }
}

function doc(): MaquioDocument {
  const d = createDocument('Doc')
  const ecran = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [
    image('i1', 'logo.png'),
    image('i2', '/Users/x/Photos/logo.png'), // meme nom de fichier, autre dossier
    image('i3', 'Photo Été.JPG'),
    image('i4', 'https://exemple.test/a.png'),
    image('i5', 'logo.png'), // meme source reutilisee
  ])
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [ecran] }] }
}

describe('images locales : copiees et declarees dans chaque cible', () => {
  it('Flutter : assets/images/ + pubspec.yaml qui les declare ; Image.asset sur le chemin du projet', () => {
    const out = flutterExporter.export(doc(), { projectName: 'Mon App' })
    expect(out.assets).toEqual([
      { source: 'logo.png', path: 'assets/images/logo.png' },
      { source: '/Users/x/Photos/logo.png', path: 'assets/images/logo_2.png' },
      { source: 'Photo Été.JPG', path: 'assets/images/Photo_Ete.jpg' },
    ])
    const pubspec = out.files.find((f) => f.path === 'pubspec.yaml')!.contents
    expect(pubspec).toContain('name: mon_app')
    expect(pubspec).toContain('  assets:\n    - assets/images/logo.png\n    - assets/images/logo_2.png\n    - assets/images/Photo_Ete.jpg')
    const screen = out.files.find((f) => f.path.startsWith('lib/screens/'))!.contents
    expect(screen).toMatch(/Image\.asset\(\s*'assets\/images\/logo\.png'/)
    expect(screen).toMatch(/Image\.asset\(\s*'assets\/images\/logo_2\.png'/)
    expect(screen).toMatch(/Image\.network\(\s*'https:\/\/exemple\.test\/a\.png'/)
    expect(screen.match(/assets\/images\/logo\.png/g)).toHaveLength(2) // i1 et i5 partagent le fichier
  })
  it('Flutter : sans image, pubspec sans section assets', () => {
    const out = flutterExporter.export(createDocument('x'), { projectName: 'demo' })
    expect(out.files.find((f) => f.path === 'pubspec.yaml')!.contents).not.toContain('assets:')
    expect(out.assets).toEqual([])
  })
  it('React Native : require relatif a src/screens vers assets/images/', () => {
    const out = reactNativeExporter.export(doc(), { projectName: 'demo' })
    expect(out.assets!.map((a) => a.path)).toEqual(['assets/images/logo.png', 'assets/images/logo_2.png', 'assets/images/Photo_Ete.jpg'])
    const screen = out.files.find((f) => f.path.startsWith('src/screens/'))!.contents
    expect(screen).toContain("require('../../assets/images/logo.png')")
    expect(screen).toContain("require('../../assets/images/Photo_Ete.jpg')")
    expect(screen).toContain("uri: 'https://exemple.test/a.png'")
  })
  it('SwiftUI : un .imageset par image dans Assets.xcassets, Image("nom")', () => {
    const out = swiftuiExporter.export(doc(), { projectName: 'demo' })
    expect(out.assets!.map((a) => a.path)).toEqual([
      'Sources/Assets.xcassets/logo.imageset/logo.png',
      'Sources/Assets.xcassets/logo_2.imageset/logo_2.png',
      'Sources/Assets.xcassets/Photo_Ete.imageset/Photo_Ete.jpg',
    ])
    const paths = out.files.map((f) => f.path)
    expect(paths).toContain('Sources/Assets.xcassets/Contents.json')
    expect(paths).toContain('Sources/Assets.xcassets/logo.imageset/Contents.json')
    expect(JSON.parse(out.files.find((f) => f.path.endsWith('logo.imageset/Contents.json'))!.contents).images[0].filename).toBe('logo.png')
    expect(out.files.find((f) => f.path.startsWith('Sources/Screens/'))!.contents).toContain('Image("logo")')
  })
  it('Compose : res/drawable en snake_case et R.drawable', () => {
    const out = composeExporter.export(doc(), { projectName: 'demo' })
    expect(out.assets!.map((a) => a.path)).toEqual(['src/main/res/drawable/logo.png', 'src/main/res/drawable/logo_2.png', 'src/main/res/drawable/photo_ete.jpg'])
    const screen = out.files.find((f) => f.path.startsWith('src/main/kotlin/screens/'))!.contents
    expect(screen).toContain('R.drawable.logo)')
    expect(screen).toContain('R.drawable.photo_ete)')
    expect(screen).toContain('import com.example.app.R')
  })
  it('un nom commencant par un chiffre reste un nom de ressource Android valide', () => {
    const d = createDocument('x')
    const e = createScreenNode('A', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [image('i', '2fa.png')])
    const out = composeExporter.export({ ...d, pages: [{ ...d.pages[0]!, nodes: [e] }] }, { projectName: 'demo' })
    expect(out.assets![0]!.path).toBe('src/main/res/drawable/img_2fa.png')
  })
  it('l avatar local suit la meme regle (Flutter)', () => {
    const d = createDocument('x')
    const avatar = { id: 'av', name: 'av', type: 'component' as const, kind: 'avatar' as const, frame: { x: 0, y: 0, w: 40, h: 40 }, visible: true, locked: false, opacity: 1, rotation: 0, props: { initials: 'AB', src: 'moi.png', size: 40 } }
    const e = createScreenNode('A', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [avatar as never])
    const out = flutterExporter.export({ ...d, pages: [{ ...d.pages[0]!, nodes: [e] }] }, { projectName: 'demo' })
    expect(out.assets).toEqual([{ source: 'moi.png', path: 'assets/images/moi.png' }])
    expect(out.files.find((f) => f.path.startsWith('lib/screens/'))!.contents).toContain("AssetImage('assets/images/moi.png')")
  })
})
