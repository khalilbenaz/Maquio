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
      .toEqual(['lib/screens/login_screen.dart', 'lib/theme.dart', 'pubspec.yaml'])
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

  // Ecart connu ferme (README, « Écarts connus ») : un noeud image dont
  // le src est vide (systematique pour tout espace reserve `image`
  // importe de Figma, ou trace dans l'editeur avant tout choix de
  // fichier) n'emet plus `Image.asset('')` en silence -- avertit, et
  // n'emet aucune reference a la ressource vide.
  it('avertit pour un noeud image de src vide au lieu d emettre Image.asset(\'\')', () => {
    const docAvecImageVide: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-image-vide',
      name: 'ImageVide',
      pages: [
        {
          id: 'page-image-vide',
          name: 'ImageVideScreen',
          device: loginScreenDocument.pages[0]!.device,
          nodes: [
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
          ],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }

    const out = flutterExporter.export(docAvecImageVide, { projectName: 'demo' })
    const file = out.files.find((f) => f.path.endsWith('image_vide_screen.dart'))!
    expect(file.contents).not.toContain('Image.asset(')
    expect(file.contents).not.toContain('Image.network(')
    expect(out.warnings.some((w) => w.includes('image-vide'))).toBe(true)
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

  // Correction round 1 (Important 1) : alignMain: 'space-between' ne doit
  // JAMAIS inserer de SizedBox de gap entre les enfants. `applyAutoLayout`
  // de @calque/core ignore deja `gap` dans ce mode (l'espacement vient
  // entierement de MainAxisAlignment.spaceBetween) ; un SizedBox compterait
  // comme un enfant de plus pour Flutter, qui repartirait l'espace libre
  // autour de lui EN PLUS de sa largeur fixe — divergence visible du rendu
  // voulu, reproduite par le relecteur avant ce correctif.
  it('n insere aucun SizedBox de gap en mode space-between', () => {
    const doc: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-space-between',
      name: 'SpaceBetween',
      pages: [
        {
          id: 'page-space-between',
          name: 'SpaceBetweenRow',
          device: loginScreenDocument.pages[0]!.device,
          nodes: [
            {
              id: 'frame-row',
              name: 'SpaceBetweenRow',
              type: 'frame',
              frame: { x: 0, y: 0, w: 239, h: 50 },
              visible: true,
              locked: false,
              opacity: 1,
              rotation: 0,
              layout: {
                mode: 'row',
                gap: 20,
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                alignMain: 'space-between',
                alignCross: 'center',
              },
              fills: [{ type: 'none' }],
              strokes: [],
              cornerRadius: 0,
              clipsContent: true,
              children: [
                {
                  id: 'rect-a',
                  name: 'A',
                  type: 'rect',
                  frame: { x: 0, y: 0, w: 50, h: 50 },
                  visible: true,
                  locked: false,
                  opacity: 1,
                  rotation: 0,
                  fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
                  strokes: [],
                  cornerRadius: 0,
                },
                {
                  id: 'rect-b',
                  name: 'B',
                  type: 'rect',
                  frame: { x: 0, y: 0, w: 50, h: 50 },
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
          ],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }

    const spaceBetweenResult = flutterExporter.export(doc, { projectName: 'demo' })
    const file = spaceBetweenResult.files.find((f) => f.path.endsWith('space_between_row.dart'))!
    expect(file.contents).toBe(golden('space_between_row.dart'))
    expect(file.contents).not.toContain('SizedBox')
  })

  // Correction round 1 (Important 2) : rotation est exprimee en degres
  // dans le modele (ruling du coordinateur, a documenter dans
  // packages/core/src/model/types.ts) ; l'exportateur Flutter la convertit
  // en radians pour Transform.rotate. On fige la forme exacte produite
  // pour 90 degres plutot que de verifier une valeur approximative.
  it('convertit rotation (degres) en radians pour Transform.rotate', () => {
    const doc: CalqueDocument = {
      version: loginScreenDocument.version,
      id: 'doc-rotated',
      name: 'Rotated',
      pages: [
        {
          id: 'page-rotated',
          name: 'RotatedScreen',
          device: loginScreenDocument.pages[0]!.device,
          nodes: [
            {
              id: 'rect-rotated',
              name: 'RotatedRect',
              type: 'rect',
              frame: { x: 0, y: 0, w: 100, h: 40 },
              visible: true,
              locked: false,
              opacity: 1,
              rotation: 90,
              fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
              strokes: [],
              cornerRadius: 0,
            },
          ],
        },
      ],
      tokens: { colors: {}, typography: {}, spacing: {} },
    }

    const rotatedResult = flutterExporter.export(doc, { projectName: 'demo' })
    const file = rotatedResult.files.find((f) => f.path.endsWith('rotated_screen.dart'))!
    expect(file.contents).toBe(golden('rotated_screen.dart'))
  })
})
