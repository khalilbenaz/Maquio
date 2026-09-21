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
// ou une cause. Les constructeurs d'erreur ci-dessous ne recoivent jamais le
// prompt - mais ca ne suffit pas (Round de correction 1) : stderr et la
// sortie brute de Claude Code peuvent, par un bug en amont (arguments trop
// longs, mauvaise analyse de la ligne de commande, sortie verbeuse d'une
// dependance), reinjecter litteralement l'argument `-p <prompt>`. run()
// retire donc systematiquement toute occurrence litterale du prompt de
// stderr/stdout AVANT de construire un message d'erreur (jamais avant de
// PARSER une sortie reussie, ce qui la corromprait).

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
    super("Claude Code est introuvable : vérifiez que le binaire 'claude' est installé et accessible dans le PATH")
    this.name = 'ClaudeUnavailableError'
  }
}

export class ClaudeFailedError extends Error {
  constructor(exitCode: number, stderr: string) {
    super(`Claude Code a échoué (code de sortie ${exitCode}) : ${stderr.trim()}`)
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

// Retire toute occurrence litterale du prompt d'un texte destine a un
// message d'erreur, puis tronque le reste a une longueur raisonnable.
// Utilisee uniquement pour CONSTRUIRE des messages d'erreur (jamais pour
// interpreter une sortie reussie) : stderr/stdout peuvent legitimement
// contenir le prompt par accident (voir la note en tete de fichier), et ce
// n'est qu'a ce moment-la, quand ce texte est sur le point de devenir un
// message d'erreur, que ca devient un risque de fuite.
function sanitizeForErrorMessage(text: string, prompt: string, max = 200): string {
  const withoutPrompt = prompt.length > 0 ? text.split(prompt).join('[prompt omis]') : text
  return truncate(withoutPrompt.trim(), max)
}

async function readAll(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) {
    out += chunk
  }
  return out
}

function extractResult(rawOutput: string, prompt: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawOutput)
  } catch {
    throw new ClaudeOutputError(sanitizeForErrorMessage(rawOutput, prompt))
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ClaudeOutputError(sanitizeForErrorMessage(rawOutput, prompt))
  }
  const result = (parsed as Record<string, unknown>).result
  if (typeof result !== 'string') {
    throw new ClaudeOutputError(sanitizeForErrorMessage(rawOutput, prompt))
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
      throw new ClaudeFailedError(exitCode, sanitizeForErrorMessage(stderr, prompt))
    }

    return extractResult(stdout, prompt)
  }
}
