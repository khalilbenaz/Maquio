// Faux ClaudeRunner pour les tests (Tache 13) : ni sous-processus, ni
// binaire `claude`, ni reseau. Accepte soit une liste de reponses
// consommees dans l'ordre (scenario scripte), soit une fonction
// `(prompt) => string` (scenario qui reagit au prompt recu), et enregistre
// chaque prompt recu dans `prompts` pour que les tests puissent verifier ce
// qui a ete envoye (ex. que l'instruction de l'utilisateur y figure).
import type { ClaudeRunner, RunOptions } from './runner'

// Quand la liste de reponses scriptees est epuisee : une erreur nommee et
// explicite, plutot qu'un `undefined` silencieux qui ferait planter plus
// loin (parsePatch, sur "undefined n'est pas du JSON") avec un message sans
// rapport avec la cause reelle.
export class FakeClaudeRunnerExhaustedError extends Error {
  constructor() {
    super('FakeClaudeRunner : plus aucune reponse scriptee disponible pour ce prompt')
    this.name = 'FakeClaudeRunnerExhaustedError'
  }
}

export class FakeClaudeRunner implements ClaudeRunner {
  readonly prompts: string[] = []
  // Options de chaque appel (images jointes), dans l'ordre des prompts.
  readonly options: (RunOptions | undefined)[] = []
  private readonly responses: string[] | ((prompt: string) => string)
  private cursor = 0

  constructor(responses: string[] | ((prompt: string) => string)) {
    this.responses = responses
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async run(prompt: string, _signal?: AbortSignal): Promise<string> {
    this.prompts.push(prompt)

    if (typeof this.responses === 'function') {
      return this.responses(prompt)
    }

    const response = this.responses[this.cursor]
    if (response === undefined) {
      throw new FakeClaudeRunnerExhaustedError()
    }
    this.cursor += 1
    return response
  }
}
