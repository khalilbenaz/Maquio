// Gestionnaires des reglages Claude Code : fonctions pures d'injection,
// testables sans Electron (voir test/claudeSettingsHandlers.test.ts).
// main.ts les cable avec createClaudeSettingsStore (JSON ordinaire, voir
// adapters/claudeSettingsStore.ts), validateClaudeBinaryPath et le `which`
// compose (adapters/claudeDetection.ts) -- le MEME `which` que celui
// injecte dans ProcessClaudeRunner, pour que l'etat affiche dans les
// reglages soit exactement celui qui sera utilise pour lancer `claude`.
export type ClaudeStatus = { available: boolean; path: string | null }
export type ClaudePathValidationResult = { ok: true } | { ok: false; reason: string }

export type ClaudeSettings = { claudeAvailable: boolean; claudePath: string | null; claudeCustomPath: string | null }

export function createGetClaudeSettingsHandler(deps: {
  store: { getCustomPath(): Promise<string | null> }
  resolveStatus: () => Promise<ClaudeStatus>
}) {
  return async (): Promise<ClaudeSettings> => {
    const [status, customPath] = await Promise.all([deps.resolveStatus(), deps.store.getCustomPath()])
    return { claudeAvailable: status.available, claudePath: status.path, claudeCustomPath: customPath }
  }
}

export function createSetClaudeCustomPathHandler(deps: {
  store: { getCustomPath(): Promise<string | null>; setCustomPath(path: string | null): Promise<void> }
  validate: (path: string) => Promise<ClaudePathValidationResult>
  resolveStatus: () => Promise<ClaudeStatus>
}) {
  return async (rawPath: string): Promise<{ claudeAvailable: boolean; claudePath: string | null }> => {
    const trimmed = rawPath.trim()

    if (trimmed === '') {
      // Chemin vide : efface le reglage, retour a la recherche habituelle
      // dans le PATH -- aucune validation a faire pour "rien".
      await deps.store.setCustomPath(null)
    } else {
      const validation = await deps.validate(trimmed)
      if (!validation.ok) {
        // Refuse AVANT d'ecrire quoi que ce soit : l'ancien reglage
        // (deja enregistre par deps.store) n'est jamais touche.
        throw new Error(validation.reason)
      }
      await deps.store.setCustomPath(trimmed)
    }

    const status = await deps.resolveStatus()
    return { claudeAvailable: status.available, claudePath: status.path }
  }
}
