// Garde-fou "vrai compilateur" (rapport dart-correctness-report.md) : lance
// `flutter analyze` sur un paquet Flutter jetable, construit UNE SEULE FOIS
// pour tous les documents du test d'integration Critical 4 (mêmes fixtures
// que figma-to-codegen.test.ts et flutter-dart-format.test.ts, via
// ./fixtures partagee) -- amortit le cout fixe de demarrage du serveur
// d'analyse Flutter (~1-2s) sur l'ensemble des documents plutot que de le
// payer une fois par document.
//
// `dart format --set-exit-if-changed` (flutter-dart-format.test.ts) prouve
// que la sortie est syntaxiquement STABLE sous le formateur, jamais
// qu'elle COMPILE : un identifiant reserve ('default', 'class'...) casse
// le parsing sans que dart format s'en distingue autrement d'un
// reformatage ordinaire. Seul `flutter analyze` verifie de vraies regles
// semantiques Dart (mots reserves, imports non resolus, appels invalides,
// asserts violes...) -- c'est le seul juge qui prouve la correction
// exigee, pas une expression reguliere.
//
// Ruling du coordinateur (suite du rapport dart-correctness) : « le Dart
// produit doit etre correct » veut dire ZERO remontee de `flutter
// analyze`, `info` compris -- pas seulement zero erreur. Le paquet
// jetable active donc `flutter_lints` (le jeu de regles que tout projet
// Flutter active par defaut, `analysis_options.yaml` ci-dessous) et
// CHAQUE test par fixture echoue des la moindre remontee, quelle que soit
// sa severite (`error`/`warning`/`info`) : du code genere qui allume le
// lint d'un IDE au premier coup d'œil n'est pas du code correct.
//
// La disponibilite de `flutter` est detectee UNE FOIS avant
// l'enregistrement des tests, exactement comme pour `dart` dans
// flutter-dart-format.test.ts : it.skip quand l'outil est absent, jamais
// un echec faute de SDK installe (verifie en masquant `flutter` du PATH).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { figmaToDocument } from '@calque/figma'
import { flutterExporter } from '@calque/codegen'
import { FIGMA_FIXTURES } from './fixtures'

