// Creation, (de)serialisation et validation de version d'un CalqueDocument.
import { documentSchema } from './schema'
import { DOCUMENT_VERSION } from './version'
import type { CalqueDocument, DesignTokens, DevicePreset, Page } from './types'

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

export function createDocument(name: string, device: DevicePreset = DEVICE_PRESETS.iphone15): CalqueDocument {
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

export function serializeDocument(doc: CalqueDocument): string {
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

export function parseDocument(json: string): CalqueDocument {
  const raw: unknown = JSON.parse(json)
  const version = readRawVersion(raw)

  if (version !== undefined && version > DOCUMENT_VERSION) {
    throw new DocumentVersionError(
      `Document en version ${version}, plus récente que la version supportée ${DOCUMENT_VERSION}`,
    )
  }
  if (version !== undefined && version < DOCUMENT_VERSION) {
    throw new DocumentVersionError(
      `Document en version ${version}, plus ancienne que la version courante ${DOCUMENT_VERSION} (aucune migration disponible)`,
    )
  }

  return documentSchema.parse(raw)
}
