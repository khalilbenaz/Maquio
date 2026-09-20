import { describe, expect, it, vi } from 'vitest'
import { ProcessClaudeRunner, ClaudeUnavailableError, ClaudeFailedError, ClaudeOutputError } from '../src/runner'
import type { SpawnLike } from '../src/runner'

const flux = (s: string) => (async function* () { yield s })()
const fauxSpawn = (sortie: string, code = 0) =>
  vi.fn(() => ({ stdout: flux(sortie), stderr: flux(''), exitCode: Promise.resolve(code) }))

describe('ProcessClaudeRunner', () => {
  it('appelle claude en mode print avec sortie json', async () => {
    const spawn = fauxSpawn(JSON.stringify({ result: '{"summary":"ok","ops":[]}' }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/usr/local/bin/claude' })
    await r.run('salut')
    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/claude',
      ['-p', 'salut', '--output-format', 'json'],
      expect.anything(),
    )
  })

  it('rend le champ result de la sortie json', async () => {
    const spawn = fauxSpawn(JSON.stringify({ result: 'la reponse' }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    expect(await r.run('x')).toBe('la reponse')
  })

  it('signale l indisponibilite quand le binaire est absent', async () => {
    const r = new ProcessClaudeRunner({ spawn: fauxSpawn(''), which: async () => null })
    expect(await r.isAvailable()).toBe(false)
    await expect(r.run('x')).rejects.toBeInstanceOf(ClaudeUnavailableError)
  })

  it('leve avec la sortie d erreur quand le code de sortie n est pas zero', async () => {
    const spawn = vi.fn(() => ({ stdout: flux(''), stderr: flux('quota epuise'), exitCode: Promise.resolve(1) }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await expect(r.run('x')).rejects.toThrow(/quota epuise/)
  })

  // Decision 7 (au-dela du cahier des charges) : une sortie qui n est pas
  // du JSON exploitable, ou qui n a pas de champ "result", est un cas
  // distinct d un code de sortie non nul - le processus a reussi, mais sa
  // sortie ne peut pas etre interpretee.
  it('leve ClaudeOutputError quand la sortie n est pas du json', async () => {
    const spawn = fauxSpawn('ceci n est pas du json')
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await expect(r.run('x')).rejects.toBeInstanceOf(ClaudeOutputError)
  })

  it('leve ClaudeOutputError quand le json n a pas de champ result exploitable', async () => {
    const spawn = fauxSpawn(JSON.stringify({ foo: 'bar' }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await expect(r.run('x')).rejects.toBeInstanceOf(ClaudeOutputError)
  })

  // Decision 9 : le signal d annulation est transmis au spawn injecte.
  it('transmet le signal d annulation au spawn injecte', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
      received = opts.signal
      return { stdout: flux(JSON.stringify({ result: 'ok' })), stderr: flux(''), exitCode: Promise.resolve(0) }
    })
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await r.run('x', controller.signal)
    expect(received).toBe(controller.signal)
  })

  // Decision 9 : une annulation en cours d execution interrompt le
  // sous-processus - simule ici par un faux spawn dont exitCode n est
  // resolu que si le signal est declenche (comme le ferait un vrai
  // processus tue par kill() a la reception de l abandon).
  it('interrompt le sous-processus quand le signal est declenche pendant l execution', async () => {
    const controller = new AbortController()
    let spawnCalled: () => void = () => {}
    const spawnCalledPromise = new Promise<void>((resolve) => {
      spawnCalled = resolve
    })
    const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
      const exitCode = new Promise<number>((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new Error('sous-processus interrompu')))
      })
      spawnCalled()
      return { stdout: flux(''), stderr: flux(''), exitCode }
    })
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    const promise = r.run('x', controller.signal)
    await spawnCalledPromise
    controller.abort()
    await expect(promise).rejects.toThrow(/interrompu/)
  })

  // Decision 8 : le prompt peut contenir des donnees utilisateur, il ne
  // doit jamais fuiter dans une erreur, quelle que soit sa forme (message,
  // pile, propriete, cause).
  it('ne fait jamais fuiter le prompt dans ClaudeFailedError', async () => {
    const secret = 'DONNEES-UTILISATEUR-CONFIDENTIELLES'
    const spawn = vi.fn(() => ({ stdout: flux(''), stderr: flux('erreur serveur generique'), exitCode: Promise.resolve(1) }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })

    let caught: unknown
    try {
      await r.run(secret)
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(ClaudeFailedError)
    const err = caught as ClaudeFailedError
    expect(err.message).not.toContain(secret)
    expect(err.stack ?? '').not.toContain(secret)
    expect((err.cause as string | undefined) ?? '').not.toContain(secret)
    expect(JSON.stringify(err)).not.toContain(secret)
  })

  it('ne fait jamais fuiter le prompt dans ClaudeOutputError', async () => {
    const secret = 'DONNEES-UTILISATEUR-CONFIDENTIELLES'
    const spawn = fauxSpawn('sortie totalement inexploitable')
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })

    let caught: unknown
    try {
      await r.run(secret)
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(ClaudeOutputError)
    const err = caught as ClaudeOutputError
    expect(err.message).not.toContain(secret)
    expect(err.stack ?? '').not.toContain(secret)
    expect((err.cause as string | undefined) ?? '').not.toContain(secret)
    expect(JSON.stringify(err)).not.toContain(secret)
  })
})
