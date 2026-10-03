// Fichiers temoins (golden) des composants : le meme document compact exporte
// vers les quatre cibles, compare octet a octet. Mise a jour EXPLICITE et a
// justifier en revue : `UPDATE_GOLDEN=1 npx vitest run packages/codegen/test/golden-composants.test.ts`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeExporter } from '../src/compose/compose'
import { flutterExporter } from '../src/flutter/flutter'
import { reactNativeExporter } from '../src/react-native/react-native'
import { swiftuiExporter } from '../src/swiftui/swiftui'
import type { Exporter } from '../src/types'
import { documentComposants } from './fixtures/composants'

const UPDATE = process.env.UPDATE_GOLDEN === '1'

const TARGETS: [string, string, Exporter][] = [
  ['flutter', 'flutter/composants', flutterExporter],
  ['react-native', 'react-native/composants', reactNativeExporter],
  ['swiftui', 'swiftui/composants', swiftuiExporter],
  ['compose', 'compose/composants', composeExporter],
]

for (const [name, dir, exporter] of TARGETS) {
  describe(`fichiers temoins composants : ${name}`, () => {
    const result = exporter.export(documentComposants(), { projectName: 'demo' })

    it('produit des fichiers deterministes (deux exports identiques)', () => {
      expect(exporter.export(documentComposants(), { projectName: 'demo' }).files).toEqual(result.files)
    })

    for (const file of result.files) {
      it(`${file.path} correspond au fichier temoin`, () => {
        const path = join(__dirname, 'golden', dir, file.path)
        if (UPDATE) {
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, file.contents)
        }
        expect(existsSync(path), `fichier temoin manquant : ${path}`).toBe(true)
        expect(file.contents).toBe(readFileSync(path, 'utf8'))
      })
    }
  })
}
