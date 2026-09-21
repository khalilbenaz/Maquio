import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CalqueDocument } from '@calque/core'
import { composeExporter } from '../src/compose/compose'
import { loginScreenDocument } from './fixtures/login-screen'

const golden = (n: string) => readFileSync(join(__dirname, 'golden/compose', n), 'utf8')

describe('composeExporter', () => {
  const result = composeExporter.export(loginScreenDocument, { projectName: 'demo' })

  it('produit un fichier ecran', () => {
    expect(result.files.map((f) => f.path)).toEqual(['src/main/kotlin/screens/LoginScreen.kt'])
  })
  it('correspond au temoin de l ecran', () => {
    expect(result.files[0]!.contents).toBe(golden('LoginScreen.kt'))
  })
  // Correction Important 1/2 (vague de correction finale) : voir le
  // commentaire equivalent dans swiftui.test.ts -- meme fixture, meme
  // defaut (stretch et clipsContent approximes en silence par les deux
  // generateurs preview).
  it('avertit pour le stretch et le clipsContent non honores par cet exportateur preview', () => {
    expect(result.warnings).toEqual([
      'clipsContent non pris en charge par l export compose (apercu) (noeud frame-login-screen)',
      "alignCross: 'stretch' non pris en charge par l export compose (apercu) (noeud frame-login-screen)",
      'clipsContent non pris en charge par l export compose (apercu) (noeud frame-button)',
    ])
  })
  it('est deterministe', () => {
    expect(composeExporter.export(loginScreenDocument, { projectName: 'demo' }).files).toEqual(result.files)
  })

  const baseDevice = loginScreenDocument.pages[0]!.device

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
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.warnings).toContain('line non pris en charge par l export compose (apercu)')
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

  it('rend une ellipse avec CircleShape quand largeur == hauteur', () => {
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
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('CircleShape')
  })

  it('rend une image distante avec AsyncImage(model = ...)', () => {
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
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('AsyncImage(')
    expect(out.files[0]!.contents).toContain('model = "https://example.com/avatar.png"')
  })

  // Correction Critical 2 (corollaire, re-corrige apres re-revue) : une
  // premiere version emettait `painterResource(R.drawable.<nom>)`, mais
  // `R` n'est jamais importe par ce fichier (aucun nom de paquet
  // applicatif connu du generateur) -- un `Unresolved reference: R` a la
  // compilation. Tant que ce nom n'est pas connu, une image locale est
  // desormais signalee plutot que rendue. `src` non vide ici (contrairement
  // au cas `src: ''`, systematique pour tout espace reserve `image`
  // importe de Figma) : prouve que ce chemin d'avertissement est bien
  // atteint pour une vraie ressource nommee, pas seulement l'espace
  // reserve vide.
  it('avertit pour une image locale au lieu d emettre un painterResource(R....) non resolu', () => {
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
        src: 'assets/Icon@2x.png',
        fit: 'contain',
      },
    ])
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).not.toContain('painterResource(')
    expect(out.files[0]!.contents).not.toContain('R.drawable')
    expect(out.warnings.some((w) => w.includes('assets/Icon@2x.png'))).toBe(true)
  })

  // Ecart connu ferme (README, « Écarts connus ») : Compose avertissait
  // deja pour une image locale de nom connu (ci-dessus), mais pas pour le
  // cas `src: ''` proprement dit (systematique pour tout espace reserve
  // `image` importe de Figma) -- desormais couvert par le meme mecanisme
  // que les trois autres generateurs, avec un message dedie.
  it('avertit pour un noeud image de src vide, distinct du message pour une ressource locale nommee', () => {
    const doc = docWithNodes([
      {
        id: 'image-vide',
        name: 'Image',
        type: 'image',
        frame: { x: 0, y: 0, w: 80, h: 80 },
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        src: '',
        fit: 'cover',
      },
    ])
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).not.toContain('painterResource(')
    expect(out.files[0]!.contents).not.toContain('AsyncImage(')
    expect(out.warnings.some((w) => w.includes('image-vide'))).toBe(true)
  })

  it('positionne les enfants d une frame absolute avec Box et Modifier.offset', () => {
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
    const out = composeExporter.export(doc, { projectName: 'demo' })
    const contents = out.files[0]!.contents
    expect(contents).toContain('.offset(x = 10.dp, y = 20.dp)')
  })

  // Decision 7 du brief : echappement Kotlin propre a la cible. Un
  // guillemet simple n'a pas besoin d'etre echappe, mais `$` DOIT l'etre
  // (`\$`) car Kotlin interpole avec `$identifiant` / `${expr}` dans une
  // chaine a guillemets doubles, contrairement a TypeScript ou Swift.
  it('echappe correctement guillemet double, antislash, dollar et saut de ligne', () => {
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
    const out = composeExporter.export(doc, { projectName: 'demo' })
    expect(out.files[0]!.contents).toContain('"it\'s a \\"quote\\" \\\\b \\$100\\nline two"')
  })
})
