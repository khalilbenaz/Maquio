// Detection de Claude Code avec chemin personnalise (extension au brief
// initial : la connexion a Claude Code se regle desormais dans les
// reglages, au meme titre que le jeton Figma). `validateClaudeBinaryPath`
// et `createClaudeWhich` sont des fonctions pures d'injection (fs et which
// de secours recus en parametre), testables sans systeme de fichiers reel
// ni PATH reel -- l'adaptateur reel (node:fs/promises) est cable dans
// main.ts, comme secretStore.ts.
import { describe, expect, it, vi } from 'vitest'
import { createClaudeWhich, validateClaudeBinaryPath } from '../src/main/adapters/claudeDetection'

describe('validateClaudeBinaryPath', () => {
  it('refuse un fichier inexistant avec sa raison', async () => {
    const fs = { stat: vi.fn(async () => Promise.reject(new Error('ENOENT'))), isExecutable: vi.fn() }
    const resultat = await validateClaudeBinaryPath('/chemin/absent', fs)
    expect(resultat.ok).toBe(false)
    if (resultat.ok) throw new Error('devrait etre refuse')
    expect(resultat.reason).toContain('introuvable')
    expect(fs.isExecutable).not.toHaveBeenCalled()
  })

  it('refuse un dossier', async () => {
    const fs = { stat: vi.fn(async () => ({ isDirectory: () => true })), isExecutable: vi.fn() }
    const resultat = await validateClaudeBinaryPath('/un/dossier', fs)
    expect(resultat.ok).toBe(false)
    if (resultat.ok) throw new Error('devrait etre refuse')
    expect(resultat.reason).toContain('dossier')
    expect(fs.isExecutable).not.toHaveBeenCalled()
  })

  it('refuse un fichier non executable', async () => {
    const fs = { stat: vi.fn(async () => ({ isDirectory: () => false })), isExecutable: vi.fn(async () => false) }
    const resultat = await validateClaudeBinaryPath('/bin/pas-executable', fs)
    expect(resultat.ok).toBe(false)
    if (resultat.ok) throw new Error('devrait etre refuse')
    expect(resultat.reason).toContain('executable')
  })

  it('accepte un fichier executable', async () => {
    const fs = { stat: vi.fn(async () => ({ isDirectory: () => false })), isExecutable: vi.fn(async () => true) }
    const resultat = await validateClaudeBinaryPath('/usr/local/bin/claude', fs)
    expect(resultat).toEqual({ ok: true })
  })
})

describe('createClaudeWhich', () => {
  it('utilise le chemin personnalise quand il est valide, sans chercher dans le PATH', async () => {
    const fallback = vi.fn(async () => '/usr/bin/claude')
    const which = createClaudeWhich({
      getCustomPath: async () => '/custom/claude',
      fallback,
      validate: async () => ({ ok: true }),
    })
    expect(await which('claude')).toBe('/custom/claude')
    expect(fallback).not.toHaveBeenCalled()
  })

  it('retombe sur la recherche dans le PATH quand aucun chemin personnalise n est renseigne', async () => {
    const fallback = vi.fn(async () => '/usr/bin/claude')
    const which = createClaudeWhich({ getCustomPath: async () => null, fallback, validate: async () => ({ ok: true }) })
    expect(await which('claude')).toBe('/usr/bin/claude')
    expect(fallback).toHaveBeenCalledWith('claude')
  })

  it('retombe sur la recherche dans le PATH quand le chemin personnalise n est plus valide', async () => {
    const fallback = vi.fn(async () => '/usr/bin/claude')
    const which = createClaudeWhich({
      getCustomPath: async () => '/custom/claude-supprime',
      fallback,
      validate: async () => ({ ok: false, reason: 'introuvable' }),
    })
    expect(await which('claude')).toBe('/usr/bin/claude')
    expect(fallback).toHaveBeenCalledWith('claude')
  })

  it('rend null quand ni le chemin personnalise ni la recherche de secours n aboutissent', async () => {
    const fallback = vi.fn(async () => null)
    const which = createClaudeWhich({ getCustomPath: async () => null, fallback, validate: async () => ({ ok: true }) })
    expect(await which('claude')).toBeNull()
  })
})
