// Extension des documents : `.maquio` pour les nouveaux fichiers ; les
// anciens `.calque` (nom precedent de l'application) restent lisibles et
// ouvrables, avec une proposition de les enregistrer en `.maquio`.
// Sans aucune dependance (importe par le main ET le renderer).
export const DOCUMENT_EXTENSION = 'maquio'
export const LEGACY_EXTENSION = 'calque'
export const OPENABLE_EXTENSIONS = [DOCUMENT_EXTENSION, LEGACY_EXTENSION] as const

const RE = new RegExp(`\\.(${OPENABLE_EXTENSIONS.join('|')})$`, 'i')

export function isDocumentPath(path: string): boolean {
  return RE.test(path)
}

export function isLegacyDocumentPath(path: string): boolean {
  return new RegExp(`\\.${LEGACY_EXTENSION}$`, 'i').test(path)
}

// Chemin sans extension de document (« /d/mon.maquio » -> « /d/mon »).
export function stripDocumentExtension(path: string): string {
  return path.replace(RE, '')
}

// « /d/mon.calque » -> « /d/mon.maquio » (un chemin deja .maquio reste tel quel).
export function toMaquioPath(path: string): string {
  return isLegacyDocumentPath(path) ? `${stripDocumentExtension(path)}.${DOCUMENT_EXTENSION}` : path
}