function isFlutterAvailable(): boolean {
  try {
    execFileSync('flutter', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const FLUTTER_AVAILABLE = isFlutterAvailable()
const runIfFlutterAvailable = FLUTTER_AVAILABLE ? it : it.skip

type Severity = 'error' | 'warning' | 'info'
type AnalyzeIssue = { severity: Severity; message: string; file: string; line: number; col: number; code: string }

// Format d'une ligne de probleme de `flutter analyze` (verifie a la main
// contre le binaire reel, cf. rapport) :
//   "  error • Expected to find ';' • lib/x.dart:3:16 • expected_token"
// L'indentation variable en tete de ligne aligne les severites entre elles
// ("info" est plus court que "warning"/"error") -- \s* l'absorbe.
const ISSUE_LINE = /^\s*(error|warning|info)\s+•\s+(.*?)\s+•\s+(\S+):(\d+):(\d+)\s+•\s+(\S+)\s*$/

function parseAnalyzeOutput(output: string): AnalyzeIssue[] {
  const issues: AnalyzeIssue[] = []
  for (const line of output.split('\n')) {
    const m = ISSUE_LINE.exec(line)
    if (!m) continue
    issues.push({
      severity: m[1] as Severity,
      message: m[2]!,
      file: m[3]!,
      line: Number(m[4]),
      col: Number(m[5]),
      code: m[6]!,
    })
  }
  return issues
}

describe('garde-fou flutter analyze (preuve de compilation reelle)', () => {
  let packageDir = ''
  let issues: AnalyzeIssue[] = []
  let elapsedMs = 0

  beforeAll(() => {
    if (!FLUTTER_AVAILABLE) return
    const start = Date.now()
    packageDir = mkdtempSync(join(tmpdir(), 'calque-flutter-analyze-'))

    // Paquet Flutter avec `flutter_lints` active (voir le ruling en tete de
    // fichier) : un `unused_import` ou un identifiant invalide sont deja
    // des diagnostics du coeur de l'analyseur (se declenchent SANS lint),
    // mais `unnecessary_const`/`sized_box_for_whitespace` etc. sont de
    // vraies regles de `flutter_lints` -- sans cette dependance et son
    // `analysis_options.yaml`, le harnais ne les verrait jamais.
    writeFileSync(
      join(packageDir, 'pubspec.yaml'),
      [
        'name: calque_flutter_analyze_probe',
        "publish_to: 'none'",
        'version: 1.0.0',
        'environment:',
        "  sdk: '>=3.0.0 <4.0.0'",
        'dependencies:',
        '  flutter:',
        '    sdk: flutter',
        'dev_dependencies:',
        '  flutter_lints: ^6.0.0',
        '',
      ].join('\n'),
    )

    // Aucune regle de `flutter_lints` n'est neutralisee ici : les deux
    // remontees trouvees par la verification independante du coordinateur
    // (`unnecessary_const`, `sized_box_for_whitespace`) ont ete corrigees
    // dans le generateur plutot que masquees (voir dart-correctness-
    // report.md). Si une regle s'averait un jour vraiment inapplicable a
    // du code genere, elle serait desactivee EXPLICITEMENT ici (sous
    // `analyzer: errors: <regle>: ignore` dans ce meme fichier), jamais en
    // silence -- et justifiee dans le rapport. A ce jour, cette liste est
    // vide.
    writeFileSync(join(packageDir, 'analysis_options.yaml'), 'include: package:flutter_lints/flutter.yaml\n')

    for (const fixture of FIGMA_FIXTURES) {
      const { document } = figmaToDocument(fixture.file)
      const result = flutterExporter.export(document, { projectName: 'demo' })
      for (const file of result.files) {
        // file.path est deja relatif a la racine d'un paquet Flutter
        // ('lib/screens/x.dart', 'lib/theme.dart') -- namespace par
        // fixture SOUS lib/ pour que deux documents ne s'ecrasent jamais,
        // en preservant la profondeur relative exacte entre un ecran et
        // le theme : l'import '../theme.dart' emis par le generateur doit
        // continuer a resoudre correctement une fois deplace.
        const relative = file.path.replace(/^lib\//, '')
        const target = join(packageDir, 'lib', fixture.name, relative)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, file.contents, 'utf8')
      }
    }

    const pubGet = spawnSync('flutter', ['pub', 'get'], { cwd: packageDir, encoding: 'utf8' })
    if (pubGet.status !== 0) {
      throw new Error(`flutter pub get a echoue :\n${pubGet.stdout}\n${pubGet.stderr}`)
    }

    const analyzeResult = spawnSync(
      'flutter',
      ['analyze', '--no-fatal-warnings', '--no-fatal-infos', '--no-pub'],
      { cwd: packageDir, encoding: 'utf8' },
    )
    issues = parseAnalyzeOutput(`${analyzeResult.stdout ?? ''}\n${analyzeResult.stderr ?? ''}`)
    elapsedMs = Date.now() - start
  })

  afterAll(() => {
    if (!FLUTTER_AVAILABLE) return
    rmSync(packageDir, { recursive: true, force: true })
  })

  // Une seule severite compte : TOUTE remontee (error/warning/info, donc
  // `flutter_lints` compris) fait echouer le test, avec le detail exact
  // plutot qu'un echec muet -- voir le ruling en tete de fichier.
  for (const fixture of FIGMA_FIXTURES) {
    runIfFlutterAvailable(`la sortie Flutter pour ${fixture.name} ne produit aucune remontee flutter analyze`, () => {
      const prefix = `lib/${fixture.name}/`
      const fixtureIssues = issues.filter((i) => i.file.includes(prefix))
      expect(
        fixtureIssues,
        fixtureIssues
          .map((i) => `${i.severity} • ${i.file}:${i.line}:${i.col} ${i.message} (${i.code})`)
          .join('\n'),
      ).toEqual([])
    })
  }

  // Le harnais doit rester raisonnablement rapide (borne large : la
  // machine de CI n'a pas forcement le meme cache pub que ce poste) --
  // voir le rapport pour le temps mesure localement et une piste de
  // bornage si jamais il derape.
  runIfFlutterAvailable('reste raisonnablement rapide', () => {
    expect(elapsedMs).toBeLessThan(60_000)
  })
})
