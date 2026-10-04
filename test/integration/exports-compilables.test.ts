// Garde-fou « vrai compilateur » pour les trois cibles que flutter-analyze ne
// couvre pas : le projet d'exemple « tous les composants » (30 composants, 7
// conteneurs, 3 ecrans relies) est exporte puis COMPILE par l'outil natif de
// chaque cible.
//
//  - SwiftUI : `swiftc -typecheck` (macOS, outils en ligne de commande suffisants) ;
//  - React Native : `tsc --strict` avec react-native, @types/react et React
//    Navigation ;
//  - Compose : Gradle `compileDebugKotlin` (Compose BOM, material3, navigation).
//
// SwiftUI tourne des qu'`swiftc` est disponible. React Native et Compose
// installent des dependances volumineuses (npm, Gradle) : ils ne tournent
// qu'avec MAQUIO_VERIF_FULL=1 -- jamais dans un `npm test` ordinaire, qui doit
// rester rapide et hors-ligne. Voir test/verif/README.md.
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getExporter } from '@maquio/codegen'
import type { ExporterId } from '@maquio/codegen'
import { documentExempleComplet } from './fixtures/exemple-complet'
import { PNG_1X1, RESSOURCES_RELATIVES, documentProjetImages } from './fixtures/projet-images'
import type { MaquioDocument } from '@maquio/core'
import { documentInteractions } from '../../packages/codegen/test/fixtures/interactions'

const FULL = process.env.MAQUIO_VERIF_FULL === '1'
const VERIF = join(__dirname, '..', 'verif')
const CACHE = join(process.env.MAQUIO_VERIF_CACHE ?? join(homedir(), '.cache'), 'maquio-verif')

function have(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function writeExport(id: ExporterId, root: string, doc: MaquioDocument = documentExempleComplet(), withAssets = false): string[] {
  const result = getExporter(id).export(doc, { projectName: 'demo', androidPackage: 'verif.app' })
  rmSync(root, { recursive: true, force: true })
  for (const file of result.files) {
    const target = join(root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.contents, 'utf8')
  }
  // Images : on rejoue ce que fait l'application (copie des sources declarees).
  if (withAssets) {
    const sources = join(root, '..', 'ressources')
    mkdirSync(sources, { recursive: true })
    for (const name of RESSOURCES_RELATIVES) writeFileSync(join(sources, name), PNG_1X1)
    writeFileSync(join(sources, 'absolu-logo.png'), PNG_1X1)
    for (const asset of result.assets ?? []) {
      const from = asset.source.startsWith('/') ? join(sources, 'absolu-logo.png') : join(sources, asset.source)
      const target = join(root, asset.path)
      mkdirSync(dirname(target), { recursive: true })
      cpSync(from, target)
    }
  }
  return result.files.map((f) => f.path)
}

const projetImages = () => documentProjetImages('/tmp/autre/logo.png')

function listFiles(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(path, ext))
    else if (path.endsWith(ext)) out.push(path)
  }
  return out
}

// --- SwiftUI ---

const SWIFT = platform() === 'darwin' && have('xcrun', ['--find', 'swiftc'])

// Sans Xcode, le plugin de macros SwiftUI est absent et `@State` ne se resout
// pas (sans que le code genere y soit pour quelque chose).
function stateMacroAvailable(dir: string): boolean {
  const probe = join(dir, 'probe.swift')
  writeFileSync(probe, 'import SwiftUI\nstruct Probe: View {\n    @State private var x = 1\n    var body: some View { Text("\\(x)") }\n}\n')
  const result = spawnSync('xcrun', ['swiftc', '-typecheck', '-parse-as-library', probe], { encoding: 'utf8' })
  return result.status === 0
}

const CASES: [string, string, () => MaquioDocument, boolean][] = [
  ['exemple « tous les composants »', 'exemple', documentExempleComplet, false],
  ['projet multi-ecrans avec images', 'images', projetImages, true],
  ['interactions (transitions, overlays, delai, URL)', 'interactions', documentInteractions, false],
]

