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
import { DocumentVersionError, parseDocument, serializeDocument } from '@calque/core'
import { ClaudeFailedError, ClaudeOutputError, ClaudeUnavailableError } from '@calque/ai'
import type { AiService } from '@calque/ai'
import { translateUnknownError } from '../../shared/errors'

export type ClaudeAskInput = { instruction: string; json: string; selectionIds: string[]; pageId: string }
export type ClaudeAskOutput = { patchJson: string; documentJson: string }

// Round de correction 1 (Critical + Important) : cette fonction relayait
// `err.message` de N'IMPORTE QUELLE erreur SANS PREFIXE ni reconnaissance
// specifique -- un ZodError leve par nodeSchema.parse (patch d'update dont
// le contenu fusionne est invalide, voir applyAllOps dans
// packages/ai/src/apply.ts) traversait donc tel quel, dump JSON technique
// compris. Desormais : les erreurs nommees de @calque/ai
// (ClaudeUnavailableError, ClaudeFailedError, ClaudeOutputError) et
// DocumentVersionError portent deja un message francais complet qui ne
// contient jamais le prompt (voir packages/ai/src/runner.ts) -- relayees
// telles quelles, sans prefixe (un prefixe produirait une redite). Tout le
// reste (dont un dump ZodError, ou l'erreur generique de patch malforme
// levee par AiService.ask) passe par la traduction generique partagee, qui
// prefixe ET ne rend jamais de dump technique (voir src/shared/errors.ts) --
// coherent avec les trois autres gestionnaires du main.
function translateClaudeError(err: unknown): Error {
  if (
    err instanceof ClaudeUnavailableError ||
    err instanceof ClaudeFailedError ||
    err instanceof ClaudeOutputError ||
    err instanceof DocumentVersionError
  ) {
    return new Error(err.message)
  }
  return translateUnknownError(err, 'Erreur Claude Code')
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
