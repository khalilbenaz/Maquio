// Lanceur Claude Code (Tache 13).
//
// `spawn` et `which` sont injectes, jamais importes depuis
// `node:child_process` : l'adaptateur reel (vrai sous-processus, kill() sur
// abandon, lecture du PATH) vit dans l'application de bureau (Tache 17).
// C'est ce qui rend ce fichier testable sans le binaire `claude`, sans
// sous-processus reel et sans reseau.
//
// Discipline du prompt (decision 8, meme principe que le jeton dans
// packages/figma/src/client.ts) : le prompt peut contenir des donnees de
// l'utilisateur (contenu du document, instruction libre) et ne doit JAMAIS
// se retrouver dans un message d'erreur, une propriete, une trace de pile
// ou une cause. Les erreurs ci-dessous ne l'interpolent donc jamais : seules
// la sortie d'erreur du processus (stderr, qui ne contient pas le prompt)
// et la sortie brute tronquee de Claude Code y figurent.

export type SpawnLike = (
  cmd: string,
  args: string[],
  opts: { signal?: AbortSignal },
) => { stdout: AsyncIterable<string>; stderr: AsyncIterable<string>; exitCode: Promise<number> }

export interface ClaudeRunner {
  isAvailable(): Promise<boolean>
  run(prompt: string, signal?: AbortSignal): Promise<string>
}

export class ClaudeUnavailableError extends Error {
  constructor() {
    super("Claude Code est introuvable : verifiez que le binaire 'claude' est installe et accessible dans le PATH")
    this.name = 'ClaudeUnavailableError'
  }
}

export class ClaudeFailedError extends Error {
  constructor(exitCode: number, stderr: string) {
    super(`Claude Code a echoue (code de sortie ${exitCode}) : ${stderr.trim()}`)
    this.name = 'ClaudeFailedError'
  }
}

// Le processus a reussi (code 0) mais sa sortie n'est ni du JSON valide, ni
// un objet portant un champ "result" de type chaine : cas non couvert par
// le cahier des charges (decision 7), distinct d'un code de sortie non nul.
export class ClaudeOutputError extends Error {
  constructor(rawOutput: string) {
    super(`Sortie de Claude Code inexploitable (JSON invalide ou champ "result" absent) : ${truncate(rawOutput)}`)
    this.name = 'ClaudeOutputError'
  }
}

function truncate(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) {
    out += chunk
  }
  return out
}

function extractResult(rawOutput: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch {
    throw new ClaudeOutputError(rawOutput)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ClaudeOutputError(rawOutput)
  }
  const result = (parsed as Record<string, unknown>).result
  if (typeof result !== 'string') {
    throw new ClaudeOutputError(rawOutput)
  }
  return result
}

export class ProcessClaudeRunner implements ClaudeRunner {
  private readonly spawn: SpawnLike
  private readonly which: (bin: string) => Promise<string | null>
  private readonly binary: string

  constructor(opts: { spawn: SpawnLike; which: (bin: string) => Promise<string | null>; binary?: string }) {
    this.spawn = opts.spawn
    this.which = opts.which
    this.binary = opts.binary ?? 'claude'
  }

  async isAvailable(): Promise<boolean> {
    return (await this.which(this.binary)) !== null
  }

  async run(prompt: string, signal?: AbortSignal): Promise<string> {
    const bin = await this.which(this.binary)
    if (bin === null) {
      throw new ClaudeUnavailableError()
    }

    const proc = this.spawn(bin, ['-p', prompt, '--output-format', 'json'], { signal })
    const [stdout, stderr, exitCode] = await Promise.all([
      readAll(proc.stdout),
      readAll(proc.stderr),
      proc.exitCode,
    ])

    if (exitCode !== 0) {
      throw new ClaudeFailedError(exitCode, stderr)
    }

    return extractResult(stdout)
  }
}
