import { describe, expect, it } from 'vitest'
import { FakeClaudeRunner } from '../src/fake-runner'

describe('FakeClaudeRunner', () => {
  it('consomme une liste de reponses dans l ordre', async () => {
    const r = new FakeClaudeRunner(['un', 'deux'])
    expect(await r.run('a')).toBe('un')
    expect(await r.run('b')).toBe('deux')
  })

  it('enregistre les prompts recus, dans l ordre', async () => {
    const r = new FakeClaudeRunner(['un', 'deux'])
    await r.run('premier prompt')
    await r.run('second prompt')
    expect(r.prompts).toEqual(['premier prompt', 'second prompt'])
  })

  it('accepte une fonction (prompt) => string', async () => {
    const r = new FakeClaudeRunner((prompt) => `reponse a : ${prompt}`)
    expect(await r.run('salut')).toBe('reponse a : salut')
    expect(r.prompts).toEqual(['salut'])
  })

  it('leve une erreur claire quand la liste de reponses est epuisee, plutot que de rendre undefined', async () => {
    const r = new FakeClaudeRunner(['une seule reponse'])
    await r.run('a')
    await expect(r.run('b')).rejects.toThrow(/reponse/i)
  })

  it('est toujours disponible', async () => {
    const r = new FakeClaudeRunner(['x'])
    expect(await r.isAvailable()).toBe(true)
  })
})
