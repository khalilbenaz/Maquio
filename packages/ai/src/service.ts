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
import type { CalqueDocument, Command } from '@calque/core'
import { buildPrompt } from './prompt'
import { parsePatch } from './patch'
import type { DocumentPatch } from './patch'
import { patchToCommand, patchToCommands } from './apply'
import type { ClaudeRunner } from './runner'

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
      document: CalqueDocument
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

    const raw = await this.runner.run(prompt, signal)

    let patch: DocumentPatch
    try {
      patch = parsePatch(raw)
    } catch (cause) {
      throw new ClaudePatchRejectedError(raw, { cause })
    }

    const commands = patchToCommands(patch, input.pageId)
    const command = patchToCommand(patch, input.pageId, input.document)
    return { patch, commands, command }
  }
}
