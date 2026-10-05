// Boucle de correction generique : un appel a Claude, puis jusqu'a
// MAX_CORRECTION_ROUNDS relances avec la liste precise des problemes.
//
// - `parse` interprete la reponse brute et LEVE si elle est inexploitable
//   (forme invalide, operation inapplicable...) : ces problemes sont renvoyes
//   a Claude (voir correction.ts) ; apres la derniere relance, la derniere
//   erreur est relancee telle quelle a l'appelant.
// - `defects` (facultatif) liste les defauts CONSULTATIFS d'une reponse
//   valide (mise en page, voir design-lint.ts) : renvoyes a Claude tant qu'il
//   reste des relances, jamais bloquants. La derniere reponse valide est
//   gardee et rendue si une correction ulterieure est inexploitable.
// - Les erreurs du runner (indisponible, delai, annulation) ne sont jamais
//   relancees.
import { ClaudeCancelledError } from './runner'
import type { ClaudeActivity, ClaudeRunner, ImageInput } from './runner'
import { buildCorrectionPrompt, buildLayoutCorrectionPrompt, describeRejectionForModel } from './correction'

// Nombre de relances de Claude apres une reponse rejetee (donc au plus
// 1 + MAX_CORRECTION_ROUNDS appels).
export const MAX_CORRECTION_ROUNDS = 2

export async function askWithCorrections<T>(opts: {
  runner: ClaudeRunner
  prompt: string
  parse: (raw: string) => T
  defects?: (value: T) => string[]
  // Jointes au premier appel seulement : une correction porte sur le texte.
  images?: ImageInput[]
  // Texte de la reponse en cours d'ecriture, a chaque appel (corrections
  // comprises) : dessin en direct.
  onText?: (textSoFar: string) => void
  onActivity?: (activity: ClaudeActivity) => void
  signal?: AbortSignal
}): Promise<T> {
  const { runner, prompt, parse, defects, images, onText, onActivity, signal } = opts
  let currentPrompt = prompt
  let lastValid: { value: T } | null = null

  for (let round = 0; ; round++) {
    const withImages = round === 0 && images !== undefined && images.length > 0
    const options =
      withImages || onText ? { ...(withImages ? { images } : {}), ...(onText ? { onText } : {}), ...(onActivity ? { onActivity } : {}) } : undefined
    const raw = await runner.run(currentPrompt, signal, options)

    let value: T
    try {
      value = parse(raw)
    } catch (cause) {
      if (lastValid !== null) return lastValid.value
      if (round >= MAX_CORRECTION_ROUNDS) throw cause
      if (signal?.aborted) throw new ClaudeCancelledError()
      currentPrompt = buildCorrectionPrompt(prompt, raw, describeRejectionForModel(cause, raw))
      continue
    }

    const found = defects ? defects(value) : []
    if (found.length === 0 || round >= MAX_CORRECTION_ROUNDS) return value
    if (signal?.aborted) throw new ClaudeCancelledError()
    lastValid = { value }
    currentPrompt = buildLayoutCorrectionPrompt(prompt, raw, found.join('\n'))
  }
}
