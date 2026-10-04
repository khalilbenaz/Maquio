// Gestionnaire des canaux openDocument/saveDocument (Tache 17, decision 10
// du brief) : fonction pure d'injection, testable sans Electron ni
// systeme de fichiers reel (voir test/documentHandlers.test.ts). main.ts
// se contente de la cabler avec node:fs/promises et les dialogues natifs
// (src/main/adapters/electronDialogs.ts).
//
// Format .maquio (decision 10) : openDocument et saveDocument passent
// tous les deux par parseDocument/serializeDocument -- un fichier qui ne
// passe pas la validation (JSON malforme, version incompatible, schema
// invalide) ne se retrouve jamais charge tel quel dans l'editeur, et ce
// qui est ecrit sur disque est toujours la forme normalisee (memes cles,
// meme indentation) rendue par serializeDocument.
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { isDocumentPath, isLegacyDocumentPath, stripDocumentExtension, toMaquioPath } from '../../shared/documentFile'
import { DocumentVersionError, parseDocument, serializeDocument } from '@maquio/core'
import type { MaquioDocument, Node as MaquioNode } from '@maquio/core'
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
// c'est ce chemin relatif qui rend le fichier `.maquio` partageable (pas
// de chemin absolu propre à une machine) sans faire gonfler le JSON d'un
// encodage base64.
function resourcesDirFor(documentPath: string): string {
  return join(dirname(stripDocumentExtension(documentPath)), `${basename(stripDocumentExtension(documentPath))}.ressources`)
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

// Etat partage du relogement d'un enregistrement : evite deux fichiers de
// meme nom (photo.png de deux dossiers) qui s'ecraseraient, et copie une
// seule fois une source reutilisee par plusieurs noeuds.
type RelocationContext = {
  resourcesDir: string
  ensureDirOnce: () => Promise<void>
  copyImageFile: (source: string, dest: string) => Promise<void>
  isApprovedImagePath: (source: string) => boolean
  usedNames: Set<string>
  bySource: Map<string, string>
}

function uniqueFileName(source: string, used: Set<string>): string {
  const ext = extname(source)
  const stem = basename(source, ext)
  let candidate = `${stem}${ext}`
  for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${stem}-${n}${ext}`
  used.add(candidate.toLowerCase())
  return candidate
}

// Securite (audit P0, OWASP A01) : le `src` vient du document, donc d'un
// tiers possible (.maquio recu, patch de Claude, import Figma). Copier un
// chemin absolu quelconque a cote du document permettait d'exfiltrer
// ~/.ssh/id_rsa dans un depot partage. Deux conditions cumulatives : le
// chemin a ete choisi par l'utilisateur dans le selecteur d'image de CETTE
// session, et c'est une image (extension). Sinon l'enregistrement est
// refuse, avec un message qui nomme le noeud, plutot que de laisser filer.
function assertCopiable(node: { name: string; src: string }, ctx: RelocationContext): void {
  const extension = extname(node.src).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(extension) || !ctx.isApprovedImagePath(node.src)) {
    throw new Error(
      `Enregistrement refusé : l'image « ${node.name} » pointe vers un fichier local (${node.src}) qui n'a pas été choisi avec le sélecteur d'image ou n'est pas une image. Rechoisissez l'image.`,
    )
  }
}

// Parcours de l'arbre (frame.children compris) qui ne touche QUE les
// nœuds image dont le src est un chemin absolu -- tout le reste (texte,
// formes, image déjà relative ou vide) traverse inchangé.
async function relocateNode(node: MaquioNode, ctx: RelocationContext): Promise<MaquioNode> {
  if (node.type === 'image') {
    if (node.src === '' || !isAbsolute(node.src)) return node
    let fileName = ctx.bySource.get(node.src)
    if (fileName === undefined) {
      assertCopiable(node, ctx)
      fileName = uniqueFileName(node.src, ctx.usedNames)
      ctx.bySource.set(node.src, fileName)
      await ctx.ensureDirOnce()
      await ctx.copyImageFile(node.src, join(ctx.resourcesDir, fileName))
    }
    return { ...node, src: fileName }
  }
  if (node.type === 'frame') {
    const children: MaquioNode[] = []
    for (const child of node.children) children.push(await relocateNode(child, ctx))
    return { ...node, children }
  }
  return node
}

