// Decision 3 du brief : le jeton Figma n'est jamais ecrit en clair. Ces
// tests couvrent le refus explicite de stocker quand le chiffrement du
// systeme n'est pas disponible (plutot que de degrader en clair), et le
// fait que le jeton en clair n'apparait jamais dans ce qui est ecrit sur
// disque quand le stockage reussit.
import { describe, expect, it, vi } from 'vitest'
import { createSecretStore, SecretStorageUnavailableError } from '../src/main/adapters/secretStore'

describe('secretStore (jeton Figma)', () => {
  it('refuse de stocker le jeton quand le chiffrement systeme est indisponible', async () => {
    const writeFile = vi.fn()
    const store = createSecretStore({
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from('ne-devrait-jamais-etre-appele'),
        decryptString: () => 'ne-devrait-jamais-etre-appele',
      },
      filePath: '/tmp/figma-token.enc',
      fs: { readFile: vi.fn(), writeFile, pathExists: vi.fn(async () => false) },
    })

    await expect(store.setToken('mon-jeton-secret')).rejects.toThrow(SecretStorageUnavailableError)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('chiffre le jeton avant de l ecrire, jamais en clair', async () => {
    const writeFile = vi.fn(async (_path: string, _data: Buffer) => {})
    const store = createSecretStore({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(`chiffre(${plain})`),
        decryptString: (buf) => buf.toString().replace(/^chiffre\((.*)\)$/, '$1'),
      },
      filePath: '/tmp/figma-token.enc',
      fs: { readFile: vi.fn(), writeFile, pathExists: vi.fn(async () => false) },
    })

    await store.setToken('mon-jeton-secret')
    expect(writeFile).toHaveBeenCalledTimes(1)
    const appel = writeFile.mock.calls[0]
    if (appel === undefined) throw new Error('writeFile aurait du etre appele')
    const [path, data] = appel
    expect(path).toBe('/tmp/figma-token.enc')
    // Ce qui est ecrit est le resultat de encryptString(), jamais le
    // jeton en clair lui-meme.
    expect(data.toString()).not.toBe('mon-jeton-secret')
    expect(data.toString()).toBe('chiffre(mon-jeton-secret)')
  })

  it('hasToken/getToken refletent l etat du fichier chiffre', async () => {
    let stocke: Buffer | null = null
    const store = createSecretStore({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (plain) => Buffer.from(`chiffre(${plain})`),
        decryptString: (buf) => buf.toString().replace(/^chiffre\((.*)\)$/, '$1'),
      },
      filePath: '/tmp/figma-token.enc',
      fs: {
        readFile: async () => {
          if (stocke === null) throw new Error('absent')
          return stocke
        },
        writeFile: async (_p, data) => {
          stocke = data
        },
        pathExists: async () => stocke !== null,
      },
    })

    expect(await store.hasToken()).toBe(false)
    expect(await store.getToken()).toBeNull()

    await store.setToken('abc123')

    expect(await store.hasToken()).toBe(true)
    expect(await store.getToken()).toBe('abc123')
  })
})

describe('secretStore : jeton illisible', () => {
  it('getToken leve une erreur nommee et actionnable quand le dechiffrement echoue', async () => {
    const { StoredSecretUnreadableError } = await import('../src/main/adapters/secretStore')
    const store = createSecretStore({
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (p) => Buffer.from(p),
        decryptString: () => {
          throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString')
        },
      },
      filePath: '/tmp/figma-token.enc',
      fs: { readFile: async () => Buffer.from('corrompu'), writeFile: vi.fn(), pathExists: async () => true },
    })
    const err = await store.getToken().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StoredSecretUnreadableError)
    expect((err as Error).message).toContain('réglages')
    expect((err as Error).message).not.toContain('safeStorage')
  })
  it('getToken leve la meme erreur quand la lecture du fichier echoue', async () => {
    const { StoredSecretUnreadableError } = await import('../src/main/adapters/secretStore')
    const store = createSecretStore({
      safeStorage: { isEncryptionAvailable: () => true, encryptString: (p) => Buffer.from(p), decryptString: () => 'x' },
      filePath: '/tmp/figma-token.enc',
      fs: { readFile: async () => { throw new Error('EACCES') }, writeFile: vi.fn(), pathExists: async () => true },
    })
    await expect(store.getToken()).rejects.toBeInstanceOf(StoredSecretUnreadableError)
  })
})
