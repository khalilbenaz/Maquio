// Decision 10 du brief : openDocument/saveDocument passent par
// parseDocument/serializeDocument (format .calque valide et normalise),
// et une version de document incompatible est traduite en message
// francais explicite (decision 4).
import { describe, expect, it, vi } from 'vitest'
import { createDocument, serializeDocument } from '@calque/core'
import { createDocumentHandler } from '../src/main/handlers/documentHandlers'
import { documentJsonDeFormeInvalide } from './helpers/documentJsonInvalide'

// Round de correction 1 (Critical) : un ZodError (schema invalide) ne doit
// jamais remonter sous forme de dump JSON technique.
function verifieMessagePropre(message: string): void {
  expect(message).not.toContain('{')
  expect(message).not.toContain('"code"')
  expect(message).not.toContain('invalid_type')
}

describe('openDocument', () => {
  it('rend null quand l utilisateur annule le choix du fichier', async () => {
    const readFile = vi.fn()
    const { openDocument } = createDocumentHandler({
      readFile,
      writeFile: vi.fn(),
      chooseOpenPath: async () => null,
      chooseSavePath: vi.fn(),
    })

    expect(await openDocument()).toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('lit et valide le fichier choisi', async () => {
    const json = serializeDocument(createDocument('Mon document'))
    const { openDocument } = createDocumentHandler({
      readFile: async () => json,
      writeFile: vi.fn(),
      chooseOpenPath: async () => '/tmp/doc.calque',
      chooseSavePath: vi.fn(),
    })

    const result = await openDocument()
    expect(result).toEqual({ path: '/tmp/doc.calque', json })
  })

  it('traduit une version de document incompatible en message francais explicite', async () => {
    const documentFutur = JSON.stringify({ ...JSON.parse(serializeDocument(createDocument('X'))), version: 999 })
    const { openDocument } = createDocumentHandler({
      readFile: async () => documentFutur,
      writeFile: vi.fn(),
      chooseOpenPath: async () => '/tmp/doc.calque',
      chooseSavePath: vi.fn(),
    })

    await expect(openDocument()).rejects.toThrow(/version 999/)
  })

  it('traduit un document syntaxiquement valide mais de forme invalide sans dump technique', async () => {
    const { openDocument } = createDocumentHandler({
      readFile: async () => documentJsonDeFormeInvalide(),
      writeFile: vi.fn(),
      chooseOpenPath: async () => '/tmp/doc.calque',
      chooseSavePath: vi.fn(),
    })

    let messageErreur = ''
    try {
      await openDocument()
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    verifieMessagePropre(messageErreur)
    expect(messageErreur).toMatch(/francais|propriete|invalide/i)
  })
})

describe('saveDocument', () => {
  it('ecrit a l emplacement fourni sans redemander de chemin', async () => {
    const writeFile = vi.fn(async () => {})
    const chooseSavePath = vi.fn()
    const { saveDocument } = createDocumentHandler({
      readFile: vi.fn(),
      writeFile,
      chooseOpenPath: vi.fn(),
      chooseSavePath,
    })
    const json = serializeDocument(createDocument('Mon document'))

    const result = await saveDocument({ path: '/tmp/doc.calque', json })
    expect(result).toEqual({ path: '/tmp/doc.calque' })
    expect(chooseSavePath).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledWith('/tmp/doc.calque', expect.any(String))
  })

  it('sans chemin, demande "Enregistrer sous" et n ecrit rien si annule', async () => {
    const writeFile = vi.fn()
    const { saveDocument } = createDocumentHandler({
      readFile: vi.fn(),
      writeFile,
      chooseOpenPath: vi.fn(),
      chooseSavePath: async () => null,
    })
    const json = serializeDocument(createDocument('Mon document'))

    expect(await saveDocument({ path: null, json })).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('n ecrit rien et leve si le document a sauvegarder est invalide', async () => {
    const writeFile = vi.fn()
    const { saveDocument } = createDocumentHandler({
      readFile: vi.fn(),
      writeFile,
      chooseOpenPath: vi.fn(),
      chooseSavePath: vi.fn(),
    })

    await expect(saveDocument({ path: '/tmp/doc.calque', json: 'pas du json' })).rejects.toThrow(/invalide/i)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('n ecrit rien et traduit sans dump un document de forme invalide', async () => {
    const writeFile = vi.fn()
    const { saveDocument } = createDocumentHandler({
      readFile: vi.fn(),
      writeFile,
      chooseOpenPath: vi.fn(),
      chooseSavePath: vi.fn(),
    })

    let messageErreur = ''
    try {
      await saveDocument({ path: '/tmp/doc.calque', json: documentJsonDeFormeInvalide() })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    verifieMessagePropre(messageErreur)
    expect(writeFile).not.toHaveBeenCalled()
  })
})
