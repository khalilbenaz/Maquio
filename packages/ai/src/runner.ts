// Lanceur Claude Code (Tache 13, delai/annulation/repertoire de travail
// ajoutes lors de la reparation du pont).
//
// `spawn` et `which` sont injectes, jamais importes depuis
// `node:child_process` : l'adaptateur reel (vrai sous-processus, kill() sur
// abandon, lecture du PATH) vit dans l'application de bureau (Tache 17).
// C'est ce qui rend ce fichier testable sans le binaire `claude`, sans
// sous-processus reel et sans reseau.
//
// `workingDirectory` (reparation du pont) suit la meme discipline : une
// fabrique injectee, jamais `node:fs`/`node:os` importes ici. Le diagnostic
// en conditions reelles a prouve qu'un `claude -p` lance SANS repertoire de
// travail explicite herite du cwd d'Electron -- dans un dossier de projet,
// il part l'explorer (hooks, memoire, contexte de session) au lieu de
// repondre, ce qui le fait ne jamais rendre la main. C'est
// `apps/desktop` qui fournit un repertoire temporaire vide, cree et nettoye
// pour chaque appel (jamais le dossier de l'utilisateur ni celui du
// document) : ce fichier reste agnostique de la facon dont ce repertoire
// est obtenu, exactement comme pour `spawn` et `which`.
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
  // stdin : texte ecrit sur l'entree standard du processus, puis fermee.
  opts: { signal?: AbortSignal; cwd?: string; stdin?: string },
) => { stdout: AsyncIterable<string>; stderr: AsyncIterable<string>; exitCode: Promise<number> }

// Repertoire de travail neutre pour un seul appel : `path` est passe comme
// `cwd` du sous-processus, `cleanup` est appelee systematiquement apres
// l'appel (succes, echec, annulation ou delai depasse -- voir le `finally`
// de run()). Une fabrique par appel (pas un repertoire partage entre appels)
// : elle est appelee une fois par `run()`, jamais mise en cache ici, pour
// qu'aucun etat (session, cache) ne survive d'une demande a l'autre.
export type WorkingDirectory = { path: string; cleanup(): Promise<void> }
export type WorkingDirectoryProvider = () => Promise<WorkingDirectory>

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

// Delai par defaut d'un appel a `claude -p` : 2 minutes. Choix tranche lors
// de la reparation du pont, a partir de deux mesures reelles (meme prompt,
// meme machine) : termine en 13 secondes depuis un repertoire neutre,
// jamais termine apres 10 minutes depuis un repertoire de projet (le
// defaut A corrige par `workingDirectory` ci-dessus). Une fois ce defaut
// corrige, une reponse saine prend quelques secondes a quelques dizaines de
// secondes (patch multi-noeuds compris) : 2 minutes laisse une marge large
// au-dessus de ce regime sain, sans laisser l'utilisateur devant un panneau
// "en attente" indefiniment si Claude Code part malgre tout explorer
// quelque chose d'inattendu.
// 10 minutes : une application complete (plusieurs ecrans et leurs
// interactions) depasse 2 minutes de generation (151 s mesurees).
export const DEFAULT_CLAUDE_TIMEOUT_MS = 600_000

export class ClaudeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Claude Code n'a pas répondu dans le délai imparti (${Math.round(timeoutMs / 1000)}s) : la demande a été interrompue`,
    )
    this.name = 'ClaudeTimeoutError'
  }
}

