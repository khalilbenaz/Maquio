import { describe, expect, it, vi } from 'vitest'
import { createDocument, serializeDocument } from '@maquio/core'
import { isDocumentPath, isLegacyDocumentPath, stripDocumentExtension, toMaquioPath } from '../src/shared/documentFile'
import { createDocumentHandler } from '../src/main/handlers/documentHandlers'

describe('extensions de document', () => {
  it('.maquio est le format courant, .calque reste reconnu (insensible a la casse)', () => {
    expect(isDocumentPath('/d/a.maquio')).toBe(true)
    expect(isDocumentPath('/d/a.CALQUE')).toBe(true)
    expect(isDocumentPath('/d/a.json')).toBe(false)
    expect(isLegacyDocumentPath('/d/a.calque')).toBe(true)
    expect(isLegacyDocumentPath('/d/a.maquio')).toBe(false)
  })
  it('stripDocumentExtension et toMaquioPath', () => {
    expect(stripDocumentExtension('/d/mon projet.calque')).toBe('/d/mon projet')
    expect(stripDocumentExtension('/d/mon projet.maquio')).toBe('/d/mon projet')
    expect(toMaquioPath('/d/mon.calque')).toBe('/d/mon.maquio')
    expect(toMaquioPath('/d/mon.maquio')).toBe('/d/mon.maquio')
    expect(toMaquioPath('/d/mon.calque.calque')).toBe('/d/mon.calque.maquio')
  })
})

describe('documents .calque (ancien nom) : ouverture et enregistrement', () => {
  const json = serializeDocument(createDocument('Ancien'))
  const base = () => ({
    readFile: vi.fn(async () => json),
    writeFile: vi.fn(async () => {}),
    chooseOpenPath: async () => '/d/ancien.calque',
    chooseSavePath: async () => '/d/nouveau.maquio',
  })

  it('un .calque s ouvre (par le dialogue et par chemin direct)', async () => {
    const h = createDocumentHandler(base())
    expect((await h.openDocument())!.path).toBe('/d/ancien.calque')
    expect((await h.openDocumentAt('/d/x.maquio'))!.path).toBe('/d/x.maquio')
    expect((await h.openDocumentAt('/d/x.calque'))!.path).toBe('/d/x.calque')
  })
  it('openDocumentAt refuse tout autre fichier, sans le lire', async () => {
    const deps = base()
    await expect(createDocumentHandler(deps).openDocumentAt('/etc/passwd')).rejects.toThrow(/\.maquio/)
    await expect(createDocumentHandler(deps).openDocumentAt('/d/secret.json')).rejects.toThrow()
    expect(deps.readFile).not.toHaveBeenCalled()
  })
  it('enregistrer un .calque propose le .maquio : accepte -> ecrit a cote en .maquio, l ancien est intact', async () => {
    const deps = { ...base(), chooseLegacyExtension: vi.fn(async () => 'maquio' as const), pathExists: async () => false }
    const out = await createDocumentHandler(deps).saveDocument({ path: '/d/ancien.calque', json })
    expect(deps.chooseLegacyExtension).toHaveBeenCalledWith('/d/ancien.calque')
    expect(out).toEqual({ path: '/d/ancien.maquio' })
    expect(deps.writeFile).toHaveBeenCalledTimes(1)
    expect(deps.writeFile).toHaveBeenCalledWith('/d/ancien.maquio', expect.any(String))
  })
  it('garder .calque : ecrit sur le chemin d origine ; annuler : rien n est ecrit', async () => {
    const keep = { ...base(), chooseLegacyExtension: async () => 'keep' as const }
    expect(await createDocumentHandler(keep).saveDocument({ path: '/d/ancien.calque', json })).toEqual({ path: '/d/ancien.calque' })
    const cancel = { ...base(), chooseLegacyExtension: async () => 'cancel' as const }
    expect(await createDocumentHandler(cancel).saveDocument({ path: '/d/ancien.calque', json })).toBeNull()
    expect(cancel.writeFile).not.toHaveBeenCalled()
  })
  it('un .maquio existe deja a cote : on demande un autre emplacement plutot que d ecraser', async () => {
    const deps = { ...base(), chooseLegacyExtension: async () => 'maquio' as const, pathExists: async () => true }
    expect(await createDocumentHandler(deps).saveDocument({ path: '/d/ancien.calque', json })).toEqual({ path: '/d/nouveau.maquio' })
  })
  it('un document .maquio n est jamais soumis a la proposition', async () => {
    const deps = { ...base(), chooseLegacyExtension: vi.fn(async () => 'maquio' as const) }
    await createDocumentHandler(deps).saveDocument({ path: '/d/nouveau.maquio', json })
    expect(deps.chooseLegacyExtension).not.toHaveBeenCalled()
  })
  it('le dossier de ressources est le meme pour .calque et .maquio (<nom>.ressources)', async () => {
    const png = { id: 'i', name: 'i', type: 'image' as const, frame: { x: 0, y: 0, w: 1, h: 1 }, visible: true, locked: false, opacity: 1, rotation: 0, src: '/img/logo.png', fit: 'cover' as const }
    const d = createDocument('x')
    const withImage = serializeDocument({ ...d, pages: [{ ...d.pages[0]!, nodes: [png] }] })
    const copy = vi.fn(async () => {})
    for (const path of ['/d/mon.calque', '/d/mon.maquio']) {
      copy.mockClear()
      await createDocumentHandler({ ...base(), copyImageFile: copy, ensureDir: async () => {}, isApprovedImagePath: () => true }).saveDocument({ path, json: withImage })
      expect(copy).toHaveBeenCalledWith('/img/logo.png', '/d/mon.ressources/logo.png')
    }
  })
})
