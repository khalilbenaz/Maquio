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
import { basename, dirname, isAbsolute, join } from 'node:path'
import { DocumentVersionError, parseDocument, serializeDocument } from '@calque/core'
import type { CalqueDocument, Node as CalqueNode } from '@calque/core'
import { translateUnknownError } from '../../shared/errors'

export type OpenDocumentResult = { path: string; json: string } | null
export type SaveDocumentInput = { path: string | null; json: string }
export type SaveDocumentResult = { path: string } | null

// Ruling (défaut n3, « comment mettre l'image ? ») : une image choisie
// avant le premier enregistrement du document garde son chemin ABSOLU
// (rien à côté de quoi la copier tant que le document lui-même n'a pas
// d'emplacement). À l'enregistrement, chaque nœud image dont le src est
// encore un chemin absolu est copié à côté du document, dans un dossier
// `<nom-du-document>.ressources/`, et son `src` réécrit en chemin RELATIF
// à ce dossier (le nom de fichier seul, jamais le dossier lui-même) --
// c'est ce chemin relatif qui rend le fichier `.calque` partageable (pas
// de chemin absolu propre à une machine) sans faire gonfler le JSON d'un
// encodage base64.
function resourcesDirFor(documentPath: string): string {
  return join(dirname(documentPath), `${basename(documentPath, '.calque')}.ressources`)
}

// Parcours immuable de l'arbre (frame.children compris) qui ne touche
// QUE les nœuds image dont le src est un chemin absolu -- tout le reste
// (texte, formes, image déjà relative ou vide) traverse inchangé.
async function relocateNode(
  node: CalqueNode,
  resourcesDir: string,
  ensureDirOnce: () => Promise<void>,
  copyImageFile: (source: string, dest: string) => Promise<void>,
): Promise<CalqueNode> {
  if (node.type === 'image') {
    if (node.src === '' || !isAbsolute(node.src)) return node
    await ensureDirOnce()
    const fileName = basename(node.src)
    await copyImageFile(node.src, join(resourcesDir, fileName))
    return { ...node, src: fileName }
  }
  if (node.type === 'frame') {
    const children = await Promise.all(
      node.children.map((child) => relocateNode(child, resourcesDir, ensureDirOnce, copyImageFile)),
    )
    return { ...node, children }
  }
  return node
}

// Optionnelle (voir createDocumentHandler ci-dessous) : quand les deux
// dépendances ne sont pas fournies, rend le document tel quel -- un
// appelant qui ne les fournit pas (tests existants, documents sans nœud
// image absolu) ne les voit jamais invoquées.
async function relocateAbsoluteImageSources(
  document: CalqueDocument,
  documentPath: string,
  deps: {
    copyImageFile?: (source: string, dest: string) => Promise<void>
    ensureDir?: (dirPath: string) => Promise<void>
  },
): Promise<CalqueDocument> {
  if (!deps.copyImageFile || !deps.ensureDir) return document

  const resourcesDir = resourcesDirFor(documentPath)
  const copyImageFile = deps.copyImageFile
  const ensureDir = deps.ensureDir
  let dirEnsured: Promise<void> | null = null
  const ensureDirOnce = () => (dirEnsured ??= ensureDir(resourcesDir))

  const pages = await Promise.all(
    document.pages.map(async (page) => ({
      ...page,
      nodes: await Promise.all(page.nodes.map((n) => relocateNode(n, resourcesDir, ensureDirOnce, copyImageFile))),
    })),
  )
  return { ...document, pages }
}

// Decision 4 : jamais une erreur brute du coeur (dump ZodError, SyntaxError
// de JSON.parse) ne remonte telle quelle -- DocumentVersionError porte deja
// la version attendue dans son message francais et est relayee telle
// quelle ; tout le reste (schema invalide, JSON malforme) passe par la
// traduction generique partagee (round de correction 1 : Critical, voir
// src/shared/errors.ts).
function translateDocumentError(err: unknown): Error {
  if (err instanceof DocumentVersionError) return new Error(err.message)
  return translateUnknownError(err, 'Fichier .calque invalide')
}

export function createDocumentHandler(deps: {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, contents: string) => Promise<void>
  chooseOpenPath: () => Promise<string | null>
  chooseSavePath: () => Promise<string | null>
  // Relogement des ressources image (voir relocateAbsoluteImageSources
  // ci-dessus). Optionnelles : main.ts les fournit toujours pour de vrai
  // (node:fs/promises), un appelant qui les omet (documents sans image
  // absolue, la plupart des tests) ne les déclenche jamais.
  copyImageFile?: (source: string, dest: string) => Promise<void>
  ensureDir?: (dirPath: string) => Promise<void>
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
      let document: CalqueDocument
      try {
        document = parseDocument(input.json)
      } catch (err) {
        throw translateDocumentError(err)
      }

      const path = input.path ?? (await deps.chooseSavePath())
      if (path === null) return null

      const documentReloge = await relocateAbsoluteImageSources(document, path, deps)
      const normalized = serializeDocument(documentReloge)

      await deps.writeFile(path, normalized)
      return { path }
    },
  }
}