export class ClaudeCancelledError extends Error {
  constructor() {
    super("Demande interrompue par l'utilisateur")
    this.name = 'ClaudeCancelledError'
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
  private readonly workingDirectory: WorkingDirectoryProvider | undefined
  private readonly timeoutMs: number

  constructor(opts: {
    spawn: SpawnLike
    which: (bin: string) => Promise<string | null>
    binary?: string
    // Absent = comportement inchange (le sous-processus herite du cwd du
    // processus courant) : packages/ai reste agnostique, c'est
    // apps/desktop qui doit fournir cette fabrique pour que le defaut A
    // soit reellement corrige en production (voir main.ts).
    workingDirectory?: WorkingDirectoryProvider
    timeoutMs?: number
  }) {
    this.spawn = opts.spawn
    this.which = opts.which
    this.binary = opts.binary ?? 'claude'
    this.workingDirectory = opts.workingDirectory
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_CLAUDE_TIMEOUT_MS
  }

  async isAvailable(): Promise<boolean> {
    return (await this.which(this.binary)) !== null
  }

  async run(prompt: string, signal?: AbortSignal): Promise<string> {
    const bin = await this.which(this.binary)
    if (bin === null) {
      throw new ClaudeUnavailableError()
    }

    const workingDir = this.workingDirectory ? await this.workingDirectory() : null

    // Deux sources d'annulation independantes, combinees en un seul signal
    // transmis au sous-processus : le delai interne (`timeoutController`,
    // declenche par `setTimeout`) et le signal externe eventuel de
    // l'appelant (le bouton "Annuler" du panneau, relaye jusqu'ici via
    // AiService.ask -- voir service.ts). `timedOut` distingue les deux a
    // la reception d'une annulation, pour lever l'erreur qui correspond
    // reellement a ce qui s'est passe plutot qu'un message generique.
    let timedOut = false
    const timeoutController = new AbortController()
    const timer = setTimeout(() => {
      timedOut = true
      timeoutController.abort()
    }, this.timeoutMs)

    const combinedSignal = AbortSignal.any(signal ? [signal, timeoutController.signal] : [timeoutController.signal])

    try {
      // Le prompt passe par l'entree standard, jamais en argument : il
      // embarque tout le document, et une ligne de commande Windows est
      // limitee a ~32 000 caracteres (spawn ENAMETOOLONG).
      const proc = this.spawn(bin, [
          '-p',
          '--output-format',
          'json',
          // Aucun outil : le prompt embarque le contenu du document (texte
          // importe de Figma compris), non fiable. Sans outil, une injection
          // ne peut ni lancer de commande, ni lire/ecrire un fichier, ni
          // appeler le reseau ; seule la sortie JSON, validee par schema,
          // compte. dontAsk refuse tout ce qui demanderait une approbation.
          '--tools',
          '',
          '--permission-mode',
          'dontAsk',
          // Sans --mcp-config : aucun serveur MCP de la configuration de
          // l'utilisateur n'est demarre. Inutiles sans outil, ces processus
          // enfants gardaient sous Windows le dossier de travail ouvert
          // apres la fin de `claude` (EBUSY au nettoyage).
          '--strict-mcp-config',
        ], {
        signal: combinedSignal,
        stdin: prompt,
        ...(workingDir ? { cwd: workingDir.path } : {}),
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        readAll(proc.stdout),
        readAll(proc.stderr),
        proc.exitCode,
      ])

      if (exitCode !== 0) {
        throw new ClaudeFailedError(exitCode, sanitizeForErrorMessage(stderr, prompt))
      }

      return extractResult(stdout, prompt)
    } catch (err) {
      // ClaudeFailedError/ClaudeOutputError sont des rejets DELIBERES
      // construits ci-dessus (ou dans extractResult) : ils portent deja le
      // bon message, on ne les reinterprete jamais comme une annulation.
      if (err instanceof ClaudeFailedError || err instanceof ClaudeOutputError) {
        throw err
      }
      if (timedOut) {
        throw new ClaudeTimeoutError(this.timeoutMs)
      }
      if (signal?.aborted) {
        throw new ClaudeCancelledError()
      }
      throw err
    } finally {
      clearTimeout(timer)
      if (workingDir) {
        // Nettoyage au mieux : un dossier temporaire qui resiste (EBUSY sous
        // Windows) ne doit jamais remplacer la reponse ou l'erreur reelle
        // de l'appel. Le systeme videra son dossier temporaire plus tard.
        try {
          await workingDir.cleanup()
        } catch {
          // ignore
        }
      }
    }
  }
}
