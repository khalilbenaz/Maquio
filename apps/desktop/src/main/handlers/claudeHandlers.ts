// Gestionnaire des canaux askClaude/cancelClaude (Tache 17, annulation et
// message d'echec ajoutes lors de la reparation du pont) : fonctions pures
// d'injection, testables avec un FakeClaudeRunner (@calque/ai), sans
// binaire `claude` ni sous-processus (voir test/claudeHandlers.test.ts).
// main.ts se contente de les cabler avec un AiService construit sur
// ProcessClaudeRunner (nodeSpawn.ts).
//
// Round de correction (decision 7 du brief) : la commande composite
// atomique (patchToCommand) est appliquee ICI, cote main -- son resultat
// (le document apres patch) est renvoye au renderer sous forme de JSON
// serialise (documentJson), jamais la Command elle-meme (des fonctions ne
// traversent pas l'IPC). Le renderer rejoue ce remplacement de document
// comme une commande annulable en un seul geste (voir ClaudePanel.tsx) --
// c'est ce qui garde "un seul Ctrl-Z defait toute la demande" vrai sans
// que le renderer importe jamais @calque/ai.
//
// Point 2 (reparation du pont) : ClaudeRequestTracker retient l'unique
// AbortController de la demande askClaude EN COURS (le panneau desactive
// "Demander à Claude" pendant l'attente -- voir ClaudePanel.tsx -- donc une
// seule demande a la fois suffit, pas besoin d'un identifiant par requete)
// pour que cancelClaude puisse reellement l'interrompre depuis un canal
// IPC distinct.
import { DocumentVersionError, parseDocument, serializeDocument } from '@calque/core'
import {
  ClaudeCancelledError,
  ClaudeFailedError,
  ClaudeOutputError,
  ClaudePatchRejectedError,
  ClaudeTimeoutError,
  ClaudeUnavailableError,
  InvalidPatchError,
} from '@calque/ai'
import type { AiService } from '@calque/ai'
import { ZodError } from 'zod'
import { translateUnknownError } from '../../shared/errors'

export type ClaudeAskInput = { instruction: string; json: string; selectionIds: string[]; pageId: string }
export type ClaudeAskOutput = { patchJson: string; documentJson: string }

export class ClaudeRequestTracker {
  private current: AbortController | null = null

  begin(): AbortController {
    const controller = new AbortController()
    this.current = controller
    return controller
  }

  end(controller: AbortController): void {
    if (this.current === controller) {
      this.current = null
    }
  }

  // Rend true si une demande etait effectivement en cours (utile pour les
  // tests) ; no-op silencieux sinon, voir la note sur cancelClaude dans
  // shared/api.ts.
  cancel(): boolean {
    if (this.current === null) return false
    this.current.abort()
    return true
  }
}

function truncateRawResponse(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

// Point 4 (reparation du pont) : quand la reponse de Claude Code est
// rejetee comme patch (ClaudePatchRejectedError, voir packages/ai/src/
// service.ts), l'utilisateur doit lire CE QUI N'ALLAIT PAS en francais
// clair -- jamais le dump du validateur (le format brut de ZodError,
// illisible, en anglais) -- et la reponse BRUTE doit rester consultable
// pour comprendre. `translateUnknownError` (deja utilisee par les trois
// autres gestionnaires du main) sait deja transformer une ZodError en
// phrase francaise ; on la reutilise ici plutot que de reinventer une
// description de schema specifique au pont Claude Code.
function describePatchRejection(err: ClaudePatchRejectedError): string {
  const cause = err.cause
  const zodCause = cause instanceof InvalidPatchError && cause.cause instanceof ZodError ? cause.cause : null

  const explication = zodCause
    ? translateUnknownError(zodCause, 'Patch Claude Code').message
    : cause instanceof Error && cause.message.length > 0
      ? `Patch Claude Code invalide : ${cause.message}`
      : 'Patch Claude Code invalide : réponse inexploitable'

  return `${explication} (réponse brute : ${truncateRawResponse(err.rawResponse)})`
}

// Round de correction 1 (Critical + Important) : cette fonction relayait
// `err.message` de N'IMPORTE QUELLE erreur SANS PREFIXE ni reconnaissance
// specifique -- un ZodError leve par nodeSchema.parse (patch d'update dont
// le contenu fusionne est invalide, voir applyAllOps dans
// packages/ai/src/apply.ts) traversait donc tel quel, dump JSON technique
// compris. Desormais : les erreurs nommees de @calque/ai
// (ClaudeUnavailableError, ClaudeFailedError, ClaudeOutputError,
// ClaudeTimeoutError, ClaudeCancelledError) et DocumentVersionError portent
// deja un message francais complet qui ne contient jamais le prompt (voir
// packages/ai/src/runner.ts) -- relayees telles quelles, sans prefixe (un
// prefixe produirait une redite). ClaudePatchRejectedError beneficie d'une
// traduction dediee (voir describePatchRejection ci-dessus). Tout le reste
// (dont un dump ZodError leve ailleurs) passe par la traduction generique
// partagee, qui prefixe ET ne rend jamais de dump technique (voir
// src/shared/errors.ts) -- coherent avec les trois autres gestionnaires du
// main.
function translateClaudeError(err: unknown): Error {
  if (
    err instanceof ClaudeUnavailableError ||
    err instanceof ClaudeFailedError ||
    err instanceof ClaudeOutputError ||
    err instanceof ClaudeTimeoutError ||
    err instanceof ClaudeCancelledError ||
    err instanceof DocumentVersionError
  ) {
    return new Error(err.message)
  }
  if (err instanceof ClaudePatchRejectedError) {
    return new Error(describePatchRejection(err))
  }
  return translateUnknownError(err, 'Erreur Claude Code')
}

export function createClaudeHandler(deps: { service: AiService; requests: ClaudeRequestTracker }) {
  return async (input: ClaudeAskInput): Promise<ClaudeAskOutput> => {
    let document: ReturnType<typeof parseDocument>
    try {
      document = parseDocument(input.json)
    } catch (err) {
      throw translateClaudeError(err)
    }

    const controller = deps.requests.begin()
    try {
      const { patch, command } = await deps.service.ask(
        {
          instruction: input.instruction,
          document,
          selectionIds: input.selectionIds,
          pageId: input.pageId,
        },
        controller.signal,
      )
      const nextDocument = command.apply(document)
      return { patchJson: JSON.stringify(patch), documentJson: serializeDocument(nextDocument) }
    } catch (err) {
      throw translateClaudeError(err)
    } finally {
      deps.requests.end(controller)
    }
  }
}

export function createClaudeCancelHandler(deps: { requests: ClaudeRequestTracker }) {
  return async (): Promise<void> => {
    deps.requests.cancel()
  }
}
