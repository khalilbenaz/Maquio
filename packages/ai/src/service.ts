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

export class AiService {
  constructor(private readonly runner: ClaudeRunner) {}

  async ask(input: {
    instruction: string
    document: CalqueDocument
    selectionIds: string[]
    pageId: string
  }): Promise<{ patch: DocumentPatch; commands: Command[]; command: Command }> {
    const prompt = buildPrompt({
      instruction: input.instruction,
      document: input.document,
      selectionIds: input.selectionIds,
    })

    const raw = await this.runner.run(prompt)

    let patch: DocumentPatch
    try {
      patch = parsePatch(raw)
    } catch (cause) {
      // Le message contient un extrait de la reponse BRUTE (tronquee) :
      // c'est ce que le panneau affichera a l'utilisateur (decision 11), pas
      // le prompt envoye (qui, lui, peut porter des donnees utilisateur et
      // n'a pas a apparaitre ici).
      throw new Error(`Impossible d'interpréter la réponse de Claude Code comme un patch : ${truncate(raw)}`, {
        cause,
      })
    }

    const commands = patchToCommands(patch, input.pageId)
    const command = patchToCommand(patch, input.pageId, input.document)
    return { patch, commands, command }
  }
}
