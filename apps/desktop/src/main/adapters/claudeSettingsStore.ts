// Stockage du chemin personnalise vers le binaire Claude Code, dans le
// dossier de donnees utilisateur de l'application, en JSON ordinaire.
//
// A la difference du jeton Figma (secretStore.ts), CE N'EST PAS UN SECRET :
// un chemin de binaire n'a rien de confidentiel, et le chiffrer via
// safeStorage compliquerait le depannage (impossible de lire/editer le
// fichier a la main en cas de probleme) sans rien proteger de plus. Ce
// fichier n'importe donc jamais `safeStorage`.
//
// `fs` est injecte (jamais `node:fs` directement) : c'est ce qui rend ce
// fichier testable sans systeme de fichiers reel (voir
// test/claudeSettingsStore.test.ts). L'adaptateur reel (node:fs/promises)
// est cable dans main.ts, comme secretStore.ts.
export type ClaudeSettingsFs = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
}

export type ClaudeSettingsStore = {
  getCustomPath(): Promise<string | null>
  setCustomPath(path: string | null): Promise<void>
}

type StoredShape = { customPath: string | null }

export function createClaudeSettingsStore(opts: { filePath: string; fs: ClaudeSettingsFs }): ClaudeSettingsStore {
  const { filePath, fs } = opts

  async function lire(): Promise<StoredShape> {
    if (!(await fs.pathExists(filePath))) return { customPath: null }
    try {
      const brut = await fs.readFile(filePath)
      const parse: unknown = JSON.parse(brut)
      if (typeof parse === 'object' && parse !== null && typeof (parse as StoredShape).customPath === 'string') {
        return { customPath: (parse as StoredShape).customPath }
      }
      return { customPath: null }
    } catch {
      // Fichier corrompu (JSON illisible ou de forme inattendue) : on se
      // rabat sur "aucun chemin enregistre" plutot que de lever, coherent
      // avec le fait qu'un fichier de reglages en clair peut toujours etre
      // edite (ou casse) a la main par l'utilisateur.
      return { customPath: null }
    }
  }

  return {
    async getCustomPath() {
      return (await lire()).customPath
    },

    async setCustomPath(path: string | null) {
      // En clair, sans aucun chiffrement (voir la note en tete de fichier).
      await fs.writeFile(filePath, JSON.stringify({ customPath: path }, null, 2))
    },
  }
}
