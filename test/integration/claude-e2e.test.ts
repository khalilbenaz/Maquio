// Garde-fou "vrai binaire claude" (reparation du pont Claude Code).
//
// C'est le seul test qui aurait attrape les deux defauts diagnostiques en
// conditions reelles (voir le rapport de reparation,
// .superpowers/sdd/2026-09-20-calque-v1/pont-claude-report.md) :
// - Defaut A (repertoire de travail non maitrise) : tout le reste de la
//   suite appelle FakeClaudeRunner (packages/ai/src/fake-runner.ts), qui ne
//   lance jamais de sous-processus et n'a donc aucune notion de cwd -- rien
//   ne pouvait prouver qu'un `claude -p` reel rend la main.
// - Defaut B (forme des noeuds non fixee) : FakeClaudeRunner renvoie des
//   patchs DEJA bien formes, scriptes a la main -- rien ne prouvait que le
//   PROMPT REEL (buildPrompt) amene le VRAI modele a produire un noeud que
//   parsePatch accepte.
//
// Opt-in STRICT (contrainte du brief) : jamais execute par `npm test` par
// defaut -- gate par la variable d'environnement CALQUE_E2E_CLAUDE=1,
// ET ignore silencieusement (it.skip) si le binaire `claude` est absent du
// PATH, exactement comme flutter-analyze.test.ts/flutter-dart-format.test.ts
// pour `flutter`/`dart` -- la suite hermetique (sans reseau, sans binaire
// externe) ne doit jamais en dependre. Voir le README (section
// "Developper") pour comment le lancer.
import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { createDocument } from '@calque/core'
import { buildPrompt, parsePatch, patchToCommand, ProcessClaudeRunner } from '@calque/ai'
import { nodeSpawn } from '../../apps/desktop/src/main/adapters/nodeSpawn'
import { createNeutralClaudeWorkingDirectory } from '../../apps/desktop/src/main/adapters/claudeWorkingDirectory'

const ENV_FLAG = 'CALQUE_E2E_CLAUDE'
const E2E_REQUESTED = process.env[ENV_FLAG] === '1'

// Detection UNE SEULE FOIS, avant l'enregistrement des tests (comme pour
// `flutter`/`dart` ailleurs dans ce dossier) -- jamais de spawn au chargement
// du fichier quand CALQUE_E2E_CLAUDE n'est pas mis, pour que ce fichier
// reste inoffensif dans `npm test` par defaut.
function detecterBinaireClaude(): string | null {
  try {
    const sortie = execSync('command -v claude', { encoding: 'utf8', shell: '/bin/bash', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return sortie.length > 0 ? sortie : null
  } catch {
    return null
  }
}

const claudeBinaryPath = E2E_REQUESTED ? detecterBinaireClaude() : null
const runIfRequestedAndAvailable = E2E_REQUESTED && claudeBinaryPath !== null ? it : it.skip

// Delai genereux (point 2 du brief : "donne-lui un delai genereux") : 4
// minutes cote ProcessClaudeRunner, 4m20s cote Vitest (marge au-dessus du
// delai interne, pour que ce soit bien ClaudeTimeoutError qui parle en cas
// de probleme, pas le timeout du framework de test). Tres au-dessus du
// delai par defaut de production (DEFAULT_CLAUDE_TIMEOUT_MS, 2 minutes) a
// dessein : ce test verifie l'ACCEPTATION du patch par un vrai modele, pas
// le comportement du delai (deja couvert par des faux minuteurs dans
// packages/ai/test/runner.test.ts) -- un delai de production qui coupe ce
// test au mauvais moment ne prouverait rien sur le pont lui-meme.
const RUNNER_TIMEOUT_MS = 240_000
const TEST_TIMEOUT_MS = 260_000

describe(`bout-en-bout : vrai binaire claude (opt-in, ${ENV_FLAG}=1)`, () => {
  runIfRequestedAndAvailable(
    'produit, avec le VRAI binaire claude et le VRAI prompt de buildPrompt, un patch accepte par parsePatch et applicable par patchToCommand',
    async () => {
      const bin = claudeBinaryPath
      if (bin === null) {
        // Ne devrait jamais s'executer (runIfRequestedAndAvailable ne
        // selectionne `it` que quand bin !== null) -- filet de securite
        // explicite plutot qu'un `!` qui masquerait une regression.
        throw new Error('binaire claude introuvable malgre la detection prealable')
      }

      // Defaut A : lance dans le MEME repertoire de travail neutre que la
      // production (voir main.ts), jamais dans le dossier du depot.
      const runner = new ProcessClaudeRunner({
        spawn: nodeSpawn,
        which: async () => bin,
        workingDirectory: createNeutralClaudeWorkingDirectory,
        timeoutMs: RUNNER_TIMEOUT_MS,
      })

      const document = createDocument('Document de test e2e')
      const pageId = document.pages[0]!.id

      // Le prompt REEL, exactement celui que ClaudePanel/claudeHandlers.ts
      // envoient en production -- reprend l'instruction du diagnostic
      // original ("Ajoute un titre texte 'Bienvenue' en haut et un bouton
      // rectangulaire bleu de 48 pixels de haut en bas") qui produisait un
      // noeud rejete avant la reparation du prompt (defaut B).
      const prompt = buildPrompt({
        instruction:
          "Ajoute un titre texte 'Bienvenue' en haut et un bouton rectangulaire bleu de 48 pixels de haut en bas",
        document,
        selectionIds: [],
      })

      const raw = await runner.run(prompt)

      // Preuve du defaut B corrige : parsePatch NE DOIT PAS lever. Avant la
      // reparation du prompt, ceci levait InvalidPatchError ("Patch
      // invalide : ...") sur un noeud invente (x/y/width/height a plat).
      const patch = parsePatch(raw)
      expect(patch.ops.length).toBeGreaterThan(0)

      // Preuve complementaire : le patch doit aussi etre APPLICABLE, pas
      // seulement structurellement valide (patchToCommand revalide chaque
      // noeud fusionne via nodeSchema, voir packages/ai/src/apply.ts).
      const command = patchToCommand(patch, pageId, document)
      const documentPatche = command.apply(document)
      expect(documentPatche).not.toBe(document)
    },
    TEST_TIMEOUT_MS,
  )
})
