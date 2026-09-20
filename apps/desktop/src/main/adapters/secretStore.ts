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
      "Le stockage securise du systeme n'est pas disponible sur cette machine : le jeton Figma ne peut pas etre enregistre en toute securite, il n'a pas ete sauvegarde",
    )
    this.name = 'SecretStorageUnavailableError'
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
      const encrypted = await fs.readFile(filePath)
      return safeStorage.decryptString(encrypted)
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
