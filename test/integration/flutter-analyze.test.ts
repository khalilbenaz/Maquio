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
import { createDocument, createScreenNode, DEVICE_PRESETS } from '@calque/core'
import type { CalqueDocument, FrameNode, TextNode } from '@calque/core'
import { FIGMA_FIXTURES } from './fixtures'

// Correctif parentage (v2, addendum navigation) : cas ajoute a CE harnais,
// pas aux fixtures Figma partagees (fixtures.ts, consommees par d'autres
// tests d'integration qui attendent toutes un FigmaFileResponse) -- un
// CalqueDocument construit directement, deux ecrans, chacun avec un contenu
// PROPRE (un texte au nom distinct). C'est la preuve que le defaut corrige
// (un element trace dans un ecran restait un frere de premier niveau, donc
// invisible pour l'export qui ne voit que le sous-arbre de l'ecran actif --
// voir le rapport) ne peut plus se reproduire : selectActiveScreen exporte
// bien `active.children`, donc si le contenu N'EST PAS reellement imbrique
// sous le bon ecran, il n'apparaitrait dans AUCUN des deux exports (un
// contenu reste a plat au premier niveau de la page, jamais dans
// `children`) -- ce que les deux assertions "toContain" ci-dessous,
// combinees, excluent.
function texteEcran(id: string, name: string, characters: string): TextNode {
  return {
    id,
    name,
    type: 'text',
    frame: { x: 20, y: 20, w: 200, h: 40 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    characters,
    style: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 20,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      align: 'left',
    },
  }
}

function documentDeuxEcransAvecContenuPropre(): CalqueDocument {
  const device = DEVICE_PRESETS.iphone15
  const texte1 = texteEcran('texte-ecran-1', 'ContenuEcranUn', 'Contenu propre de l ecran un')
  const texte2 = texteEcran('texte-ecran-2', 'ContenuEcranDeux', 'Contenu propre de l ecran deux')
  const ecran1 = createScreenNode('Écran 1', device, { x: 0, y: 0, w: device.width, h: device.height }, [texte1])
  const ecran2 = createScreenNode('Écran 2', device, { x: 500, y: 0, w: device.width, h: device.height }, [texte2])
  const doc = createDocument('Deux ecrans, contenu propre')
  return { ...doc, pages: [{ ...doc.pages[0]!, device, nodes: [ecran1, ecran2] }] }
}

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
  // Correctif parentage : calcule INCONDITIONNELLEMENT (pas de dependance a
  // FLUTTER_AVAILABLE) -- flutterExporter.export() est du JS pur, aucun SDK
  // requis, donc l'assertion de placement du contenu (plus bas) doit rester
  // verifiee meme quand `flutter` est absent de la machine. Seule l'ecriture
  // sur disque + `flutter analyze` proprement dits restent gardes par
  // FLUTTER_AVAILABLE, comme le reste de ce harnais.
  const docDeuxEcrans = documentDeuxEcransAvecContenuPropre()
  const [ecran1, ecran2] = docDeuxEcrans.pages[0]!.nodes as [FrameNode, FrameNode]
  const exportEcran1 = flutterExporter.export(docDeuxEcrans, { projectName: 'demo', activeScreenId: ecran1.id })
  const exportEcran2 = flutterExporter.export(docDeuxEcrans, { projectName: 'demo', activeScreenId: ecran2.id })

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

    // Correctif parentage : les deux exports du document a deux ecrans avec
    // contenu propre rejoignent le meme paquet jetable, sous leurs propres
    // namespaces ('multi-screen-content-ecran1'/'2'), pour que le meme
    // `flutter analyze` (un seul processus, plus bas) les couvre aussi.
    for (const [namespace, result] of [
      ['multi-screen-content-ecran1', exportEcran1],
      ['multi-screen-content-ecran2', exportEcran2],
    ] as const) {
      for (const file of result.files) {
        const relative = file.path.replace(/^lib\//, '')
        const target = join(packageDir, 'lib', namespace, relative)
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

  // Correctif parentage : meme garde-fou "vrai compilateur" que pour les
  // fixtures Figma ci-dessus, applique aux deux exports du document a deux
  // ecrans construit directement (pas via Figma) -- la preuve que le Dart
  // genere a partir d'un document CORRECTEMENT imbrique (ce que garantit
  // desormais le correctif) reste valide, pas seulement que le placement du
  // contenu est le bon (verifie separement ci-dessous).
  for (const namespace of ['multi-screen-content-ecran1', 'multi-screen-content-ecran2']) {
    runIfFlutterAvailable(`la sortie Flutter pour ${namespace} ne produit aucune remontee flutter analyze`, () => {
      const prefix = `lib/${namespace}/`
      const fixtureIssues = issues.filter((i) => i.file.includes(prefix))
      expect(
        fixtureIssues,
        fixtureIssues
          .map((i) => `${i.severity} • ${i.file}:${i.line}:${i.col} ${i.message} (${i.code})`)
          .join('\n'),
      ).toEqual([])
    })
  }

  // Correctif parentage -- la verification qui prouve que ce correctif sert
  // a quelque chose (pas seulement que le Dart produit est valide, mais
  // qu'il contient bien le BON contenu) : un document a deux ecrans dont
  // chacun a un contenu propre doit produire, pour chaque ecran actif, un
  // Dart qui contient CE contenu et PAS l'autre. Avant le correctif, un
  // element trace dans un ecran restait un frere de premier niveau de cet
  // ecran (jamais son enfant) -- `selectActiveScreen` (packages/codegen)
  // n'exportant que `active.children`, un tel contenu n'aurait alors figure
  // dans AUCUN des deux exports (un ecran vide de tout contenu, quel que
  // soit l'ecran actif choisi). Ce test ne depend pas de `flutter` (pur JS,
  // voir le calcul inconditionnel de exportEcran1/exportEcran2 plus haut).
  it('le contenu de chaque ecran se retrouve dans le bon ecran, et seulement lui', () => {
    const contenu1 = exportEcran1.files.map((f) => f.contents).join('\n')
    const contenu2 = exportEcran2.files.map((f) => f.contents).join('\n')

    expect(contenu1).toContain('Contenu propre de l ecran un')
    expect(contenu1).not.toContain('Contenu propre de l ecran deux')

    expect(contenu2).toContain('Contenu propre de l ecran deux')
    expect(contenu2).not.toContain('Contenu propre de l ecran un')
  })

  // Le harnais doit rester raisonnablement rapide (borne large : la
  // machine de CI n'a pas forcement le meme cache pub que ce poste) --
  // voir le rapport pour le temps mesure localement et une piste de
  // bornage si jamais il derape.
  runIfFlutterAvailable('reste raisonnablement rapide', () => {
    expect(elapsedMs).toBeLessThan(60_000)
  })
})
