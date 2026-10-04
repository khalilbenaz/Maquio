// Decouverte du binaire `claude` en application empaquetee.
//
// Une application lancee depuis le Finder, le Dock ou le menu Demarrer
// n'herite PAS du PATH du shell de l'utilisateur (sur macOS : /usr/bin:/bin:
// /usr/sbin:/sbin). Ordre de resolution (les deux premiers rangs sont
// composes dans main.ts : chemin des reglages, puis MAQUIO_CLAUDE_PATH) :
//   3. PATH du shell de connexion, obtenu UNE fois, de facon asynchrone, avec
//      un delai de 3 s. On demande le chemin du BINAIRE, jamais un alias
//      (`whence -p` en zsh, `type -P` en bash) ;
//   4. emplacements connus (~/.local/bin, ~/.claude/local, Homebrew,
//      npm-global, prefixe npm, versions de node de fnm / nvm / volta / asdf ;
//      %APPDATA%\npm et consorts sous Windows).
// Chaque candidat est essaye avec `--version` avant d'etre adopte.
//
// Tout ce qui touche au systeme (fs, sous-processus, env) est injecte : voir
// test/claudeDiscovery.test.ts, sans systeme de fichiers ni shell reels.
import path from 'node:path'

export type DiscoveryDeps = {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  homedir: string
  /** Lance un programme (sans shell) et rend son stdout, ou null si echec ou delai depasse. */
  run: (cmd: string, args: string[], timeoutMs: number) => Promise<string | null>
  /** Liste un dossier ; [] s'il n'existe pas. */
  readdir: (dir: string) => Promise<string[]>
  /** Vrai si le chemin est un fichier executable. */
  isExecutableFile: (file: string) => Promise<boolean>
  /** Recherche dans le PATH du processus courant. */
  searchProcessPath: (binary: string) => Promise<string | null>
}

export const SHELL_TIMEOUT_MS = 3000
export const VERSION_TIMEOUT_MS = 5000

const join = (platform: NodeJS.Platform, ...parts: string[]): string =>
  (platform === 'win32' ? path.win32 : path.posix).join(...parts)

/** Commande qui rend le chemin du binaire (pas un alias) dans le shell de connexion. */
export function loginShellCommand(shell: string): { cmd: string; args: string[] } {
  const base = shell.split('/').pop() ?? shell
  const query =
    base === 'zsh' ? 'whence -p claude' : base === 'bash' ? 'type -P claude' : base === 'fish' ? 'command -s claude' : 'command -v claude'
  return { cmd: shell, args: ['-ilc', query] }
}

/** Extrait un chemin absolu d'une sortie de shell (le bruit des fichiers rc est ignore). */
export function parseShellOutput(out: string): string | null {
  const lignes = out.split(/\r?\n/).map((l) => l.trim())
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i] ?? ''
    if (l.startsWith('/')) return l
  }
  return null
}

