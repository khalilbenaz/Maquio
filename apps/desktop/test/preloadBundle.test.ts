// Garde-fou statique (rapport packaged-app, defaut n1 : "Unable to load
// preload script" / "Cannot use import statement outside a module").
//
// Aucun test de la suite ne lance reellement Electron (les tests
// bout-en-bout Electron sont hors perimetre de la v1, assume) : rien ne
// verifiait donc que le bundle de preload produit par Vite est bien du
// CommonJS, format impose par le chargeur de preload en bac a sable
// d'Electron (sandbox: true, voir src/main/window.ts) -- qui ne comprend
// pas `import`/`export`.
//
// Ce test CONSTRUIT lui-meme le bundle de preload (via l'API JS de Vite,
// dans un dossier temporaire, jamais dist/) plutot que de lire une sortie
// de build preexistante : il reste ainsi rapide (un seul petit fichier,
// pas de watch, pas de minification) et ne peut jamais echouer faute de
// sortie de build presente -- il n'en depend simplement pas. Il doit
// echouer si quelqu'un repasse vite.electron.preload.config.ts en module
// ES (formats: ['es']).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

const racineDesktop = resolve(__dirname, '..')

describe('bundle preload (garde-fou format CommonJS)', () => {
  it('le preload construit ne contient aucune instruction import/export de haut niveau', async () => {
    const dossierTemporaire = mkdtempSync(join(tmpdir(), 'maquio-preload-build-'))
    try {
      await build({
        root: racineDesktop,
        configFile: resolve(racineDesktop, 'vite.electron.preload.config.ts'),
        logLevel: 'silent',
        build: {
          outDir: dossierTemporaire,
          emptyOutDir: true,
        },
      })

      const chemin = join(dossierTemporaire, 'preload.cjs')
      const contenu = readFileSync(chemin, 'utf8')

      const ligneModuleEs = contenu
        .split('\n')
        .find((ligne) => /^\s*(import\s|import\{|export\s|export\{|export\*)/.test(ligne))
      expect(
        ligneModuleEs,
        `le bundle preload contient une instruction de module ES : "${ligneModuleEs}" -- ` +
          `un script de preload Electron en bac a sable doit etre du CommonJS pur ` +
          `(voir vite.electron.preload.config.ts, formats: ['cjs'])`,
      ).toBeUndefined()

      // Contre-preuve positive : un vrai bundle CommonJS appelle require()
      // pour 'electron' (externalise) -- s'assure que le test ne passe pas
      // simplement parce que le build a echoue silencieusement / produit un
      // fichier vide.
      expect(contenu).toMatch(/require\(['"]electron['"]\)/)
    } finally {
      rmSync(dossierTemporaire, { recursive: true, force: true })
    }
  }, 30000)
})
