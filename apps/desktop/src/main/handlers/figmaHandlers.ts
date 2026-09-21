// Gestionnaires des canaux importFigma/getSettings/setFigmaToken (Tache
// 17) : fonctions pures d'injection, testables sans Electron ni reseau
// (voir test/figmaHandlers.test.ts). main.ts se contente de les cabler
// avec FigmaClient (nodeFetch.ts), le dialogue natif de choix de fichier
// (electronDialogs.ts) et le stockage chiffre du jeton (secretStore.ts).
import { serializeDocument } from '@calque/core'
import {
  FigmaAuthError,
  FigmaClient,
  FigmaHttpError,
  FigmaNetworkError,
  FigmaNotFoundError,
  FigmaResponseError,
  figmaToDocument,
  parseFigmaFileKey,
} from '@calque/figma'
import type { FigmaFileResponse, ImportReport } from '@calque/figma'
import type { SecretStore } from '../adapters/secretStore'
import { SecretStorageUnavailableError } from '../adapters/secretStore'
import { translateUnknownError } from '../../shared/errors'

export type FigmaImportInput = { source: 'api'; fileKey: string } | { source: 'file' }
export type FigmaImportResult = { json: string; report: ImportReport } | null

// Decision 3/6 du brief : tenter un import par API sans jeton enregistre
// est un probleme distinct d'un jeton refuse par Figma (FigmaAuthError) --
// nomme separement pour que l'interface puisse orienter l'utilisateur
// vers les reglages sans meme avoir tente de contacter Figma (aucun
// import partiel, aucune requete envoyee).
export class FigmaTokenMissingError extends Error {
  constructor() {
    super("Aucun jeton Figma enregistré : ajoutez-en un dans les réglages avant d'importer depuis l'API")
    this.name = 'FigmaTokenMissingError'
  }
}

// Erreur nommee pour un fichier Figma local invalide (JSON illisible ou
// champ "document" absent) -- round de correction 1 (Minor) : distincte
// d'une erreur generique pour que translateFigmaError la relaie telle
// quelle, sans repasser par le prefixe "Import Figma impossible :", ce qui
// produisait un double prefixe ("Import Figma impossible : Fichier Figma
// invalide : ...").
export class FigmaFileInvalidError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FigmaFileInvalidError'
  }
}

// Decision 4 : chaque erreur nommee du paquet @calque/figma (ou de ce
// fichier) porte deja un message francais actionnable et ne contient
// jamais le jeton (voir packages/figma/src/client.ts) -- on le relaie tel
// quel, jamais la cause d'origine. Tout le reste (y compris un dump
// ZodError, qui ne devrait normalement pas se produire ici mais reste
// possible si figmaToDocument evoluait) passe par la traduction generique
// partagee (round de correction 1 : Critical, voir src/shared/errors.ts).
function translateFigmaError(err: unknown): Error {
  if (
    err instanceof FigmaAuthError ||
    err instanceof FigmaNotFoundError ||
    err instanceof FigmaHttpError ||
    err instanceof FigmaResponseError ||
    err instanceof FigmaNetworkError ||
    err instanceof FigmaTokenMissingError ||
    err instanceof FigmaFileInvalidError
  ) {
    return new Error(err.message)
  }
  return translateUnknownError(err, 'Import Figma impossible')
}

function parseFigmaJsonFile(raw: string): FigmaFileResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new FigmaFileInvalidError('Fichier Figma invalide : JSON illisible')
  }
  if (typeof parsed !== 'object' || parsed === null || !('document' in parsed)) {
    throw new FigmaFileInvalidError('Fichier Figma invalide : champ "document" manquant')
  }
  return parsed as FigmaFileResponse
}

export function createFigmaHandler(deps: {
  // null quand aucun jeton n'est enregistre (voir main.ts, qui reconstruit
  // le client a chaque appel a partir du jeton courant du secretStore).
  client: FigmaClient | null
  chooseFile: () => Promise<string | null>
  readFile: (path: string) => Promise<string>
}) {
  return async (input: FigmaImportInput): Promise<FigmaImportResult> => {
    let file: FigmaFileResponse

    if (input.source === 'api') {
      if (deps.client === null) {
        // Nomme, sans avoir rien tente (decision 6 : "sans import partiel").
        throw new FigmaTokenMissingError()
      }
      try {
        file = await deps.client.getFile(parseFigmaFileKey(input.fileKey))
      } catch (err) {
        throw translateFigmaError(err)
      }
    } else {
      const path = await deps.chooseFile()
      if (path === null) return null
      try {
        const raw = await deps.readFile(path)
        file = parseFigmaJsonFile(raw)
      } catch (err) {
        throw translateFigmaError(err)
      }
    }

    try {
      const { document, report } = figmaToDocument(file)
      return { json: serializeDocument(document), report }
    } catch (err) {
      // Decision 6 : tout ou rien -- une traduction qui echoue ne rend
      // rien, ce gestionnaire ne connait meme pas le document courant du
      // renderer, qui reste donc necessairement intact.
      throw translateFigmaError(err)
    }
  }
}

export function createGetSettingsHandler(deps: { secretStore: Pick<SecretStore, 'hasToken'> }) {
  // Decision 3 : ne rend jamais le jeton lui-meme, seulement sa presence.
  return async (): Promise<{ hasFigmaToken: boolean }> => ({ hasFigmaToken: await deps.secretStore.hasToken() })
}

export function createSetFigmaTokenHandler(deps: { secretStore: Pick<SecretStore, 'setToken'> }) {
  return async (token: string): Promise<void> => {
    try {
      await deps.secretStore.setToken(token)
    } catch (err) {
      if (err instanceof SecretStorageUnavailableError) throw new Error(err.message)
      throw new Error("Impossible d'enregistrer le jeton Figma")
    }
  }
}
