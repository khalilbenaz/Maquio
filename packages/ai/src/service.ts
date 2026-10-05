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
import { ClaudeCancelledError } from './runner'
import type { ClaudeRunner } from './runner'
import { buildCorrectionPrompt, buildLayoutCorrectionPrompt, describeRejectionForModel } from './correction'
import { lintDesign, touchedNodeIds } from './design-lint'

// Nombre de relances de Claude apres un patch rejete (donc au plus
// 1 + MAX_CORRECTION_ROUNDS appels pour une demande).
export const MAX_CORRECTION_ROUNDS = 2

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
  ): Promise<{ patch: DocumentPatch; commands: Command[]; command: Command }> {
    const prompt = buildPrompt({
      instruction: input.instruction,
      document: input.document,
      selectionIds: input.selectionIds,
    })

    // Boucle de correction (voir correction.ts) : un patch rejete, a la
    // lecture (parsePatch) ou a l'application (patchToCommand, qui valide
    // chaque operation sur le document), est renvoye a Claude avec la liste
    // des problemes, jusqu'a MAX_CORRECTION_ROUNDS fois. Les erreurs du
    // runner (indisponible, delai, annulation) ne sont jamais relancees.
    //
    // Un patch valide passe ensuite le controle de mise en page
    // (design-lint.ts) : ses defauts (textes rognes ou superposes...) sont
    // eux aussi renvoyes a Claude, mais ce controle reste consultatif. Le
    // dernier patch valide est garde (`lastValid`) et rendu si les
    // corrections s'epuisent ou si une correction est inexploitable.
    let currentPrompt = prompt
    let lastValid: { patch: DocumentPatch; commands: Command[]; command: Command } | null = null
    for (let round = 0; ; round++) {
      const raw = await this.runner.run(currentPrompt, signal)

      let patch: DocumentPatch | null = null
      try {
        patch = parsePatch(raw)
        const commands = patchToCommands(patch, input.pageId)
        const command = patchToCommand(patch, input.pageId, input.document)
        const result = { patch, commands, command }

        const defects = lintDesign(command.apply(input.document), input.pageId, touchedNodeIds(patch))
        if (defects.length === 0 || round >= MAX_CORRECTION_ROUNDS) return result
        if (signal?.aborted) throw new ClaudeCancelledError()
        lastValid = result
        currentPrompt = buildLayoutCorrectionPrompt(prompt, raw, defects.join('\n'))
      } catch (cause) {
        if (cause instanceof ClaudeCancelledError) throw cause
        if (lastValid !== null) return lastValid
        if (round >= MAX_CORRECTION_ROUNDS) {
          // Meme erreur qu'avant la boucle : rejet de lecture enveloppe,
          // echec d'application relaye tel quel.
          throw patch === null ? new ClaudePatchRejectedError(raw, { cause }) : cause
        }
        if (signal?.aborted) throw new ClaudeCancelledError()
        currentPrompt = buildCorrectionPrompt(prompt, raw, describeRejectionForModel(cause, raw))
      }
    }
  }
}
