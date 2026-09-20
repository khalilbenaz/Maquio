// Garde-fou promis par la spec §7 (Important 3, jamais ecrit avant cette
// vague de correction finale -- la promesse s'est perdue entre la spec et
// le plan sans jamais etre consignee) : « un test supplementaire verifie
// que la sortie passe `dart format --output=none --set-exit-if-changed`
// si l'outil `dart` est present sur la machine, et se marque comme ignore
// sinon ». C'est le seul controle automatique qui aurait attrape Critical
// 3 (un nom de constante Dart invalide comme `brand-primary-500` fait
// echouer `dart format`, qui doit d'abord PARSER le fichier).
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
import { flutterExporter } from '../src/flutter/flutter'
import { loginScreenDocument } from './fixtures/login-screen'

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

  runIfDartAvailable('la sortie Flutter passe dart format --output=none --set-exit-if-changed', () => {
    const result = flutterExporter.export(loginScreenDocument, { projectName: 'demo' })

    // Un fichier par sortie generee, aplati (le nom de repertoire n'a
    // aucune importance pour `dart format`, qui ne resout pas les imports)
    // -- seul compte que chacun garde son extension `.dart`.
    const filePaths = result.files.map((file) => {
      const flatName = file.path.replace(/\//g, '_')
      const filePath = join(dir, flatName)
      writeFileSync(filePath, file.contents, 'utf8')
      return filePath
    })

    // `--set-exit-if-changed` fait sortir `dart format` en erreur des
    // qu'un fichier serait reecrit differemment -- y compris s'il ne parse
    // pas du tout (un identifiant Dart invalide comme `brand-primary-500`
    // empeche meme le parsing). `execFileSync` leve sur un code de sortie
    // non nul, ce qui fait naturellement echouer ce test.
    execFileSync('dart', ['format', '--output=none', '--set-exit-if-changed', ...filePaths])
  })
})
