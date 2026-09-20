import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CalqueDocument } from '@calque/core'
import { flutterExporter } from '../src/flutter/flutter'
import { loginScreenDocument } from './fixtures/login-screen'

const golden = (name: string) => readFileSync(join(__dirname, 'golden/flutter', name), 'utf8')

describe('flutterExporter', () => {
  const result = flutterExporter.export(loginScreenDocument, { projectName: 'demo' })

  it('produit un fichier par page plus le theme', () => {
    expect(result.files.map((f) => f.path).sort())
      .toEqual(['lib/screens/login_screen.dart', 'lib/theme.dart'])
  })

  it('correspond au fichier temoin de l ecran', () => {
    const file = result.files.find((f) => f.path.endsWith('login_screen.dart'))!
    expect(file.contents).toBe(golden('login_screen.dart'))
  })

  it('correspond au fichier temoin du theme', () => {
    const file = result.files.find((f) => f.path.endsWith('theme.dart'))!
    expect(file.contents).toBe(golden('theme.dart'))
  })

  it('signale les noeuds image distants sans avertissement bloquant', () => {
    expect(result.warnings).toEqual([])
  })

  it('est deterministe', () => {
    const second = flutterExporter.export(loginScreenDocument, { projectName: 'demo' })
    expect(second.files).toEqual(result.files)
  })

  // Decision 10 du brief Tache 7 : un texte contenant une apostrophe, un
  // antislash, un signe dollar (interpolation Dart) et un saut de ligne doit
  // produire un litteral Dart valide et correctement echappe. Un generateur
  // qui produit du code non compilable est pire qu'inutile.
  it('echappe correctement apostrophe, antislash, dollar et saut de ligne', () => {
    const tricky: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-tricky',
      name: 'Tricky',
      pages: [
        {
          id: 'page-tricky',
          name: 'TrickyScreen',
          device: loginScreenDocument.pages[0]!.device,
          nodes: [
            {
              id: 'text-tricky',
              name: 'TrickyText',
              type: 'text',
              frame: { x: 0, y: 0, w: 200, h: 40 },
              visible: true,
              locked: false,
              opacity: 1,
              rotation: 0,
              characters: "it's a\\b $100\nline two",
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
          ],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }

    const trickyResult = flutterExporter.export(tricky, { projectName: 'demo' })
    const file = trickyResult.files.find((f) => f.path.endsWith('tricky_screen.dart'))!
    expect(file.contents).toContain("'it\\'s a\\\\b \\$100\\nline two'")
  })

  // Decision 11 du brief Tache 7 : un type de noeud inconnu du generateur
  // n'est jamais ignore en silence, il ajoute une ligne dans warnings. On
  // force ce cas via un cast, un CalqueDocument valide ne peut pas le
  // produire naturellement (union exhaustive de Node).
  it('signale un type de noeud inconnu dans warnings au lieu de l ignorer', () => {
    const unknownNode = {
      id: 'node-unknown',
      name: 'Mystere',
      type: 'polygon',
      frame: { x: 0, y: 0, w: 10, h: 10 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
    } as unknown as CalqueDocument['pages'][number]['nodes'][number]

    const doc: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-unknown',
      name: 'Unknown',
      pages: [
        {
          id: 'page-unknown',
          name: 'UnknownScreen',
          device: loginScreenDocument.pages[0]!.device,
          nodes: [unknownNode],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }

    const unknownResult = flutterExporter.export(doc, { projectName: 'demo' })
    expect(unknownResult.warnings.length).toBeGreaterThan(0)
    expect(unknownResult.warnings[0]).toContain('polygon')
  })
})
