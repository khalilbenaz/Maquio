// Test d'integration Critical 4 (vague de correction finale) : jusqu'ici
// aucun test ne faisait traverser un document a packages/figma PUIS
// packages/codegen -- les quatre generateurs n'etaient exerces que sur la
// fixture ecrite a la main packages/codegen/test/fixtures/login-screen.ts,
// dont les identifiants ('frame-login-screen') et le token ('primary')
// sont par construction des identifiants valides dans les quatre
// langages cibles. C'est ce qui a rendu Critical 1, 2 et 3 invisibles.
//
// Ce fichier vit ici (test/integration/, pas dans packages/figma ni
// packages/codegen) parce que la regle de dependance (test/
// architecture.test.ts, spec §4) interdit a `figma` et `codegen` de
// s'importer l'un l'autre -- c'est le seul endroit du depot autorise a
// les faire se rencontrer. Les globs vitest (`test/**/*.test.ts`)
// couvrent deja ce dossier (voir vitest.config.ts).
//
// Chaque fixture EXISTANTE de packages/figma/test/fixtures/ utilise deja
// des ids Figma reels a deux points ('1:1', '2:1', '3:1', ...) : a elles
// seules, elles auraient suffi a demontrer Critical 1 (identifiant JS
// invalide derive d'un id numerique, ex. `styles.11`), simplement parce
// qu'aucun test ne les faisait jamais atteindre packages/codegen. La
// fixture supplementaire ci-dessous ('realistic-figma-file.json') ajoute
// ce que ces trois fixtures ne couvrent pas : un id profondement imbrique
// ('12:345'), un style publie nomme "Brand/Primary 500" (convention Figma
// la plus repandue -- Critical 3), et une frame SANS auto-layout (mode
// `absolute` implicite, le cas courant d'apres le brief) dont les enfants
// directs sont un texte ET un espace reserve image (Critical 2 et son
// corollaire painterResource).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { figmaToDocument, type FigmaFileResponse } from '@calque/figma'
import { listExporters, type ExportedFile } from '@calque/codegen'

const FIGMA_PACKAGE_FIXTURES = join(__dirname, '..', '..', 'packages', 'figma', 'test', 'fixtures')

function loadFigmaFixture(path: string): FigmaFileResponse {
  return JSON.parse(readFileSync(path, 'utf8')) as FigmaFileResponse
}

const FIXTURES: Array<{ name: string; file: FigmaFileResponse }> = [
  { name: 'simple-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'simple-file.json')) },
  { name: 'autolayout-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'autolayout-file.json')) },
  { name: 'unsupported-file', file: loadFigmaFixture(join(FIGMA_PACKAGE_FIXTURES, 'unsupported-file.json')) },
  {
    name: 'realistic-figma-file',
    file: loadFigmaFixture(join(__dirname, 'fixtures', 'realistic-figma-file.json')),
  },
]

// ---- Verifications structurelles (Critical 1/2/3), par langage cible ----
//
// Volontairement des verifications textuelles cibliees sur la forme EXACTE
// des quatre defauts du rapport de revue, plutot qu'un vrai parseur/
// compilateur (aucun SDK Dart/Kotlin/Swift n'est disponible en test, voir
// Important 3 -- le futur garde-fou `dart format` -- pour la seule
// exception). Chaque generateur controle entierement son propre format de
// sortie (2 espaces d'indentation pour les cles de premier niveau, une
// ligne par `static const`, ...) : ces regles ne sont donc pas fragiles
// vis-a-vis d'un code TIERS, seulement vis-a-vis d'un changement delibere
// du format d'emission -- a mettre a jour avec lui, comme n'importe quel
// fichier temoin.

// Identifiant JS/TS/Dart/Kotlin/Swift valide : commence par une lettre ou
// `_`/`$`, ne contient que lettres/chiffres/`_`/`$`.
const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function reactNativeProblems(files: ExportedFile[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue
    // Cles de premier niveau des objets litteraux generes (StyleSheet.
    // create({...}) ou colors/spacing/typography de theme.ts) : toujours
    // indentees d'exactement 2 espaces dans ce generateur (voir
    // formatStyleEntry / colorLines / spacingLines / typographyLines).
    const keys = [...file.contents.matchAll(/^ {2}([^\s:]+):/gm)].map((m) => m[1]!)
    for (const key of keys) {
      if (!VALID_IDENTIFIER.test(key)) problems.push(`${file.path} : cle d objet invalide "${key}"`)
    }
    const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i)
    if (duplicates.length > 0) problems.push(`${file.path} : cles dupliquees (${[...new Set(duplicates)].join(', ')})`)
    // Reference en notation pointee vers un token de theme : jamais un nom
    // de token brut (avec tiret ou espace).
    for (const m of file.contents.matchAll(/\b(?:theme\.colors|colors)\.([A-Za-z0-9_$]+)/g)) {
      if (!VALID_IDENTIFIER.test(m[1]!)) problems.push(`${file.path} : reference de token invalide "${m[0]}"`)
    }
  }
  return problems
}

function flutterProblems(files: ExportedFile[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    if (!file.path.endsWith('.dart')) continue
    for (const m of file.contents.matchAll(/static const (?:Color|double|TextStyle) ([^\s=]+) =/g)) {
      if (!VALID_IDENTIFIER.test(m[1]!)) problems.push(`${file.path} : nom de constante invalide "${m[1]}"`)
    }
    for (const m of file.contents.matchAll(/\bAppColors\.([A-Za-z0-9_$]+)/g)) {
      if (!VALID_IDENTIFIER.test(m[1]!)) problems.push(`${file.path} : reference de token invalide "${m[0]}"`)
    }
  }
  return problems
}

// Une ligne de chaine de modifiers Kotlin (`.offset(...)`, `.size(...)`,
// ...) n'a de sens que rattachee, en remontant les lignes qui la
// precedent immediatement (elles-memes des maillons de chaine), a une
// ligne `modifier = Modifier` : sinon c'est un argument positionnel sans
// nom pour l'appel englobant, invalide en Kotlin -- exactement la forme
// du bug Critical 2 (`.offset(x = 24.dp, y = 60.dp),` juste apres `style =
// TextStyle(...),`).
function composeOrphanModifierChains(contents: string): string[] {
  const lines = contents.split('\n')
  const problems: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!/^\s*\./.test(line)) continue
    let j = i - 1
    while (j >= 0 && /^\s*\./.test(lines[j]!)) j--
    const anchor = j >= 0 ? lines[j]! : ''
    if (!/modifier\s*=\s*Modifier\s*$/.test(anchor.trim()) && !/modifier\s*=\s*Modifier$/.test(anchor)) {
      problems.push(`ligne ${i + 1} : chaine de modifier orpheline ("${line.trim()}", precedee de "${anchor.trim()}")`)
    }
  }
  return problems
}

