// Test d'architecture (Tache 18) : rend executable la regle de dependance
// du §4 de la spec en LISANT les fichiers sources, plutot que de faire
// confiance a une convention. Deux regles supplementaires (decision 2 du
// brief de la Tache 18) ferment des trous decouverts en cours de route :
// la fuite du DOM vers les paquets du coeur (tsconfig.base.json) et le
// cycle d'import via le barrel `../index` (deja corrige une fois dans
// packages/core).
//
// Chaque regle collecte TOUTES ses violations avant d'appeler `expect`,
// pour que le message d'echec nomme le fichier fautif et l'import fautif
// (decision 3) au lieu d'un simple "expected true, received false".
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOSSIERS_IGNORES = new Set(['node_modules', 'dist', 'out', 'release', '.superpowers'])

/**
 * Liste recursivement les fichiers `.ts`/`.tsx` sous `dir`.
 * Ignore les dossiers de build/outillage et ne suit jamais les liens
 * symboliques (decision 4), ni pour les dossiers ni pour les fichiers.
 */
function listerFichiers(dir: string): string[] {
  const resultat: string[] = []
  for (const entree of readdirSync(dir)) {
    if (DOSSIERS_IGNORES.has(entree)) continue
    const chemin = join(dir, entree)
    const stats = lstatSync(chemin)
    if (stats.isSymbolicLink()) continue
    if (stats.isDirectory()) {
      resultat.push(...listerFichiers(chemin))
    } else if (/\.tsx?$/.test(entree)) {
      resultat.push(chemin)
    }
  }
  return resultat
}

type ImportTrouve = { specificateur: string; extrait: string }

/**
 * Extrait les specificateurs d'import (`import ... from '...'`,
 * `export * from '...'`, `import '...'`) d'un fichier TypeScript, par
 * lecture directe du texte source -- aucune resolution de module.
 */
function listerImports(fichier: string): ImportTrouve[] {
  const contenu = readFileSync(fichier, 'utf8')
  const regex = /(?:from|import)\s+['"]([^'"]+)['"]/g
  const trouvailles: ImportTrouve[] = []
  for (const correspondance of contenu.matchAll(regex)) {
    trouvailles.push({ specificateur: correspondance[1]!, extrait: correspondance[0] })
  }
  return trouvailles
}

/** Existe-t-il un dossier `src` pour ce paquet ? (garde contre un paquet mal forme). */
function racineSrcDuPaquet(paquet: string): string | null {
  const racine = join('packages', paquet, 'src')
  try {
    return lstatSync(racine).isDirectory() ? racine : null
  } catch {
    return null
  }
}

describe('regle de dependance (Tache 18, spec §4)', () => {
  it('packages/core/src n importe aucun autre paquet du depot', () => {
    const violations: string[] = []
    for (const fichier of listerFichiers('packages/core/src')) {
      for (const { specificateur, extrait } of listerImports(fichier)) {
        if (specificateur.startsWith('@calque/')) {
          violations.push(`${fichier} : import interdit "${specificateur}" (${extrait})`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('figma, codegen et ai n importent que @calque/core parmi les paquets du depot', () => {
    const violations: string[] = []
    for (const paquet of ['figma', 'codegen', 'ai']) {
      const racine = racineSrcDuPaquet(paquet)
      if (!racine) continue
      for (const fichier of listerFichiers(racine)) {
        for (const { specificateur, extrait } of listerImports(fichier)) {
          if (specificateur.startsWith('@calque/') && specificateur !== '@calque/core') {
            violations.push(`${fichier} : import interdit "${specificateur}" (${extrait}) -- seul @calque/core est autorise`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('aucun paquet du coeur n importe electron, react ou react-dom', () => {
    const interdits = new Set(['electron', 'react', 'react-dom'])
    const violations: string[] = []
    for (const paquet of ['core', 'figma', 'codegen', 'ai']) {
      const racine = racineSrcDuPaquet(paquet)
      if (!racine) continue
      for (const fichier of listerFichiers(racine)) {
        for (const { specificateur, extrait } of listerImports(fichier)) {
          if (interdits.has(specificateur)) {
            violations.push(`${fichier} : import interdit "${specificateur}" (${extrait})`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('apps/desktop/src/renderer n importe ni electron, ni node:*, ni figma/codegen/ai', () => {
    const paquetsInterdits = new Set(['@calque/figma', '@calque/codegen', '@calque/ai'])
    const violations: string[] = []
    for (const fichier of listerFichiers(join('apps', 'desktop', 'src', 'renderer'))) {
      for (const { specificateur, extrait } of listerImports(fichier)) {
        const interdit =
          specificateur === 'electron' || specificateur.startsWith('node:') || paquetsInterdits.has(specificateur)
        if (interdit) violations.push(`${fichier} : import interdit "${specificateur}" (${extrait})`)
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('tsconfig.base.json ne reintroduit jamais DOM dans "lib"', () => {
    // Retirer la cle "lib" ne suffit pas : TypeScript reinjecte DOM par
    // defaut pour une cible ES2022 (round de correction de la Tache 14).
    // Le test lit donc le tableau "lib" reellement declare, pas la simple
    // presence de la cle -- et ignore le mot "DOM" s'il apparait dans un
    // commentaire ailleurs dans le fichier.
    const contenu = readFileSync('tsconfig.base.json', 'utf8')
    const correspondance = contenu.match(/"lib"\s*:\s*\[([^\]]*)\]/)
    expect(correspondance, 'tsconfig.base.json doit declarer explicitement "lib"').not.toBeNull()
    const tableauLib = correspondance![1]!
    const contientDom = /"DOM(\.\w+)?"/i.test(tableauLib)
    expect(
      contientDom,
      `tsconfig.base.json declare "lib": [${tableauLib}] -- DOM doit rester absent pour ne pas fuiter vers packages/*`,
    ).toBe(false)
  })

  it('aucun fichier de production de packages/*/src n importe le barrel ../index de son propre paquet', () => {
    // Un cycle a deja ete corrige sur ce point dans packages/core : un
    // fichier de packages/<p>/src qui importe le barrel de son propre
    // paquet (directement ou via un chemin relatif qui s'y resout)
    // referme un cycle module -> barrel -> module. Les fichiers de test
    // co-localises (`*.test.ts`) sont exclus : tester la surface publique
    // d'un paquet via son propre barrel est un choix delibere (voir
    // packages/core/src/version.test.ts), pas un cycle -- un fichier de
    // test n'est jamais lui-meme reexporte par le barrel.
    const violations: string[] = []
    for (const paquet of readdirSync('packages')) {
      const racine = racineSrcDuPaquet(paquet)
      if (!racine) continue
      const barrel = resolve(racine, 'index')
      for (const fichier of listerFichiers(racine)) {
        if (resolve(fichier).replace(/\.tsx?$/, '') === barrel) continue
        if (/\.test\.tsx?$/.test(fichier)) continue
        for (const { specificateur, extrait } of listerImports(fichier)) {
          if (!specificateur.startsWith('.')) continue
          const cible = resolve(dirname(fichier), specificateur).replace(/\.tsx?$/, '')
          if (cible === barrel) {
            violations.push(`${fichier} : import du barrel "${specificateur}" (${extrait}) -- cycle interdit`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
})
