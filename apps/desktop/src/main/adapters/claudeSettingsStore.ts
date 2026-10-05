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
//
// Le meme fichier porte le modele Claude choisi (voir shared/claudeModels.ts) :
// chaque reglage est ecrit sans effacer l'autre.
import { DEFAULT_CLAUDE_MODEL, isClaudeModelId } from '../../shared/claudeModels'
import type { ClaudeModelId } from '../../shared/claudeModels'

export type ClaudeSettingsFs = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
}

export type ClaudeSettingsStore = {
  getCustomPath(): Promise<string | null>
  setCustomPath(path: string | null): Promise<void>
  getModel(): Promise<ClaudeModelId>
  setModel(model: string): Promise<void>
}

type StoredShape = { customPath: string | null; model: ClaudeModelId }

const VIDE: StoredShape = { customPath: null, model: DEFAULT_CLAUDE_MODEL }

export function createClaudeSettingsStore(opts: { filePath: string; fs: ClaudeSettingsFs }): ClaudeSettingsStore {
  const { filePath, fs } = opts

  async function lire(): Promise<StoredShape> {
    if (!(await fs.pathExists(filePath))) return VIDE
    try {
      const brut = await fs.readFile(filePath)
      const parse: unknown = JSON.parse(brut)
      if (typeof parse !== 'object' || parse === null) return VIDE
      const record = parse as Record<string, unknown>
      return {
        customPath: typeof record['customPath'] === 'string' ? record['customPath'] : null,
        // Un modele inconnu (fichier edite a la main) : retour au defaut.
        model: isClaudeModelId(record['model']) ? record['model'] : DEFAULT_CLAUDE_MODEL,
      }
    } catch {
      // Fichier corrompu (JSON illisible ou de forme inattendue) : on se
      // rabat sur "aucun chemin enregistre" plutot que de lever, coherent
      // avec le fait qu'un fichier de reglages en clair peut toujours etre
      // edite (ou casse) a la main par l'utilisateur.
      return VIDE
    }
  }

  async function ecrire(valeur: StoredShape): Promise<void> {
    // En clair, sans aucun chiffrement (voir la note en tete de fichier).
    await fs.writeFile(filePath, JSON.stringify(valeur, null, 2))
  }

  return {
    async getCustomPath() {
      return (await lire()).customPath
    },

    async setCustomPath(path: string | null) {
      await ecrire({ ...(await lire()), customPath: path })
    },

    async getModel() {
      return (await lire()).model
    },

    async setModel(model: string) {
      if (!isClaudeModelId(model)) throw new Error(`Modèle Claude inconnu : ${model}`)
      await ecrire({ ...(await lire()), model })
    },
  }
}
