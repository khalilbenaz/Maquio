// Stockage du chemin personnalise vers le binaire Claude Code : a la
// difference du jeton Figma (secretStore.ts, chiffre via safeStorage), un
// chemin de binaire n'a rien de confidentiel -- il est persiste en JSON
// ordinaire dans le dossier de donnees utilisateur, sans chiffrement (le
// chiffrer compliquerait le depannage sans rien proteger). `fs` est injecte
// (jamais node:fs directement) : l'adaptateur reel est cable dans main.ts.
import { describe, expect, it } from 'vitest'
import { createClaudeSettingsStore } from '../src/main/adapters/claudeSettingsStore'

describe('claudeSettingsStore (chemin personnalise Claude Code)', () => {
  it('rend null quand rien n est encore enregistre', async () => {
    const store = createClaudeSettingsStore({
      filePath: '/tmp/claude-settings.json',
      fs: { readFile: async () => Promise.reject(new Error('absent')), writeFile: async () => {}, pathExists: async () => false },
    })
    expect(await store.getCustomPath()).toBeNull()
  })

  it('persiste le chemin en JSON ordinaire, en clair', async () => {
    let stocke: string | null = null
    const store = createClaudeSettingsStore({
      filePath: '/tmp/claude-settings.json',
      fs: {
        readFile: async () => {
          if (stocke === null) throw new Error('absent')
          return stocke
        },
        writeFile: async (_p, data) => {
          stocke = data
        },
        pathExists: async () => stocke !== null,
      },
    })

    await store.setCustomPath('/usr/local/bin/claude')

    // Ecrit en clair (pas de chiffrement, contrairement au jeton Figma) :
    // le chemin doit apparaitre litteralement dans ce qui est ecrit.
    expect(stocke).not.toBeNull()
    expect(stocke as unknown as string).toContain('/usr/local/bin/claude')
    expect(await store.getCustomPath()).toBe('/usr/local/bin/claude')
  })

  it('efface le chemin personnalise quand on enregistre null (retour au PATH)', async () => {
    let stocke: string | null = null
    const store = createClaudeSettingsStore({
      filePath: '/tmp/claude-settings.json',
      fs: {
        readFile: async () => {
          if (stocke === null) throw new Error('absent')
          return stocke
        },
        writeFile: async (_p, data) => {
          stocke = data
        },
        pathExists: async () => stocke !== null,
      },
    })

    await store.setCustomPath('/usr/local/bin/claude')
    await store.setCustomPath(null)

    expect(await store.getCustomPath()).toBeNull()
  })

  it('rend null si le fichier existant est illisible (JSON corrompu), sans lever', async () => {
    const store = createClaudeSettingsStore({
      filePath: '/tmp/claude-settings.json',
      fs: { readFile: async () => '{ pas du json valide', writeFile: async () => {}, pathExists: async () => true },
    })
    expect(await store.getCustomPath()).toBeNull()
  })
})
