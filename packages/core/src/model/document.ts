// Creation, (de)serialisation et validation de version d'un MaquioDocument.
import { documentSchema } from './schema'
import { DOCUMENT_VERSION } from './version'
import { createScreenNode } from './screen'
import { DEFAULT_TRANSITION } from './interactions'
import type { MaquioDocument, DesignTokens, DevicePreset, Page } from './types'

// Erreur levee quand la version du document lu n'est pas la version courante.
// Un document plus recent n'est jamais lu partiellement ; un document plus
// ancien n'a pas encore de chemin de migration en v1.
export class DocumentVersionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentVersionError'
  }
}

// Geles pour que toute tentative de mutation (ex. un appelant qui ferait
// `preset.width = ...`) echoue fort plutot que de corrompre silencieusement
// le singleton partage par tout le process.
export const DEVICE_PRESETS: Record<'iphone15' | 'pixel8' | 'ipadMini', DevicePreset> = Object.freeze({
  iphone15: Object.freeze({ id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 }),
  pixel8: Object.freeze({ id: 'pixel8', label: 'Pixel 8', width: 412, height: 915, pixelRatio: 2.625 }),
  ipadMini: Object.freeze({ id: 'ipadMini', label: 'iPad mini', width: 744, height: 1133, pixelRatio: 2 }),
})

function emptyTokens(): DesignTokens {
  return { colors: {}, typography: {}, spacing: {} }
}

// v2 (addendum navigation §3.1) : un document neuf ne porte PAS encore
// d'ecran -- `Page.device` reste le gabarit par defaut des ecrans a venir
// (bouton "Nouvel ecran" du plan de travail), exactement comme avant cet
// addendum pour tout le reste (page vide, aucun noeud). Volontairement
// inchange (pas d'ecran seme d'office) : la tres large majorite des tests
// du coeur (edits.test.ts, history.test.ts, packages/ai) construisent leurs
// documents de test a partir de `createDocument()` puis inserent leurs
// propres noeuds de premier niveau via createNodeCommand(pageId, null,
// ...) -- semer un ecran ici deplacerait silencieusement leurs assertions
// de position ('a' deviendrait le DEUXIEME noeud de la page, pas le
// premier). Le seul endroit qui enveloppe un ecran d'office est la
// migration v1 -> v2 (voir migrateV1ToV2 plus bas), parce que la §3.1 de
// l'addendum l'exige explicitement pour un document EXISTANT, pas pour un
// document neuf.
export function createDocument(name: string, device: DevicePreset = DEVICE_PRESETS.iphone15): MaquioDocument {
  const page: Page = {
    id: crypto.randomUUID(),
    name: 'Page 1',
    // Clone : `page.device` doit pouvoir etre modifie par l'appelant (ex.
    // futur redimensionnement) sans jamais muter le preset partage.
    device: { ...device },
    nodes: [],
  }
  return {
    version: DOCUMENT_VERSION,
    id: crypto.randomUUID(),
    name,
    pages: [page],
    tokens: emptyTokens(),
  }
}

export function serializeDocument(doc: MaquioDocument): string {
  return JSON.stringify(doc, null, 2)
}

// Extrait le champ `version` d'une valeur brute sans valider le reste du
// document : la verification de version doit pouvoir rejeter un document
// futur avant toute lecture partielle de son contenu.
function readRawVersion(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    return undefined
  }
  const version = (raw as { version: unknown }).version
  return typeof version === 'number' ? version : undefined
}

// v2 (addendum navigation §3.1) : enveloppe les noeuds de premier niveau
// d'une page v1 (aucun n'a `device`, cette version ne connaissait pas les
// ecrans) dans un ecran UNIQUE portant le `device` de la page. Les noeuds
// eux-memes ne sont PAS transformes : leurs `frame.x`/`frame.y` restaient
// deja relatifs a l'origine (0,0) de la page/du device, qui devient l'
// origine du nouvel ecran englobant -- aucune coordonnee ne bouge.
function wrapPageAsScreen(page: Page): Page {
  const screen = createScreenNode(
    'Écran 1',
    page.device,
    { x: 0, y: 0, w: page.device.width, h: page.device.height },
    page.nodes,
  )
  return { ...page, nodes: [screen] }
}