async function versionDirs(deps: DiscoveryDeps, root: string, suffix: string[]): Promise<string[]> {
  const noms = (await deps.readdir(root)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return noms.map((n) => join(deps.platform, root, n, ...suffix))
}

/** Dossiers connus ou `claude` peut se trouver, par ordre de priorite. */
export async function knownDirs(deps: DiscoveryDeps): Promise<string[]> {
  const { platform, env, homedir: h } = deps
  const dirs: string[] = []
  if (platform === 'win32') {
    const appData = env['APPDATA'] ?? join(platform, h, 'AppData', 'Roaming')
    const local = env['LOCALAPPDATA'] ?? join(platform, h, 'AppData', 'Local')
    dirs.push(join(platform, h, '.local', 'bin'), join(platform, appData, 'npm'), join(platform, local, 'Programs', 'claude'), join(platform, local, 'Programs'))
    dirs.push(join(platform, local, 'Microsoft', 'WinGet', 'Links'), join(platform, h, '.claude', 'local'), join(platform, h, '.volta', 'bin'))
    dirs.push(...(await versionDirs(deps, join(platform, h, 'AppData', 'Roaming', 'nvm'), [])))
    return dirs
  }
  dirs.push(join(platform, h, '.local', 'bin'), join(platform, h, '.claude', 'local'))
  dirs.push('/opt/homebrew/bin', '/usr/local/bin', join(platform, h, '.npm-global', 'bin'))
  const prefixe = env['NPM_CONFIG_PREFIX'] ?? (await deps.run('npm', ['config', 'get', 'prefix'], SHELL_TIMEOUT_MS))?.trim()
  if (prefixe && prefixe.startsWith('/')) dirs.push(join(platform, prefixe, 'bin'))
  dirs.push(join(platform, h, '.volta', 'bin'), join(platform, h, '.asdf', 'shims'))
  dirs.push(...(await versionDirs(deps, join(platform, h, '.local', 'share', 'fnm', 'node-versions'), ['installation', 'bin'])))
  dirs.push(...(await versionDirs(deps, join(platform, h, 'Library', 'Application Support', 'fnm', 'node-versions'), ['installation', 'bin'])))
  dirs.push(...(await versionDirs(deps, join(platform, h, '.fnm', 'node-versions'), ['installation', 'bin'])))
  dirs.push(...(await versionDirs(deps, join(platform, h, '.nvm', 'versions', 'node'), ['bin'])))
  dirs.push(...(await versionDirs(deps, join(platform, h, '.asdf', 'installs', 'nodejs'), ['bin'])))
  return dirs
}

/** Essaie `<chemin> --version` : vrai si le binaire repond. */
export async function respondsToVersion(file: string, deps: Pick<DiscoveryDeps, 'run'>): Promise<boolean> {
  const sortie = await deps.run(file, ['--version'], VERSION_TIMEOUT_MS)
  return sortie !== null
}

/** Cherche le binaire par les rangs 3 et 4 ; null si introuvable. */
export async function discoverClaude(deps: DiscoveryDeps): Promise<string | null> {
  const essaye = async (p: string | null): Promise<string | null> =>
    p !== null && (await deps.isExecutableFile(p)) && (await respondsToVersion(p, deps)) ? p : null

  const direct = await essaye(await deps.searchProcessPath('claude'))
  if (direct) return direct

  if (deps.platform === 'win32') {
    const sortie = await deps.run('where.exe', ['claude'], SHELL_TIMEOUT_MS)
    const lignes = (sortie ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
    lignes.sort((a, b) => Number(/\.exe$/i.test(b)) - Number(/\.exe$/i.test(a)))
    for (const l of lignes) {
      const ok = await essaye(l)
      if (ok) return ok
    }
  } else {
    const shell = deps.env['SHELL'] ?? '/bin/zsh'
    const { cmd, args } = loginShellCommand(shell)
    const trouve = await essaye(parseShellOutput((await deps.run(cmd, args, SHELL_TIMEOUT_MS)) ?? ''))
    if (trouve) return trouve
  }

  const noms = deps.platform === 'win32' ? ['claude.exe', 'claude.cmd'] : ['claude']
  for (const dir of await knownDirs(deps)) {
    for (const nom of noms) {
      const ok = await essaye(join(deps.platform, dir, nom))
      if (ok) return ok
    }
  }
  return null
}

/**
 * Decouverte memorisee : lancee une fois (prechauffage au demarrage), partagee
 * par tous les appelants ; `refresh()` l'oublie et la relance (bouton
 * « Reessayer la detection »).
 */
export function createClaudeDiscovery(deps: DiscoveryDeps) {
  let promesse: Promise<string | null> | null = null
  const lancer = (): Promise<string | null> => (promesse ??= discoverClaude(deps).catch(() => null))
  return {
    resolve: lancer,
    refresh(): Promise<string | null> {
      promesse = null
      return lancer()
    },
  }
}
