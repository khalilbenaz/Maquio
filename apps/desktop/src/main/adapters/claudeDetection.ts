// Detection du binaire Claude Code avec chemin personnalise : la connexion
// a Claude Code se regle desormais dans les reglages, au meme titre que le
// jeton Figma (les reglages precedents detectaient le binaire en silence,
// sans que l'utilisateur puisse rien y faire quand il n'etait pas dans le
// PATH de l'application -- le cas courant sur macOS, ou une application
// lancee depuis le Finder n'herite pas du PATH d'un shell de connexion).
//
// `fs` (stat/isExecutable) et `fallback`/`getCustomPath` sont injectes,
// jamais importes depuis `node:fs` ou `node:child_process` directement ici :
// c'est ce qui rend ce fichier testable sans systeme de fichiers reel ni
// PATH reel (voir test/claudeDetection.test.ts). L'adaptateur reel
// (node:fs/promises, chercherDansLePath) est cable dans main.ts.
export type ClaudePathFs = {
  stat: (path: string) => Promise<{ isDirectory(): boolean }>
  isExecutable: (path: string) => Promise<boolean>
}

export type ClaudePathValidation = { ok: true } | { ok: false; reason: string }

// Les trois raisons de refus attendues par le brief : fichier inexistant,
// dossier, ou fichier non executable -- chacune avec un message distinct,
// pour que l'utilisateur lise POURQUOI, pas juste "echec".
export async function validateClaudeBinaryPath(path: string, fs: ClaudePathFs): Promise<ClaudePathValidation> {
  let stats: { isDirectory(): boolean }
  try {
    stats = await fs.stat(path)
  } catch {
    return { ok: false, reason: `Fichier introuvable : ${path}` }
  }

  if (stats.isDirectory()) {
    return { ok: false, reason: `${path} est un dossier, pas un exécutable` }
  }

  const executable = await fs.isExecutable(path)
  if (!executable) {
    return { ok: false, reason: `${path} n'est pas exécutable` }
  }

  return { ok: true }
}

// Compose un `which` (au sens de ProcessClaudeRunner, voir
// packages/ai/src/runner.ts) qui donne la priorite a un chemin personnalise
// quand il pointe vers un executable valide, et retombe sur la recherche de
// secours (dans le PATH) sinon -- que le chemin personnalise soit absent,
// ou qu'il ne pointe plus vers un executable valide (fichier deplace ou
// supprime apres avoir ete enregistre). @maquio/ai n'a besoin de rien
// savoir de la notion de reglages : cette composition vit entierement cote
// application de bureau, c'est elle qui est injectee dans
// ProcessClaudeRunner (voir main.ts).
export function createClaudeWhich(opts: {
  getCustomPath: () => Promise<string | null>
  /** Chemin impose par la variable d'environnement MAQUIO_CLAUDE_PATH (rang 2). */
  getEnvPath?: () => string | undefined
  fallback: (binary: string) => Promise<string | null>
  validate: (path: string) => Promise<ClaudePathValidation>
}): (binary: string) => Promise<string | null> {
  return async (binary: string) => {
    const custom = await opts.getCustomPath()
    if (custom !== null) {
      const validation = await opts.validate(custom)
      if (validation.ok) return custom
    }
    const depuisEnv = opts.getEnvPath?.()
    if (depuisEnv !== undefined && depuisEnv.trim() !== '') {
      const validation = await opts.validate(depuisEnv.trim())
      if (validation.ok) return depuisEnv.trim()
    }
    return opts.fallback(binary)
  }
}