function composeProblems(files: ExportedFile[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    if (!file.path.endsWith('.kt')) continue
    for (const p of composeOrphanModifierChains(file.contents)) problems.push(`${file.path} : ${p}`)
    if (file.contents.includes('painterResource("') || file.contents.includes("painterResource('")) {
      problems.push(`${file.path} : painterResource() appele avec une chaine litterale au lieu d un @DrawableRes Int`)
    }
    for (const m of file.contents.matchAll(/R\.drawable\.([A-Za-z0-9_$]+)/g)) {
      if (!/^[a-z][a-z0-9_]*$/.test(m[1]!)) {
        problems.push(`${file.path} : nom de ressource Android invalide "${m[0]}"`)
      }
    }
  }
  return problems
}

describe('integration figma -> codegen (Critical 4)', () => {
  for (const fixture of FIXTURES) {
    describe(fixture.name, () => {
      const { document } = figmaToDocument(fixture.file)

      for (const exporter of listExporters()) {
        it(`exporte vers ${exporter.id} sans identifiant ni appel invalide`, () => {
          // Le point d'echec initial (avant correction) : cet appel ne
          // doit jamais lever, et la sortie ne doit jamais contenir les
          // formes exactes des defauts Critical 1/2/3.
          const result = exporter.export(document, { projectName: 'demo' })

          const problems = [
            ...reactNativeProblems(result.files),
            ...flutterProblems(result.files),
            ...composeProblems(result.files),
          ]

          expect(problems, problems.join('\n')).toEqual([])
        })
      }
    })
  }

  // Preuve ciblee de Critical 3 sur le nom "Brand/Primary 500" du brief :
  // le meme token doit produire le MEME identifiant normalise dans le
  // fichier de theme et dans les references du fichier d'ecran, pour
  // React Native et Flutter (les deux cibles `complete`, seules a
  // declarer un theme genere).
  it("normalise le token de style publie 'Brand/Primary 500' de facon coherente (React Native et Flutter)", () => {
    const realistic = FIXTURES.find((f) => f.name === 'realistic-figma-file')!
    const { document } = figmaToDocument(realistic.file)
    expect(document.tokens.colors['brand-primary-500']).toBeDefined()

    const rn = listExporters().find((e) => e.id === 'react-native')!.export(document, { projectName: 'demo' })
    const rnTheme = rn.files.find((f) => f.path === 'src/theme.ts')!
    const rnScreen = rn.files.find((f) => f.path.startsWith('src/screens/'))!
    expect(rnTheme.contents).toContain('brandPrimary500:')
    expect(rnScreen.contents).toContain('theme.colors.brandPrimary500')

    const flutter = listExporters().find((e) => e.id === 'flutter')!.export(document, { projectName: 'demo' })
    const flutterTheme = flutter.files.find((f) => f.path === 'lib/theme.dart')!
    const flutterScreen = flutter.files.find((f) => f.path.startsWith('lib/screens/'))!
    expect(flutterTheme.contents).toContain('static const Color brandPrimary500 =')
    expect(flutterScreen.contents).toContain('AppColors.brandPrimary500')
  })

  // Preuve ciblee de Critical 1 sur les ids Figma a deux points ('1:1',
  // '12:345', ...) : les cles de style React Native derivees de ces ids
  // restent des identifiants JS valides et distincts entre eux.
  it('derive des cles de style React Native valides et uniques depuis des ids Figma a deux points', () => {
    for (const fixture of FIXTURES) {
      const { document } = figmaToDocument(fixture.file)
      const result = listExporters()
        .find((e) => e.id === 'react-native')!
        .export(document, { projectName: 'demo' })
      const screen = result.files.find((f) => f.path.startsWith('src/screens/'))!
      const keys = [...screen.contents.matchAll(/^ {2}([^\s:]+):/gm)].map((m) => m[1]!)
      for (const key of keys) expect(key, `${fixture.name} : ${key}`).toMatch(VALID_IDENTIFIER)
      expect(keys, `${fixture.name} : ${keys.join(', ')}`).toEqual([...new Set(keys)])
    }
  })
})
