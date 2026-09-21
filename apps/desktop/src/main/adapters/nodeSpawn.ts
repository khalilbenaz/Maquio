// Adaptateur reel de sous-processus (Tache 17, decision 2 du brief) :
// enveloppe node:child_process dans SpawnLike (@calque/ai), pour que
// ProcessClaudeRunner puisse reellement lancer le binaire `claude` sans
// que le paquet @calque/ai n'importe jamais node:child_process lui-meme
// (voir packages/ai/src/runner.ts).
import { spawn } from 'node:child_process'
import type { SpawnLike } from '@calque/ai'

export const nodeSpawn: SpawnLike = (cmd, args, opts) => {
  // Defaut A (reparation du pont) : `opts.cwd`, quand fourni, est
  // desormais transmis tel quel au vrai `spawn` -- c'est ce qui fait que le
  // sous-processus `claude` s'execute dans le repertoire de travail neutre
  // fourni par ProcessClaudeRunner (voir claudeWorkingDirectory.ts) plutot
  // que d'heriter du cwd d'Electron (celui du dossier de projet ouvert,
  // qui faisait partir Claude Code explorer hooks/memoire/contexte de
  // session au lieu de repondre -- voir le rapport de diagnostic).
  //
  // L'objet d'options reste un LITTERAL passe directement a spawn() (pas
  // une variable typee `SpawnOptions` construite a part) : c'est ce qui
  // preserve la surcharge de typage de node:child_process qui rend
  // `child.stdout`/`child.stderr` non-nullables quand `stdio` n'est pas
  // fourni (ChildProcessWithoutNullStreams) -- une variable explicitement
  // typee `SpawnOptions` la perdrait et forcerait `child.stdout` a
  // `Readable | null`.
  const child = spawn(cmd, args, {
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  })

  const toLines = (stream: NodeJS.ReadableStream): AsyncIterable<string> => {
    return (async function* () {
      for await (const chunk of stream) {
        yield chunk.toString()
      }
    })()
  }

  const exitCode = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })

  return { stdout: toLines(child.stdout), stderr: toLines(child.stderr), exitCode }
}
