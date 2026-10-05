// Service haut niveau du pont Claude Code (Tache 13) : enchaine
// buildPrompt -> runner.run -> parsePatch -> patchToCommands/patchToCommand.
//
// N'EXECUTE JAMAIS les commandes qu'il rend : c'est a l'appelant de les
// passer a History, pour que l'annulation (undo/redo) reste entierement
// sous son controle (le panneau Claude Code de la Tache 17 attendra par
// exemple une confirmation avant de les executer).
//
// Round de correction 1 : `command` (la composite atomique de patchToCommand,
// Tache 17) est ce que l'appelant executera reellement - `commands` (le
// tableau granulaire de patchToCommands) reste rendu pour un appelant qui
// voudrait la granularite fine, mais un `cmds.forEach(h.execute)` naif sur
// ce tableau n'est PAS atomique pour un patch a plusieurs operations (voir
// apply.ts).
import type { MaquioDocument, Command } from '@maquio/core'
import { buildPrompt } from './prompt'
import { parsePatch } from './patch'
import type { DocumentPatch } from './patch'
import { patchToCommand, patchToCommands } from './apply'
import type { ClaudeRunner } from './runner'
import { askWithCorrections } from './correction-loop'
import { lintDesign, touchedNodeIds } from './design-lint'
import { generateApp, isAppCreationRequest } from './app-pipeline'
import type { PipelineHooks } from './app-pipeline'

export { MAX_CORRECTION_ROUNDS } from './correction-loop'

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

// Point 4 de la reparation du pont : quand parsePatch rejette la reponse,
// l'appelant a besoin de deux choses distinctes -- un message par defaut
// deja francais et sans dump technique (`message`, inchange par rapport a
// l'ancien comportement de ask(), voir service.test.ts), ET la reponse
// brute INTEGRALE (`rawResponse`, pas tronquee ici) pour qu'elle reste
// consultable en aval. `cause` (herite d'Error) porte l'InvalidPatchError
// d'origine, qui porte elle-meme la ZodError quand le rejet vient du schema
// (voir patch.ts) -- c'est ce que apps/desktop/claudeHandlers.ts exploite
// via translateUnknownError pour produire une explication plus precise que
// ce message par defaut, sans que packages/ai n'ait besoin de connaitre
// cette fonction (qui vit cote application, pas ici).
export class ClaudePatchRejectedError extends Error {
  readonly rawResponse: string

  constructor(rawResponse: string, options?: { cause?: unknown }) {
    super(`Impossible d'interpréter la réponse de Claude Code comme un patch : ${truncate(rawResponse)}`, options)
    this.name = 'ClaudePatchRejectedError'
    this.rawResponse = rawResponse
  }
}

export class AiService {
  constructor(private readonly runner: ClaudeRunner) {}

  async ask(
    input: {
      instruction: string
      document: MaquioDocument
      selectionIds: string[]
      pageId: string
    },
    // Point 2 de la reparation du pont : relaye tel quel a runner.run(), qui
    // le combine deja avec son propre delai interne (voir
    // ProcessClaudeRunner.run dans runner.ts). AiService reste un simple
    // relais ici, pour que le bouton "Annuler" du panneau (via
    // apps/desktop/claudeHandlers.ts) puisse interrompre reellement l'appel
    // en cours.
    signal?: AbortSignal,
    // Progression et rendu des ecrans (critique visuelle) pour la creation
    // d'une application ; sans renderScreen, pas de critique visuelle.
    hooks?: PipelineHooks,
  ): Promise<{ patch: DocumentPatch; commands: Command[]; command: Command }> {
    const prompt = buildPrompt({
      instruction: input.instruction,
      document: input.document,
      selectionIds: input.selectionIds,
    })

    // Creation d'une application : generation ecran par ecran (plan, ecrans
    // en parallele, critique visuelle), voir app-pipeline.ts.
    if (isAppCreationRequest(input.instruction)) {
      const patch = await generateApp(this.runner, input, hooks ?? {}, signal)
      return { patch, commands: patchToCommands(patch, input.pageId), command: patchToCommand(patch, input.pageId, input.document) }
    }

    // Boucle de correction (voir correction-loop.ts) : un patch rejete, a la
    // lecture (parsePatch) ou a l'application (patchToCommand, qui valide
    // chaque operation sur le document), est renvoye a Claude avec la liste
    // des problemes. Un patch valide passe ensuite le controle de mise en
    // page (design-lint.ts), consultatif.
    return askWithCorrections({
      runner: this.runner,
      prompt,
      signal,
      parse: (raw) => {
        let patch: DocumentPatch
        try {
          patch = parsePatch(raw)
        } catch (cause) {
          throw new ClaudePatchRejectedError(raw, { cause })
        }
        // Un echec d'application est relaye tel quel (pas enveloppe).
        return { patch, commands: patchToCommands(patch, input.pageId), command: patchToCommand(patch, input.pageId, input.document) }
      },
      defects: ({ patch, command }) => lintDesign(command.apply(input.document), input.pageId, touchedNodeIds(patch)),
    })
  }
}
