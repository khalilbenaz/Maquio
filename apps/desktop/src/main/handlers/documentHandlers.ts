// Gestionnaire des canaux openDocument/saveDocument (Tache 17, decision 10
// du brief) : fonction pure d'injection, testable sans Electron ni
// systeme de fichiers reel (voir test/documentHandlers.test.ts). main.ts
// se contente de la cabler avec node:fs/promises et les dialogues natifs
// (src/main/adapters/electronDialogs.ts).
//
// Format .calque (decision 10) : openDocument et saveDocument passent
// tous les deux par parseDocument/serializeDocument -- un fichier qui ne
// passe pas la validation (JSON malforme, version incompatible, schema
// invalide) ne se retrouve jamais charge tel quel dans l'editeur, et ce
// qui est ecrit sur disque est toujours la forme normalisee (memes cles,
// meme indentation) rendue par serializeDocument.
import { DocumentVersionError, parseDocument, serializeDocument } from '@calque/core'

export type OpenDocumentResult = { path: string; json: string } | null
export type SaveDocumentInput = { path: string | null; json: string }
export type SaveDocumentResult = { path: string } | null

// Decision 4 : jamais une erreur brute du coeur (Zod, ou une exception
// generique de lecture de fichier) ne remonte telle quelle -- seul le
// message est relaye (jamais une cause), et DocumentVersionError porte
// deja la version attendue dans son message francais.
function translateDocumentError(err: unknown): Error {
  if (err instanceof DocumentVersionError) return new Error(err.message)
  if (err instanceof Error) return new Error(`Fichier .calque invalide : ${err.message}`)
  return new Error('Fichier .calque invalide ou illisible')
}

export function createDocumentHandler(deps: {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, contents: string) => Promise<void>
  chooseOpenPath: () => Promise<string | null>
  chooseSavePath: () => Promise<string | null>
}): {
  openDocument: () => Promise<OpenDocumentResult>
  saveDocument: (input: SaveDocumentInput) => Promise<SaveDocumentResult>
} {
  return {
    async openDocument() {
      const path = await deps.chooseOpenPath()
      if (path === null) return null

      const raw = await deps.readFile(path)
      try {
        // Valide seulement : le renderer refera sa propre lecture via
        // parseDocument (il ne peut pas importer @calque/core... si, il
        // le peut -- seuls @calque/figma/@calque/codegen/@calque/ai lui
        // sont interdits). On rend le contenu brut valide tel quel.
        parseDocument(raw)
      } catch (err) {
        throw translateDocumentError(err)
      }
      return { path, json: raw }
    },

    async saveDocument(input) {
      let normalized: string
      try {
        normalized = serializeDocument(parseDocument(input.json))
      } catch (err) {
        throw translateDocumentError(err)
      }

      const path = input.path ?? (await deps.chooseSavePath())
      if (path === null) return null

      await deps.writeFile(path, normalized)
      return { path }
    },
  }
}
