// Decouverte du binaire claude hors PATH (app lancee depuis le Finder), avec
// un faux systeme de fichiers et de faux sous-processus : voir
// src/main/adapters/claudeDiscovery.ts.
import { describe, expect, it, vi } from 'vitest'
import {
  createClaudeDiscovery,
  discoverClaude,
  knownDirs,
  loginShellCommand,
  parseShellOutput,
} from '../src/main/adapters/claudeDiscovery'
import type { DiscoveryDeps } from '../src/main/adapters/claudeDiscovery'
import { createClaudeWhich } from '../src/main/adapters/claudeDetection'

type Faux = { fichiers: string[]; dossiers?: Record<string, string[]>; sortiesShell?: Record<string, string>; versionKo?: string[] }

function deps(f: Faux, surcharge: Partial<DiscoveryDeps> = {}): DiscoveryDeps & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (cmd: string, args: string[]) => {
    if (args[0] === '--version') return f.fichiers.includes(cmd) && !(f.versionKo ?? []).includes(cmd) ? '2.1.0 (Claude Code)\n' : null
    const cle = `${cmd} ${args.join(' ')}`
    return f.sortiesShell?.[cle] ?? null
  })
  return {
    platform: 'darwin',
    env: { SHELL: '/bin/zsh' },
    homedir: '/Users/lilou',
    run,
    readdir: async (d) => f.dossiers?.[d] ?? [],
    isExecutableFile: async (p) => f.fichiers.includes(p),
    searchProcessPath: async () => null,
    ...surcharge,
  } as DiscoveryDeps & { run: ReturnType<typeof vi.fn> }
}

describe('loginShellCommand / parseShellOutput', () => {
  it('demande le binaire, jamais l alias, selon le shell', () => {
    expect(loginShellCommand('/bin/zsh')).toEqual({ cmd: '/bin/zsh', args: ['-ilc', 'whence -p claude'] })
    expect(loginShellCommand('/bin/bash').args[1]).toBe('type -P claude')
    expect(loginShellCommand('/usr/bin/fish').args[1]).toBe('command -s claude')
  })

  it('ignore le bruit des fichiers rc et un alias', () => {
    expect(parseShellOutput('Bienvenue\nclaude: aliased to claude --foo\n/opt/homebrew/bin/claude\n')).toBe('/opt/homebrew/bin/claude')
    expect(parseShellOutput("claude: aliased to /x/claude --dangerously\n")).toBeNull()
    expect(parseShellOutput('')).toBeNull()
  })
})

describe('discoverClaude', () => {
  it('prend le chemin du shell de connexion quand il repond a --version', async () => {
    const d = deps({ fichiers: ['/opt/homebrew/bin/claude'], sortiesShell: { '/bin/zsh -ilc whence -p claude': 'bruit\n/opt/homebrew/bin/claude\n' } })
    expect(await discoverClaude(d)).toBe('/opt/homebrew/bin/claude')
  })

  it('retombe sur les emplacements connus quand le shell ne repond rien (delai)', async () => {
    const d = deps({ fichiers: ['/Users/lilou/.local/bin/claude'] })
    expect(await discoverClaude(d)).toBe('/Users/lilou/.local/bin/claude')
  })

  it('trouve un binaire dans un node de fnm, version la plus recente d abord', async () => {
    const racine = '/Users/lilou/.local/share/fnm/node-versions'
    const d = deps({
      fichiers: [`${racine}/v22.1.0/installation/bin/claude`, `${racine}/v24.3.0/installation/bin/claude`],
      dossiers: { [racine]: ['v22.1.0', 'v24.3.0'] },
    })
    expect(await discoverClaude(d)).toBe(`${racine}/v24.3.0/installation/bin/claude`)
  })

  it('trouve le binaire dans le prefixe npm', async () => {
    const d = deps({ fichiers: ['/Users/lilou/n/bin/claude'], sortiesShell: { 'npm config get prefix': '/Users/lilou/n\n' } })
    expect(await discoverClaude(d)).toBe('/Users/lilou/n/bin/claude')
  })

  it('refuse un binaire qui ne repond pas a --version', async () => {
    const d = deps({ fichiers: ['/opt/homebrew/bin/claude'], versionKo: ['/opt/homebrew/bin/claude'] })
    expect(await discoverClaude(d)).toBeNull()
  })

  it('rend null quand rien n existe', async () => {
    expect(await discoverClaude(deps({ fichiers: [] }))).toBeNull()
  })

  it('Windows : where.exe puis %APPDATA%\\npm', async () => {
    const win = (f: Faux) =>
      deps(f, { platform: 'win32', homedir: 'C:\\Users\\lilou', env: { APPDATA: 'C:\\Users\\lilou\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\lilou\\AppData\\Local' } })
    const d1 = win({ fichiers: ['C:\\x\\claude.exe'], sortiesShell: { 'where.exe claude': 'C:\\x\\claude\r\nC:\\x\\claude.exe\r\n' } })
    expect(await discoverClaude(d1)).toBe('C:\\x\\claude.exe')
    const d2 = win({ fichiers: ['C:\\Users\\lilou\\AppData\\Roaming\\npm\\claude.cmd'] })
    expect(await discoverClaude(d2)).toBe('C:\\Users\\lilou\\AppData\\Roaming\\npm\\claude.cmd')
  })
})

describe('knownDirs', () => {
  it('contient les emplacements attendus', async () => {
    const dirs = await knownDirs(deps({ fichiers: [] }))
    for (const attendu of ['/Users/lilou/.local/bin', '/Users/lilou/.claude/local', '/opt/homebrew/bin', '/usr/local/bin', '/Users/lilou/.npm-global/bin', '/Users/lilou/.volta/bin', '/Users/lilou/.asdf/shims']) {
      expect(dirs).toContain(attendu)
    }
  })
})

describe('createClaudeDiscovery', () => {
  it('ne decouvre qu une fois, et refresh relance', async () => {
    const d = deps({ fichiers: ['/opt/homebrew/bin/claude'] })
    const disc = createClaudeDiscovery(d)
    expect(await disc.resolve()).toBe('/opt/homebrew/bin/claude')
    const appels = d.run.mock.calls.length
    await disc.resolve()
    expect(d.run.mock.calls.length).toBe(appels)
    await disc.refresh()
    expect(d.run.mock.calls.length).toBeGreaterThan(appels)
  })
})

describe('createClaudeWhich : variable MAQUIO_CLAUDE_PATH', () => {
  it('passe apres le reglage, avant la decouverte', async () => {
    const fallback = vi.fn(async () => '/decouvert/claude')
    const validate = async (p: string) => (p === '/env/claude' ? { ok: true as const } : { ok: false as const, reason: 'non' })
    const sans = createClaudeWhich({ getCustomPath: async () => null, getEnvPath: () => '/env/claude', fallback, validate })
    expect(await sans('claude')).toBe('/env/claude')
    expect(fallback).not.toHaveBeenCalled()
    const invalide = createClaudeWhich({ getCustomPath: async () => null, getEnvPath: () => '/autre', fallback, validate })
    expect(await invalide('claude')).toBe('/decouvert/claude')
  })
})