function migrateV1ToV2(doc: MaquioDocument): MaquioDocument {
  return { ...doc, version: 2, pages: doc.pages.map(wrapPageAsScreen) }
}

// v3 (composants mobiles) : aucune transformation de contenu -- les noeuds
// `component` et le champ `container` n'existaient pas, aucun ancien
// document n'en porte.
function migrateV2ToV3(doc: MaquioDocument): MaquioDocument {
  return { ...doc, version: DOCUMENT_VERSION }
}

// v4 : convertit, sur le JSON BRUT (avant validation, le schema v4 ne connait
// plus `link`), chaque `link: { target }` en `interactions: [tap -> navigate]`
// avec la transition par defaut. Aucune donnee n'est perdue ; un noeud qui
// porte deja des interactions les garde et le lien ne s'y ajoute que si le
// declencheur « tap » est libre.
function migrateLinksInRaw(raw: unknown): void {
  const visit = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return
    const n = node as Record<string, unknown>
    const link = n['link']
    if (link !== undefined) {
      delete n['link']
      const target = typeof link === 'object' && link !== null ? (link as { target?: unknown }).target : undefined
      if (typeof target === 'string') {
        const existing = Array.isArray(n['interactions']) ? (n['interactions'] as { trigger?: { type?: string } }[]) : []
        if (!existing.some((i) => i.trigger?.type === 'tap')) {
          n['interactions'] = [{ trigger: { type: 'tap' }, action: { type: 'navigate', target }, transition: { ...DEFAULT_TRANSITION } }, ...existing]
        }
      }
    }
    if (Array.isArray(n['children'])) n['children'].forEach(visit)
  }
  const pages = (raw as { pages?: unknown })?.pages
  if (Array.isArray(pages)) for (const page of pages) if (page && Array.isArray(page.nodes)) page.nodes.forEach(visit)
}

export function parseDocument(json: string): MaquioDocument {
  const raw: unknown = JSON.parse(json)
  const version = readRawVersion(raw)

  if (version !== undefined && version > DOCUMENT_VERSION) {
    throw new DocumentVersionError(
      `Document en version ${version}, plus récente que la version supportée ${DOCUMENT_VERSION}`,
    )
  }
  // Seule la version 1 a un chemin de migration (voir migrateV1ToV2
  // ci-dessus) : toute version anterieure (0, negative, ...) reste refusee
  // exactement comme avant cet addendum.
  if (version !== undefined && version < 1) {
    throw new DocumentVersionError(
      `Document en version ${version}, plus ancienne que la version courante ${DOCUMENT_VERSION} (aucune migration disponible)`,
    )
  }

  // Un document v1 (noeuds de premier niveau sans `device`) est une forme
  // STRUCTURELLEMENT VALIDE de documentSchema v2 -- `FrameNode.device` et
  // `NodeBase.link` sont tous deux optionnels (voir schema.ts) -- donc
  // documentSchema.parse() le valide deja correctement tel quel. La
  // migration proprement dite (enveloppement dans un ecran) n'a donc besoin
  // d'aucune manipulation de JSON brut non type : elle s'applique APRES
  // validation, sur un MaquioDocument deja bien forme.
  if (version !== undefined && version < 4) migrateLinksInRaw(raw)
  const parsed = documentSchema.parse(raw)
  // Chaine de migrations : v1 -> v2 (ecrans) puis v2 -> v3 (composants).
  // v3 est purement additif (voir model/version.ts) : relever le numero
  // suffit. Un document deja en v3 est rendu tel quel.
  if (version === 1) return migrateV2ToV3(migrateV1ToV2(parsed))
  if (version === 2 || version === 3) return migrateV2ToV3(parsed)
  return parsed
}
