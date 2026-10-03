// Stockage du jeton Figma (Tache 17, decision 3 du brief) : le jeton
// n'est JAMAIS ecrit en clair sur disque. Il est chiffre via
// safeStorage.encryptString avant d'etre ecrit dans un fichier du dossier
// de donnees utilisateur de l'application, et dechiffre via
// safeStorage.decryptString a la lecture.
//
// Si le chiffrement n'est pas disponible sur la machine courante
// (safeStorage.isEncryptionAvailable() faux -- trousseau systeme
// verrouille, absent, ou plateforme qui ne le supporte pas), setToken
// refuse d'ecrire quoi que ce soit et leve SecretStorageUnavailableError
// plutot que de degrader silencieusement vers un stockage en clair.
//
// `safeStorage` et l'acces disque sont injectes (jamais importes depuis
// `electron` ou `node:fs` directement ici) : c'est ce qui rend ce fichier
// testable sans Electron. L'adaptateur reel (safeStorage d'Electron,
// node:fs/promises) est cable dans main.ts.
export type SafeStorageLike = {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
}

export type SecretStoreFs = {
  readFile: (path: string) => Promise<Buffer>
  writeFile: (path: string, data: Buffer) => Promise<void>
  pathExists: (path: string) => Promise<boolean>
}

export class SecretStorageUnavailableError extends Error {
  constructor() {
    super(
      "Le stockage sécurisé du système n'est pas disponible sur cette machine : le jeton Figma ne peut pas être enregistré en toute sécurité, il n'a pas été sauvegardé",
    )
    this.name = 'SecretStorageUnavailableError'
  }
}

export class StoredSecretUnreadableError extends Error {
  constructor() {
    super(
      "Le jeton Figma enregistré est illisible (fichier corrompu ou trousseau système modifié). Saisissez-le à nouveau dans les réglages.",
    )
    this.name = 'StoredSecretUnreadableError'
  }
}

export type SecretStore = {
  hasToken(): Promise<boolean>
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
}

export function createSecretStore(opts: { safeStorage: SafeStorageLike; filePath: string; fs: SecretStoreFs }): SecretStore {
  const { safeStorage, filePath, fs } = opts

  return {
    async hasToken() {
      return fs.pathExists(filePath)
    },

    async getToken() {
      if (!(await fs.pathExists(filePath))) return null
      // Fichier illisible, corrompu ou chiffre par un autre trousseau :
      // erreur nommee et actionnable, jamais l'exception brute du systeme.
      try {
        const encrypted = await fs.readFile(filePath)
        return safeStorage.decryptString(encrypted)
      } catch {
        throw new StoredSecretUnreadableError()
      }
    },

    async setToken(token: string) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new SecretStorageUnavailableError()
      }
      const encrypted = safeStorage.encryptString(token)
      await fs.writeFile(filePath, encrypted)
    },
  }
}
