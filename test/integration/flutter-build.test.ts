// Vrai `flutter build web` des exports Flutter (opt-in : MAQUIO_VERIF_FULL=1,
// telecharge le SDK web au premier passage et prend ~1 minute). Prouve que le
// projet exporte est un projet Flutter COMPLET : pubspec.yaml valide, assets
// copies ET declares (un asset declare mais absent fait echouer le build),
// `flutter analyze` sans remontee.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flutterExporter } from '@maquio/codegen'
import { documentExempleComplet } from './fixtures/exemple-complet'
import { PNG_1X1, documentProjetImages } from './fixtures/projet-images'

const FULL = process.env.MAQUIO_VERIF_FULL === '1'
const HAS_FLUTTER = spawnSync('flutter', ['--version'], { stdio: 'ignore' }).status === 0

function run(cmd: string, args: string[], cwd: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` }
}

describe.each([
  ['exemple complet', () => documentExempleComplet()],
  ['projet multi-ecrans avec images', () => documentProjetImages('/tmp/autre/logo.png')],
])('flutter build web : %s', (_label, makeDoc) => {
  it.runIf(FULL && HAS_FLUTTER)('analyze 0 remontee puis build web', () => {
    const root = mkdtempSync(join(tmpdir(), 'maquio-flutter-build-'))
    try {
      const created = run('flutter', ['create', '--platforms=web', '--project-name=demo', '--no-pub', '.'], root)
      expect(created.status, created.out).toBe(0)
      rmSync(join(root, 'test'), { recursive: true, force: true })
      rmSync(join(root, 'lib'), { recursive: true, force: true })
      const result = flutterExporter.export(makeDoc(), { projectName: 'demo' })
      for (const f of result.files) {
        const target = join(root, f.path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, f.contents, 'utf8')
      }
      // Copie des images, comme le fait l'application.
      for (const asset of result.assets ?? []) {
        const target = join(root, asset.path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, PNG_1X1)
      }
      writeFileSync(join(root, 'analysis_options.yaml'), 'include: package:flutter_lints/flutter.yaml\n')
      const pub = run('flutter', ['pub', 'get'], root)
      expect(pub.status, pub.out).toBe(0)
      const analyze = run('flutter', ['analyze'], root)
      expect(analyze.out, analyze.out).toContain('No issues found')
      const build = run('flutter', ['build', 'web'], root)
      expect(build.status, build.out.slice(-3000)).toBe(0)
      expect(existsSync(join(root, 'build', 'web', 'index.html'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 900_000)
})