describe.each(CASES)('les exports compilent (%s)', (_label, key, makeDoc, withAssets) => {
  it.runIf(SWIFT)('SwiftUI : swiftc -typecheck', () => {
    const root = join(CACHE, 'swift', key)
    mkdirSync(root, { recursive: true })
    const paths = writeExport('swiftui', join(root, 'src'), makeDoc(), withAssets)
    const sources = listFiles(join(root, 'src'), '.swift')
    const extra: string[] = []
    if (!stateMacroAvailable(root)) {
      for (const file of sources) writeFileSync(file, readFileSync(file, 'utf8').replace(/@State /g, '@VState '))
      const shim = join(root, 'Shim.swift')
      writeFileSync(
        shim,
        [
          'import SwiftUI',
          '@propertyWrapper struct VState<Value>: DynamicProperty {',
          '    final class Box { var value: Value; init(_ value: Value) { self.value = value } }',
          '    let box: Box',
          '    init(wrappedValue: Value) { box = Box(wrappedValue) }',
          '    var wrappedValue: Value { get { box.value } nonmutating set { box.value = newValue } }',
          '    var projectedValue: Binding<Value> { Binding(get: { box.value }, set: { box.value = $0 }) }',
          '}',
        ].join('\n'),
      )
      extra.push(shim)
    }
    expect(paths.length).toBeGreaterThan(4)
    const result = spawnSync('xcrun', ['swiftc', '-typecheck', '-parse-as-library', ...sources, ...extra], { encoding: 'utf8' })
    expect(`${result.stdout}${result.stderr}`.trim()).toBe('')
    expect(result.status).toBe(0)
  }, 180_000)

  it.runIf(FULL)('React Native : tsc --strict (react-native, @types/react, React Navigation)', () => {
    const root = join(CACHE, 'rn')
    mkdirSync(root, { recursive: true })
    cpSync(join(VERIF, 'rn'), root, { recursive: true })
    if (!existsSync(join(root, 'node_modules'))) {
      const install = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--legacy-peer-deps'], { cwd: root, encoding: 'utf8' })
      expect(install.status, install.stderr).toBe(0)
    }
    writeExport('react-native', join(root, 'proj'), makeDoc(), withAssets)
    const tsc = spawnSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], { cwd: root, encoding: 'utf8' })
    expect(`${tsc.stdout}${tsc.stderr}`.trim()).toBe('')
    expect(tsc.status).toBe(0)
  }, 600_000)

  const androidHome = process.env.ANDROID_HOME ?? join(homedir(), 'Library', 'Android', 'sdk')
  const jdk17 = (() => {
    if (process.env.JAVA_HOME_17) return process.env.JAVA_HOME_17
    try {
      return execFileSync('/usr/libexec/java_home', ['-v', '17'], { encoding: 'utf8' }).trim()
    } catch {
      return null
    }
  })()

  it.runIf(FULL && existsSync(androidHome) && jdk17 !== null)('Jetpack Compose : Gradle compileDebugKotlin', () => {
    const root = join(CACHE, 'compose')
    mkdirSync(root, { recursive: true })
    cpSync(join(VERIF, 'compose'), root, { recursive: true })
    writeFileSync(join(root, 'local.properties'), `sdk.dir=${androidHome}\n`)
    // Les sources generees (src/main/kotlin/...) remplacent celles du module.
    writeExport('compose', join(root, 'gen'), makeDoc(), withAssets)
    rmSync(join(root, 'app', 'src', 'main', 'kotlin'), { recursive: true, force: true })
    cpSync(join(root, 'gen', 'src', 'main', 'kotlin'), join(root, 'app', 'src', 'main', 'kotlin'), { recursive: true })
    rmSync(join(root, 'app', 'src', 'main', 'res'), { recursive: true, force: true })
    if (existsSync(join(root, 'gen', 'src', 'main', 'res'))) cpSync(join(root, 'gen', 'src', 'main', 'res'), join(root, 'app', 'src', 'main', 'res'), { recursive: true })
    const result = spawnSync('./gradlew', ['--console=plain', ':app:compileDebugKotlin'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, JAVA_HOME: jdk17!, ANDROID_HOME: androidHome },
    })
    const errors = `${result.stdout}\n${result.stderr}`.split('\n').filter((l) => /^e: /.test(l))
    expect(errors, errors.join('\n')).toEqual([])
    expect(result.status, `${result.stdout}\n${result.stderr}`.slice(-2000)).toBe(0)
  }, 900_000)
})
