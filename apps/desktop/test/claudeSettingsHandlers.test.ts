// Gestionnaires des reglages Claude Code (canal getSettings enrichi +
// nouveau canal setClaudeCustomPath) : fonctions pures d'injection,
// testables sans Electron ni systeme de fichiers reel (voir
// claudeDetection.test.ts / claudeSettingsStore.test.ts pour les
// adaptateurs qu'elles combinent). main.ts se contente de les cabler avec
// createClaudeSettingsStore, validateClaudeBinaryPath et whichClaude (le
// meme `which` que celui injecte dans ProcessClaudeRunner, voir
// claudeDetection.ts) -- c'est ce qui garantit que l'etat affiche dans les
// reglages est exactement celui qui sera utilise pour lancer `claude`.
import { describe, expect, it, vi } from 'vitest'
import { createGetClaudeSettingsHandler, createSetClaudeCustomPathHandler } from '../src/main/handlers/claudeSettingsHandlers'

describe('createGetClaudeSettingsHandler', () => {
  it('combine le statut resolu (which) et le chemin personnalise enregistre', async () => {
    const handler = createGetClaudeSettingsHandler({
      store: { getCustomPath: async () => '/custom/claude' },
      resolveStatus: async () => ({ available: true, path: '/custom/claude' }),
    })
    expect(await handler()).toEqual({ claudeAvailable: true, claudePath: '/custom/claude', claudeCustomPath: '/custom/claude' })
  })

  it('rend indisponible quand which ne trouve rien, meme sans chemin personnalise', async () => {
    const handler = createGetClaudeSettingsHandler({
      store: { getCustomPath: async () => null },
      resolveStatus: async () => ({ available: false, path: null }),
    })
    expect(await handler()).toEqual({ claudeAvailable: false, claudePath: null, claudeCustomPath: null })
  })
})

describe('createSetClaudeCustomPathHandler', () => {
  it('enregistre un chemin valide et rend le nouveau statut', async () => {
    const setCustomPath = vi.fn(async () => {})
    const handler = createSetClaudeCustomPathHandler({
      store: { getCustomPath: async () => null, setCustomPath },
      validate: async () => ({ ok: true }),
      resolveStatus: async () => ({ available: true, path: '/custom/claude' }),
    })

    const resultat = await handler('/custom/claude')

    expect(setCustomPath).toHaveBeenCalledWith('/custom/claude')
    expect(resultat).toEqual({ claudeAvailable: true, claudePath: '/custom/claude' })
  })

  it('refuse un chemin inexistant avec sa raison, sans ecraser l ancien reglage', async () => {
    const setCustomPath = vi.fn(async () => {})
    const validate = vi.fn(async () => ({ ok: false as const, reason: 'Fichier introuvable : /mauvais/chemin' }))
    const handler = createSetClaudeCustomPathHandler({
      store: { getCustomPath: async () => '/ancien/claude', setCustomPath },
      validate,
      resolveStatus: async () => ({ available: true, path: '/ancien/claude' }),
    })

    await expect(handler('/mauvais/chemin')).rejects.toThrow('Fichier introuvable : /mauvais/chemin')
    expect(setCustomPath).not.toHaveBeenCalled()
  })

  it('refuse un dossier avec sa raison, sans ecraser l ancien reglage', async () => {
    const setCustomPath = vi.fn(async () => {})
    const handler = createSetClaudeCustomPathHandler({
      store: { getCustomPath: async () => '/ancien/claude', setCustomPath },
      validate: async () => ({ ok: false, reason: '/un/dossier est un dossier, pas un executable' }),
      resolveStatus: async () => ({ available: true, path: '/ancien/claude' }),
    })

    await expect(handler('/un/dossier')).rejects.toThrow('est un dossier')
    expect(setCustomPath).not.toHaveBeenCalled()
  })

  it('refuse un fichier non executable avec sa raison, sans ecraser l ancien reglage', async () => {
    const setCustomPath = vi.fn(async () => {})
    const handler = createSetClaudeCustomPathHandler({
      store: { getCustomPath: async () => '/ancien/claude', setCustomPath },
      validate: async () => ({ ok: false, reason: '/pas/executable n est pas executable' }),
      resolveStatus: async () => ({ available: true, path: '/ancien/claude' }),
    })

    await expect(handler('/pas/executable')).rejects.toThrow('executable')
    expect(setCustomPath).not.toHaveBeenCalled()
  })

  it('un chemin vide efface le reglage (retour a la recherche dans le PATH), sans validation', async () => {
    const setCustomPath = vi.fn(async () => {})
    const validate = vi.fn()
    const handler = createSetClaudeCustomPathHandler({
      store: { getCustomPath: async () => '/ancien/claude', setCustomPath },
      validate,
      resolveStatus: async () => ({ available: true, path: '/usr/bin/claude' }),
    })

    const resultat = await handler('   ')

    expect(setCustomPath).toHaveBeenCalledWith(null)
    expect(validate).not.toHaveBeenCalled()
    expect(resultat).toEqual({ claudeAvailable: true, claudePath: '/usr/bin/claude' })
  })
})
