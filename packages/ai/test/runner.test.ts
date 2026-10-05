import { describe, expect, it, vi } from 'vitest'
import {
  ProcessClaudeRunner,
  ClaudeUnavailableError,
  ClaudeFailedError,
  ClaudeOutputError,
  ClaudeTimeoutError,
  ClaudeCancelledError,
  DEFAULT_CLAUDE_TIMEOUT_MS,
} from '../src/runner'
import type { SpawnLike, WorkingDirectory } from '../src/runner'

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
      ['-p', 'salut', '--output-format', 'json', '--tools', '', '--permission-mode', 'dontAsk', '--strict-mcp-config'],
      expect.anything(),
    )
  })

  // Securite (audit P1) : le document, donc le texte importe de Figma, est
  // injecte dans le prompt. Claude ne doit disposer d'aucun outil (ni Bash,
  // ni lecture/ecriture de fichier, ni reseau) : sa seule sortie est le patch.
  it('ne donne aucun outil a claude et ne lui laisse rien a approuver', async () => {
    const spawn = fauxSpawn(JSON.stringify({ result: '{}' }))
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await r.run('x')
    const args = (spawn as unknown as { mock: { calls: [string, string[]][] } }).mock.calls[0]![1]
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
    expect(args).not.toContain('bypassPermissions')
  })

  // Sans --mcp-config, --strict-mcp-config ne demarre aucun serveur MCP : ils
  // seraient inutiles (aucun outil) et, sous Windows, ces processus enfants
  // gardaient le dossier de travail ouvert (EBUSY au nettoyage).
  it('ne demarre aucun serveur MCP de la configuration de l utilisateur', async () => {
    const spawn = fauxSpawn(JSON.stringify({ result: '{}' }))
    await new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' }).run('x')
    const args = (spawn as unknown as { mock: { calls: [string, string[]][] } }).mock.calls[0]![1]
    expect(args).toContain('--strict-mcp-config')
    expect(args).not.toContain('--mcp-config')
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

  // Decision 9, adaptee lors de la reparation du pont : le signal transmis
  // au spawn injecte n'est plus le signal externe TEL QUEL (identite
  // stricte) depuis que run() le combine avec son propre delai interne
  // (AbortSignal.any, voir runner.ts) -- ce qui compte reellement, et ce
  // que ce test verifie desormais, c'est que l'annulation du signal
  // externe se propage bien jusqu'a celui recu par spawn.
  it('propage l annulation du signal externe jusqu au spawn injecte', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
      received = opts.signal
      return { stdout: flux(JSON.stringify({ result: 'ok' })), stderr: flux(''), exitCode: Promise.resolve(0) }
    })
    const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
    await r.run('x', controller.signal)
    expect(received).toBeDefined()
    expect(received!.aborted).toBe(false)
    controller.abort()
    expect(received!.aborted).toBe(true)
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

  // Round de correction 1 (Important) : le relecteur a fait fuiter le
  // prompt en le mettant DANS la sortie du faux spawn - scenario realiste
  // (arguments trop longs, mauvaise analyse de la ligne de commande, sortie
  // verbeuse d'une dependance peuvent tous reinjecter `-p <prompt>`), non
  // couvert par les deux tests precedents qui ne verifiaient que l'absence
  // de fuite PAR CONSTRUCTION (le constructeur ne recoit jamais le prompt),
  // pas l'absence de fuite via un contenu qui, lui, le contient reellement.
  it('retire le prompt de stderr avant de construire ClaudeFailedError, meme si stderr le contient litteralement', async () => {
    const secret = 'SECRET_UTILISATEUR_A_NE_PAS_VOIR'
    const spawn = vi.fn(() => ({
      stdout: flux(''),
      stderr: flux(`erreur inconnue, argument recu : ${secret}`),
      exitCode: Promise.resolve(1),
    }))
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
    expect(JSON.stringify(err)).not.toContain(secret)
    // Le reste du message (l'information utile) est preserve.
    expect(err.message).toContain('erreur inconnue')
  })

  it('retire le prompt de la sortie avant de construire ClaudeOutputError, meme si elle le contient litteralement', async () => {
    const secret = 'SECRET_UTILISATEUR_A_NE_PAS_VOIR'
    const spawn = fauxSpawn(`sortie inexploitable, echo de la commande : ${secret}`)
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
    expect(JSON.stringify(err)).not.toContain(secret)
  })

  // Defaut A (reparation du pont) : le repertoire de travail neutre est une
  // fabrique INJECTEE (comme spawn/which), jamais node:fs/node:os importes
  // ici -- ces deux tests verifient que run() la consulte, transmet bien
  // son `path` comme `cwd` du sous-processus, et appelle systematiquement
  // `cleanup()` apres l'appel, qu'il reussisse ou echoue.
  describe('repertoire de travail neutre (defaut A)', () => {
    it('lance le sous-processus dans le repertoire fourni par la fabrique et le nettoie apres un succes', async () => {
      const cleanup = vi.fn(async () => {})
      const workingDirectory = vi.fn(async (): Promise<WorkingDirectory> => ({ path: '/tmp/maquio-claude-xyz', cleanup }))
      let receivedCwd: string | undefined
      const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
        receivedCwd = opts.cwd
        return { stdout: flux(JSON.stringify({ result: 'ok' })), stderr: flux(''), exitCode: Promise.resolve(0) }
      })
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', workingDirectory })

      await r.run('x')

      expect(workingDirectory).toHaveBeenCalledTimes(1)
      expect(receivedCwd).toBe('/tmp/maquio-claude-xyz')
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('nettoie aussi le repertoire de travail quand l appel echoue', async () => {
      const cleanup = vi.fn(async () => {})
      const workingDirectory = vi.fn(async (): Promise<WorkingDirectory> => ({ path: '/tmp/maquio-claude-xyz', cleanup }))
      const spawn: SpawnLike = vi.fn(() => ({ stdout: flux(''), stderr: flux('boom'), exitCode: Promise.resolve(1) }))
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', workingDirectory })

      await expect(r.run('x')).rejects.toBeInstanceOf(ClaudeFailedError)
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('rend la reponse meme quand le nettoyage du repertoire echoue (EBUSY sous Windows)', async () => {
      const cleanup = vi.fn(async () => {
        throw Object.assign(new Error('EBUSY: resource busy or locked, rmdir'), { code: 'EBUSY' })
      })
      const workingDirectory = vi.fn(async (): Promise<WorkingDirectory> => ({ path: '/tmp/maquio-claude-xyz', cleanup }))
      const spawn = fauxSpawn(JSON.stringify({ result: 'ok' }))
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', workingDirectory })

      await expect(r.run('x')).resolves.toBe('ok')
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it('ne fournit aucun cwd au spawn quand aucune fabrique n est injectee (comportement inchange)', async () => {
      let received: { cwd?: string } | undefined
      const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
        received = opts
        return { stdout: flux(JSON.stringify({ result: 'ok' })), stderr: flux(''), exitCode: Promise.resolve(0) }
      })
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude' })
      await r.run('x')
      expect(received?.cwd).toBeUndefined()
    })
  })

  // Point 2 du brief de reparation : l'appel est plafonne (2 minutes par
  // defaut, voir DEFAULT_CLAUDE_TIMEOUT_MS dans runner.ts) et interrompu au-
  // dela, avec un message clair distinct d'une simple annulation utilisateur.
  describe('delai et annulation (point 2)', () => {
    it('expose 2 minutes comme delai par defaut', () => {
      expect(DEFAULT_CLAUDE_TIMEOUT_MS).toBe(120_000)
    })

    it('leve ClaudeTimeoutError quand claude ne repond pas dans le delai imparti', async () => {
      const spawn: SpawnLike = vi.fn((_cmd, _args, opts) => {
        const exitCode = new Promise<number>((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new Error('sous-processus interrompu')))
        })
        return { stdout: flux(''), stderr: flux(''), exitCode }
      })
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', timeoutMs: 5 })
      await expect(r.run('x')).rejects.toBeInstanceOf(ClaudeTimeoutError)
    })

    it('leve ClaudeCancelledError (pas ClaudeTimeoutError) quand c est le signal externe qui est declenche, pas le delai', async () => {
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
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', timeoutMs: 60_000 })
      const promise = r.run('x', controller.signal)
      await spawnCalledPromise
      controller.abort()
      await expect(promise).rejects.toBeInstanceOf(ClaudeCancelledError)
    })

    it('n interrompt pas un appel qui reussit avant le delai', async () => {
      const spawn = fauxSpawn(JSON.stringify({ result: 'ok' }))
      const r = new ProcessClaudeRunner({ spawn, which: async () => '/bin/claude', timeoutMs: 60_000 })
      await expect(r.run('x')).resolves.toBe('ok')
    })
  })
})
