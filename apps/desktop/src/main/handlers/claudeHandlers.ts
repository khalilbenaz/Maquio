// Gestionnaire du canal askClaude (Tache 17) : fonction pure d'injection,
// testable avec un FakeClaudeRunner (@calque/ai), sans binaire `claude`
// ni sous-processus (voir test/claudeHandlers.test.ts). main.ts se
// contente de la cabler avec un AiService construit sur ProcessClaudeRunner
// (nodeSpawn.ts).
//
// Round de correction (decision 7 du brief) : la commande composite
// atomique (patchToCommand) est appliquee ICI, cote main -- son resultat
// (le document apres patch) est renvoye au renderer sous forme de JSON
// serialise (documentJson), jamais la Command elle-meme (des fonctions ne
// traversent pas l'IPC). Le renderer rejoue ce remplacement de document
// comme une commande annulable en un seul geste (voir ClaudePanel.tsx) --
// c'est ce qui garde "un seul Ctrl-Z defait toute la demande" vrai sans
// que le renderer importe jamais @calque/ai.
import { parseDocument, serializeDocument } from '@calque/core'
import type { AiService } from '@calque/ai'

export type ClaudeAskInput = { instruction: string; json: string; selectionIds: string[]; pageId: string }
export type ClaudeAskOutput = { patchJson: string; documentJson: string }

// Decision 4 : les erreurs nommees de @calque/ai (ClaudeUnavailableError,
// ClaudeFailedError, ClaudeOutputError) et l'erreur de patch malforme
// levee par AiService.ask portent deja un message francais qui ne
// contient jamais le prompt (voir packages/ai/src/runner.ts et
// packages/ai/src/service.ts) -- on ne relaie que ce message, jamais la
// cause (qui pourrait porter, par exemple, l'erreur Zod complete d'un
// patch invalide), pour ne rien laisser fuiter au-dela de ce qui a ete
// explicitement construit pour l'affichage.
function translateClaudeError(err: unknown): Error {
  if (err instanceof Error) return new Error(err.message)
  return new Error('Erreur inattendue lors de la demande a Claude Code')
}

export function createClaudeHandler(deps: { service: AiService }) {
  return async (input: ClaudeAskInput): Promise<ClaudeAskOutput> => {
    let document: ReturnType<typeof parseDocument>
    try {
      document = parseDocument(input.json)
    } catch (err) {
      throw translateClaudeError(err)
    }

    try {
      const { patch, command } = await deps.service.ask({
        instruction: input.instruction,
        document,
        selectionIds: input.selectionIds,
        pageId: input.pageId,
      })
      const nextDocument = command.apply(document)
      return { patchJson: JSON.stringify(patch), documentJson: serializeDocument(nextDocument) }
    } catch (err) {
      throw translateClaudeError(err)
    }
  }
}
