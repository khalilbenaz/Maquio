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

// Images locales : copiees dans le projet exporte.
describe('export : copie des images locales', () => {
  async function docAvecImage(src: string): Promise<string> {
    const { createDocument, createScreenNode, DEVICE_PRESETS } = await import('@calque/core')
    const d = createDocument('Doc')
    const image = { id: 'i', name: 'i', type: 'image' as const, frame: { x: 0, y: 0, w: 10, h: 10 }, visible: true, locked: false, opacity: 1, rotation: 0, src, fit: 'cover' as const }
    const ecran = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [image])
    return serializeDocument({ ...d, pages: [{ ...d.pages[0]!, nodes: [ecran] }] })
  }
  function deps(over: Partial<Parameters<typeof createExportHandler>[0]> = {}) {
    return {
      writeFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      chooseDirectory: async () => '/out',
      pathExists: async (p: string) => p.includes('.ressources'),
      copyFile: vi.fn(async () => {}),
      isApprovedImagePath: () => false,
      ...over,
    }
  }

  it('copie une image relative depuis <document>.ressources/ vers assets/images/ (Flutter)', async () => {
    const d = deps()
    const out = await createExportHandler(d)({ exporterId: 'flutter', json: await docAvecImage('logo.png'), projectName: 'demo', documentPath: '/docs/mon.calque' })
    expect(d.copyFile).toHaveBeenCalledWith('/docs/mon.ressources/logo.png', '/out/assets/images/logo.png')
    expect(out!.files).toContain('assets/images/logo.png')
    expect(out!.files).toContain('pubspec.yaml')
    expect(out!.warnings).toEqual([])
  })
  it('copie vers res/drawable pour Compose et un .imageset pour SwiftUI', async () => {
    const d = deps()
    await createExportHandler(d)({ exporterId: 'compose', json: await docAvecImage('Mon Logo.png'), projectName: 'demo', documentPath: '/docs/mon.calque' })
    expect(d.copyFile).toHaveBeenCalledWith('/docs/mon.ressources/Mon Logo.png', '/out/src/main/res/drawable/mon_logo.png')
    const d2 = deps()
    await createExportHandler(d2)({ exporterId: 'swiftui', json: await docAvecImage('logo.png'), projectName: 'demo', documentPath: '/docs/mon.calque' })
    expect(d2.copyFile).toHaveBeenCalledWith('/docs/mon.ressources/logo.png', '/out/Sources/Assets.xcassets/logo.imageset/logo.png')
  })
  it('un chemin absolu non choisi avec le selecteur n est jamais copie (avertissement)', async () => {
    const d = deps({ pathExists: async () => false })
    const out = await createExportHandler(d)({ exporterId: 'flutter', json: await docAvecImage('/etc/passwd'), projectName: 'demo', documentPath: null })
    expect(d.copyFile).not.toHaveBeenCalled()
    expect(out!.warnings.some((w) => w.includes('/etc/passwd'))).toBe(true)
  })
  it('un chemin absolu approuve (document pas encore enregistre) est copie', async () => {
    const d = deps({ pathExists: async (p: string) => p === '/Users/x/photo.png', isApprovedImagePath: (p: string) => p === '/Users/x/photo.png' })
    await createExportHandler(d)({ exporterId: 'react-native', json: await docAvecImage('/Users/x/photo.png'), projectName: 'demo', documentPath: null })
    expect(d.copyFile).toHaveBeenCalledWith('/Users/x/photo.png', '/out/assets/images/photo.png')
  })
  it('un src relatif qui sort du dossier de ressources est refuse', async () => {
    const d = deps()
    const out = await createExportHandler(d)({ exporterId: 'flutter', json: await docAvecImage('../secret.png'), projectName: 'demo', documentPath: '/docs/mon.calque' })
    expect(d.copyFile).not.toHaveBeenCalled()
    expect(out!.warnings.some((w) => w.includes('secret.png'))).toBe(true)
  })
  it('une image introuvable est signalee sans faire echouer l export', async () => {
    const d = deps({ pathExists: async () => false })
    const out = await createExportHandler(d)({ exporterId: 'flutter', json: await docAvecImage('absente.png'), projectName: 'demo', documentPath: '/docs/mon.calque' })
    expect(d.copyFile).not.toHaveBeenCalled()
    expect(out!.warnings.some((w) => w.includes('absente.png'))).toBe(true)
  })
})
