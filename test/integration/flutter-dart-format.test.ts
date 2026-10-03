// Garde-fou `dart format` (Important 3, spec §7), RE-LOCALISE ici apres
// re-revue de la vague de correction finale : la premiere version
// (packages/codegen/test/flutter-format.test.ts) ne mangeait que
// `packages/codegen/test/fixtures/login-screen.ts` -- exactement le
// document ecrit a la main dont Critical 4 dit qu'il ne prouve rien,
// puisque ses identifiants sont par construction deja valides. Ce garde-
// fou doit manger les MEMES documents que le test d'integration Critical
// 4 (figma-to-codegen.test.ts, via ./fixtures partagees), ce qui suppose
// d'importer a la fois `@calque/figma` (pour `figmaToDocument`) et
// `@calque/codegen` (pour `flutterExporter`) -- interdit a `packages/
// codegen/test/` et `packages/figma/test/` par la regle de dependance,
// et exactement la raison d'etre de ce dossier `test/integration/`.
//
// La disponibilite de `dart` est detectee UNE FOIS, avant l'enregistrement
// des tests (`describe`/`it` sont synchrones) : `it.skip` quand l'outil
// est absent, jamais un test qui echoue faute de SDK Flutter installe --
// npm test doit rester vert sans SDK externe (contrainte du brief).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { figmaToDocument } from '@calque/figma'
import { flutterExporter } from '@calque/codegen'
import { FIGMA_FIXTURES } from './fixtures'
import { documentExempleComplet } from './fixtures/exemple-complet'

function isDartAvailable(): boolean {
  try {
    execFileSync('dart', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const DART_AVAILABLE = isDartAvailable()
const runIfDartAvailable = DART_AVAILABLE ? it : it.skip

describe('garde-fou dart format (spec §7)', () => {
  let dir: string

  beforeAll(() => {
    if (!DART_AVAILABLE) return
    dir = mkdtempSync(join(tmpdir(), 'calque-dart-format-'))
  })

  afterAll(() => {
    if (!DART_AVAILABLE) return
    rmSync(dir, { recursive: true, force: true })
  })

  for (const fixture of FIGMA_FIXTURES) {
    runIfDartAvailable(
      `la sortie Flutter pour ${fixture.name} passe dart format --output=none --set-exit-if-changed`,
      () => {
        const { document } = figmaToDocument(fixture.file)
        const result = flutterExporter.export(document, { projectName: 'demo' })

        // Un fichier par sortie generee, aplati (le nom de repertoire n'a
        // aucune importance pour `dart format`, qui ne resout pas les
        // imports) -- seul compte que chacun garde son extension `.dart`,
        // et que deux fixtures differentes n'ecrasent jamais le meme
        // chemin temporaire (prefixe par le nom de la fixture).
        const filePaths = result.files.filter((file) => file.path.endsWith(".dart")).map((file) => {
          const flatName = `${fixture.name}__${file.path.replace(/\//g, '_')}`
          const filePath = join(dir, flatName)
          writeFileSync(filePath, file.contents, 'utf8')
          return filePath
        })

        // `--set-exit-if-changed` fait sortir `dart format` en erreur des
        // qu'un fichier serait reecrit differemment -- y compris s'il ne
        // parse pas du tout (un identifiant Dart invalide comme `brand-
        // primary-500` empeche meme le parsing). `execFileSync` leve sur
        // un code de sortie non nul, ce qui fait naturellement echouer ce
        // test.
        if (filePaths.length > 0) {
          execFileSync('dart', ['format', '--output=none', '--set-exit-if-changed', ...filePaths])
        }
      },
    )
  }

  // v3 : l'exemple « tous les composants » doit lui aussi etre stable sous le
  // formateur (lignes de 80 colonnes, listes et tables regroupees, fleches
  // coupees apres `=>`).
  runIfDartAvailable('la sortie Flutter pour exemple-complet passe dart format --set-exit-if-changed', () => {
    const result = flutterExporter.export(documentExempleComplet(), { projectName: 'demo' })
    const filePaths = result.files.filter((file) => file.path.endsWith(".dart")).map((file) => {
      const filePath = join(dir, `exemple-complet__${file.path.replace(/\//g, '_')}`)
      writeFileSync(filePath, file.contents, 'utf8')
      return filePath
    })
    execFileSync('dart', ['format', '--output=none', '--set-exit-if-changed', ...filePaths])
  })
})
