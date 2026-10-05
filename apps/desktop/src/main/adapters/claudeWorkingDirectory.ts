// Adaptateur reel du repertoire de travail neutre (Defaut A, reparation du
// pont) : cree un dossier TEMPORAIRE VIDE sous le dossier temporaire du
// systeme, jamais dans le dossier de l'utilisateur ni dans celui du
// document ouvert, et le nettoie apres l'appel (voir cleanup ci-dessous,
// appelee systematiquement par ProcessClaudeRunner.run -- packages/ai/src/
// runner.ts -- dans son `finally`, succes comme echec).
//
// Une fabrique PAR APPEL (jamais un dossier partage entre deux demandes) :
// aucun etat (session, cache) ne doit survivre d'une demande a l'autre, et
// un dossier different a chaque appel evite qu'un nettoyage en retard d'un
// appel precedent (ex. apres une annulation) n'interfere avec le suivant.
//
// `node:fs/promises`/`node:os` importes ICI seulement -- jamais dans
// packages/ai (voir runner.ts, qui recoit cette fabrique par injection,
// exactement comme spawn/which).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { WorkingDirectory, WorkingDirectoryProvider } from '@maquio/ai'

export const createNeutralClaudeWorkingDirectory: WorkingDirectoryProvider = async (): Promise<WorkingDirectory> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'maquio-claude-'))
  return {
    path: dir,
    cleanup: async () => {
      // maxRetries : sous Windows, un processus enfant de `claude` qui se
      // termine a peine peut encore tenir le dossier (EBUSY) ; rm reessaie
      // alors avec un delai croissant.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}
