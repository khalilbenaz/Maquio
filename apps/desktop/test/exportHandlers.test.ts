import { describe, expect, it, vi } from 'vitest'
import { serializeDocument } from '@calque/core'
import { loginScreenDocument } from '@calque/codegen/test/fixtures/login-screen'
import { createExportHandler } from '../src/main/handlers/exportHandlers'
import { documentJsonDeFormeInvalide } from './helpers/documentJsonInvalide'

// Round de correction 1 (Critical) : un ZodError (schema invalide) ne doit
// jamais remonter sous forme de dump JSON technique.
function verifieMessagePropre(message: string): void {
  expect(message).not.toContain('{')
  expect(message).not.toContain('"code"')
  expect(message).not.toContain('invalid_type')
}

describe('export vers le disque', () => {
  it('ecrit chaque fichier produit sous le dossier choisi', async () => {
    const writeFile = vi.fn(async () => {})
    const handler = createExportHandler({
      writeFile,
      mkdir: vi.fn(async () => {}),
      chooseDirectory: async () => '/tmp/sortie',
      pathExists: async () => false,
    })
    const out = await handler({ exporterId: 'flutter', json: serializeDocument(loginScreenDocument), projectName: 'demo' })
    expect(out!.files).toContain('lib/screens/login_screen.dart')
    expect(writeFile).toHaveBeenCalledWith('/tmp/sortie/lib/screens/login_screen.dart', expect.any(String), 'utf8')
  })

  it('rend null quand l utilisateur annule le choix du dossier', async () => {
    const writeFile = vi.fn()
    const handler = createExportHandler({ writeFile, mkdir: vi.fn(), chooseDirectory: async () => null, pathExists: async () => false })
    expect(await handler({ exporterId: 'flutter', json: serializeDocument(loginScreenDocument), projectName: 'd' })).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('n ecrit rien si un fichier existe deja et que l ecrasement n est pas confirme', async () => {
    const writeFile = vi.fn()
    const handler = createExportHandler({
      writeFile,
      mkdir: vi.fn(),
      chooseDirectory: async () => '/tmp/x',
      pathExists: async () => true,
      confirmOverwrite: async () => false,
    })
    expect(await handler({ exporterId: 'flutter', json: serializeDocument(loginScreenDocument), projectName: 'd' })).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('ecrit apres confirmation explicite de l ecrasement', async () => {
    const writeFile = vi.fn(async () => {})
    const confirmOverwrite = vi.fn(async () => true)
    const handler = createExportHandler({
      writeFile,
      mkdir: vi.fn(async () => {}),
      chooseDirectory: async () => '/tmp/y',
      pathExists: async () => true,
      confirmOverwrite,
    })
    const out = await handler({ exporterId: 'flutter', json: serializeDocument(loginScreenDocument), projectName: 'd' })
    expect(out).not.toBeNull()
    expect(confirmOverwrite).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalled()
  })

  it('sans fonction de confirmation fournie, refuse par defaut d ecraser un fichier existant', async () => {
    const writeFile = vi.fn()
    const handler = createExportHandler({
      writeFile,
      mkdir: vi.fn(),
      chooseDirectory: async () => '/tmp/z',
      pathExists: async () => true,
    })
    expect(await handler({ exporterId: 'flutter', json: serializeDocument(loginScreenDocument), projectName: 'd' })).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('remonte les avertissements de l exportateur', async () => {
    const handler = createExportHandler({
      writeFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      chooseDirectory: async () => '/tmp/w',
      pathExists: async () => false,
    })
    const out = await handler({ exporterId: 'swiftui', json: serializeDocument(loginScreenDocument), projectName: 'd' })
    expect(out).not.toBeNull()
    expect(out!.warnings).toEqual(expect.any(Array))
  })

  it('traduit une version de document incompatible en message francais', async () => {
    const handler = createExportHandler({
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      chooseDirectory: async () => '/tmp/v',
      pathExists: async () => false,
    })
    const documentFutur = JSON.stringify({ ...loginScreenDocument, version: 999 })
    await expect(handler({ exporterId: 'flutter', json: documentFutur, projectName: 'd' })).rejects.toThrow(/version/i)
  })

  it('traduit un document syntaxiquement valide mais de forme invalide sans dump technique', async () => {
    const writeFile = vi.fn()
    const handler = createExportHandler({
      writeFile,
      mkdir: vi.fn(),
      chooseDirectory: async () => '/tmp/u',
      pathExists: async () => false,
    })

    let messageErreur = ''
    try {
      await handler({ exporterId: 'flutter', json: documentJsonDeFormeInvalide(), projectName: 'd' })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    verifieMessagePropre(messageErreur)
    expect(writeFile).not.toHaveBeenCalled()
  })
})