// Optionnelle (voir createDocumentHandler ci-dessous) : quand les
// dépendances de copie ne sont pas fournies, rend le document tel quel.
async function relocateAbsoluteImageSources(
  document: MaquioDocument,
  documentPath: string,
  deps: {
    copyImageFile?: (source: string, dest: string) => Promise<void>
    ensureDir?: (dirPath: string) => Promise<void>
    isApprovedImagePath?: (source: string) => boolean
  },
): Promise<MaquioDocument> {
  if (!deps.copyImageFile || !deps.ensureDir) return document

  const resourcesDir = resourcesDirFor(documentPath)
  const ensureDir = deps.ensureDir
  let dirEnsured: Promise<void> | null = null
  const ctx: RelocationContext = {
    resourcesDir,
    ensureDirOnce: () => (dirEnsured ??= ensureDir(resourcesDir)),
    copyImageFile: deps.copyImageFile,
    // Refus par defaut : sans liste d'approbation, rien n'est copiable.
    isApprovedImagePath: deps.isApprovedImagePath ?? (() => false),
    usedNames: new Set(),
    bySource: new Map(),
  }

  const pages = []
  for (const page of document.pages) {
    const nodes: MaquioNode[] = []
    for (const n of page.nodes) nodes.push(await relocateNode(n, ctx))
    pages.push({ ...page, nodes })
  }
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
  return translateUnknownError(err, 'Fichier .maquio invalide')
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
  // Chemins que l'utilisateur a choisis avec le selecteur d'image (voir
  // main.ts) : seuls ceux-la peuvent etre copies a l'enregistrement.
  isApprovedImagePath?: (source: string) => boolean
  // Document `.calque` (ancien nom) : proposer de l'enregistrer en `.maquio`.
  chooseLegacyExtension?: (path: string) => Promise<'maquio' | 'keep' | 'cancel'>
  pathExists?: (path: string) => Promise<boolean>
}): {
  openDocument: () => Promise<OpenDocumentResult>
  openDocumentAt: (path: string) => Promise<OpenDocumentResult>
  saveDocument: (input: SaveDocumentInput) => Promise<SaveDocumentResult>
} {
  async function readAt(path: string): Promise<OpenDocumentResult> {
    const raw = await deps.readFile(path)
    try {
      // Valide seulement : on rend le contenu brut valide tel quel (le
      // renderer le relit via parseDocument, qui migre les anciens formats).
      parseDocument(raw)
    } catch (err) {
      throw translateDocumentError(err)
    }
    return { path, json: raw }
  }

  return {
    async openDocument() {
      const path = await deps.chooseOpenPath()
      if (path === null) return null
      return readAt(path)
    },

    // Glisser-deposer / ouverture par le systeme : le chemin est controle
    // (extension de document) avant toute lecture.
    async openDocumentAt(path) {
      if (!isDocumentPath(path)) throw new Error('Seuls les fichiers .maquio (ou .calque, ancien format) peuvent être ouverts.')
      return readAt(path)
    },

    async saveDocument(input) {
      let document: MaquioDocument
      try {
        document = parseDocument(input.json)
      } catch (err) {
        throw translateDocumentError(err)
      }

      let path = input.path ?? (await deps.chooseSavePath())
      if (path === null) return null

      // Ancien nom : proposer le nouveau. « Enregistrer en .maquio » ecrit a cote
      // (jamais par-dessus un .maquio existant sans demander ailleurs) ; l'ancien
      // fichier n'est pas supprime.
      if (isLegacyDocumentPath(path) && deps.chooseLegacyExtension) {
        const choice = await deps.chooseLegacyExtension(path)
        if (choice === 'cancel') return null
        if (choice === 'maquio') {
          const target = toMaquioPath(path)
          if (deps.pathExists !== undefined && (await deps.pathExists(target))) {
            const other = await deps.chooseSavePath()
            if (other === null) return null
            path = other
          } else {
            path = target
          }
        }
      }

      const documentReloge = await relocateAbsoluteImageSources(document, path, deps)
      const normalized = serializeDocument(documentReloge)

      await deps.writeFile(path, normalized)
      return { path }
    },
  }
}
