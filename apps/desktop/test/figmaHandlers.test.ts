import { describe, expect, it, vi } from 'vitest'
import { FigmaClient } from '@calque/figma'
import { parseDocument } from '@calque/core'
import {
  createFigmaHandler,
  createGetSettingsHandler,
  createSetFigmaTokenHandler,
  FigmaTokenMissingError,
} from '../src/main/handlers/figmaHandlers'
import { SecretStorageUnavailableError } from '../src/main/adapters/secretStore'
import type { SecretStore } from '../src/main/adapters/secretStore'

const reponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const fichierFigmaMinimal = {
  document: {
    id: 'doc1',
    name: 'Doc',
    type: 'DOCUMENT',
    children: [{ id: 'canvas1', name: 'Page 1', type: 'CANVAS', children: [] }],
  },
}

describe('import Figma', () => {
  it('jeton absent : erreur nommee sans tentative d import', async () => {
    const chooseFile = vi.fn()
    const readFile = vi.fn()
    const handler = createFigmaHandler({ client: null, chooseFile, readFile })

    await expect(handler({ source: 'api', fileKey: 'abc' })).rejects.toThrow(FigmaTokenMissingError)
    expect(chooseFile).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('FigmaAuthError traduite en message d interface', async () => {
    const client = new FigmaClient({ token: 'mauvais-jeton', fetch: async () => reponse(401, {}) })
    const handler = createFigmaHandler({ client, chooseFile: async () => null, readFile: async () => '' })

    await expect(handler({ source: 'api', fileKey: 'abc' })).rejects.toThrow(/jeton refusé par figma/i)
  })

  it('import reussi depuis l API : JSON de document et rapport transmis', async () => {
    const client = new FigmaClient({ token: 'jeton-valide', fetch: async () => reponse(200, fichierFigmaMinimal) })
    const handler = createFigmaHandler({ client, chooseFile: async () => null, readFile: async () => '' })

    const result = await handler({ source: 'api', fileKey: 'abc' })
    expect(result).not.toBeNull()
    const document = parseDocument(result!.json)
    expect(document.pages).toHaveLength(1)
    expect(result!.report.nodesImported).toBe(0)
    expect(result!.report.warnings).toEqual([])
  })

  it('import depuis un fichier local : rend null si l utilisateur annule le choix', async () => {
    const readFile = vi.fn()
    const handler = createFigmaHandler({ client: null, chooseFile: async () => null, readFile })

    expect(await handler({ source: 'file' })).toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('import depuis un fichier local reussi', async () => {
    const handler = createFigmaHandler({
      client: null,
      chooseFile: async () => '/tmp/fichier.json',
      readFile: async () => JSON.stringify(fichierFigmaMinimal),
    })

    const result = await handler({ source: 'file' })
    expect(result).not.toBeNull()
    expect(parseDocument(result!.json).pages).toHaveLength(1)
  })

  it('fichier local invalide : erreur en francais, aucun document rendu', async () => {
    const handler = createFigmaHandler({
      client: null,
      chooseFile: async () => '/tmp/fichier.json',
      readFile: async () => 'pas du json',
    })

    await expect(handler({ source: 'file' })).rejects.toThrow(/invalide/i)
  })

  // Round de correction 1 (Minor) : une erreur deja nommee et en francais
  // (FigmaFileInvalidError) ne doit pas se retrouver reprefixee par le
  // repli generique ("Import Figma impossible : Fichier Figma invalide :
  // ..."), ce qui produisait un double prefixe avant correction.
  it('fichier local syntaxiquement valide mais de forme invalide : message francais sans double prefixe', async () => {
    const handler = createFigmaHandler({
      client: null,
      chooseFile: async () => '/tmp/fichier.json',
      readFile: async () => JSON.stringify({ pasUnFichierFigma: true }),
    })

    let messageErreur = ''
    try {
      await handler({ source: 'file' })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    expect(messageErreur).toBe('Fichier Figma invalide : champ "document" manquant')
    expect(messageErreur).not.toContain('Import Figma impossible : Fichier Figma invalide')
  })
})

describe('reglages Figma (jeton)', () => {
  it('getSettings ne rend jamais le jeton lui-meme', async () => {
    const secretStore: SecretStore = {
      hasToken: async () => true,
      getToken: async () => 'un-jeton-secret',
      setToken: async () => {},
    }
    const handler = createGetSettingsHandler({ secretStore })

    const result = await handler()
    expect(result).toEqual({ hasFigmaToken: true })
    expect(Object.keys(result)).toEqual(['hasFigmaToken'])
    expect(JSON.stringify(result)).not.toContain('un-jeton-secret')
  })

  it('setFigmaToken traduit le refus de stockage non securise', async () => {
    const secretStore: Pick<SecretStore, 'setToken'> = {
      setToken: async () => {
        throw new SecretStorageUnavailableError()
      },
    }
    const handler = createSetFigmaTokenHandler({ secretStore })

    await expect(handler('un-jeton')).rejects.toThrow(/stockage sécurisé/i)
  })
})
