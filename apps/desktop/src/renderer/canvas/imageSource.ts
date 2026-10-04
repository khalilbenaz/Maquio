// Résolution du `src` d'un nœud Image en une URL affichable dans le
// canevas (Défaut n3, « comment mettre l'image ? »). Fonction pure, testée
// directement sans rendu (voir imageSource.test.ts), comme screenToPage
// et consorts dans useDragInteraction.ts.
//
// `src` porte l'une de ces trois formes (voir le ruling du brief sur le
// stockage) :
// - '' (aucune image choisie) -> pas d'URL, NodeView affiche un espace
//   reservé plutôt qu'une <img> cassée ;
// - un chemin ABSOLU (image choisie mais document jamais encore
//   enregistré, voir documentHandlers.ts) -> converti en URL `file://` ;
// - un chemin RELATIF (document déjà enregistré : l'image a été copiée
//   dans `<nom-du-document>.ressources/` à l'enregistrement) -> résolu
//   par rapport à ce dossier, qui vit à côté du fichier .maquio
//   (`documentPath`) ; sans `documentPath` connu, ce cas ne peut pas être
//   résolu (aucune URL).
//
// Jamais de `node:path` ici (renderer, voir test/architecture.test.ts) :
// uniquement des manipulations de chaînes.

function isAbsolutePath(p: string): boolean {
  // POSIX (macOS/Linux) : commence par '/'. Windows : lettre de lecteur
  // suivie de ':' puis '\' ou '/' (ex. 'C:\Users\...') -- gardé au cas où,
  // même si la distribution v1 cible macOS.
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p)
}

function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//.test(src)
}

function toFileUrl(absolutePath: string): string {
  return 'file://' + encodeURI(absolutePath.replace(/\\/g, '/'))
}

// Répertoire des ressources d'un document ('<dossier>/<nom sans
// extension>.ressources'), à partir du chemin du fichier .maquio.
function resourcesDirFor(documentPath: string): string {
  const normalise = documentPath.replace(/\\/g, '/')
  const dernierSlash = normalise.lastIndexOf('/')
  const dossier = dernierSlash === -1 ? '' : normalise.slice(0, dernierSlash)
  const nomFichier = dernierSlash === -1 ? normalise : normalise.slice(dernierSlash + 1)
  const nomSansExtension = nomFichier.replace(/\.(maquio|calque)$/i, '')
  return `${dossier}/${nomSansExtension}.ressources`
}

export function resolveImageSrc(src: string, documentPath: string | null): string | null {
  if (src === '') return null
  if (isRemoteUrl(src)) return src
  if (isAbsolutePath(src)) return toFileUrl(src)
  if (documentPath === null) return null
  return toFileUrl(`${resourcesDirFor(documentPath)}/${src}`)
}
