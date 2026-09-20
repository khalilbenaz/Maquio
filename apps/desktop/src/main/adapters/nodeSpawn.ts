// Adaptateur reel de sous-processus (Tache 17, decision 2 du brief) :
// enveloppe node:child_process dans SpawnLike (@calque/ai), pour que
// ProcessClaudeRunner puisse reellement lancer le binaire `claude` sans
// que le paquet @calque/ai n'importe jamais node:child_process lui-meme
// (voir packages/ai/src/runner.ts).
import { spawn } from 'node:child_process'
import type { SpawnLike } from '@calque/ai'

export const nodeSpawn: SpawnLike = (cmd, args, opts) => {
  const child = spawn(cmd, args, opts.signal !== undefined ? { signal: opts.signal } : {})

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
