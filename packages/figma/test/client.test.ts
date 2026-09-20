import { describe, expect, it, vi } from 'vitest'
import {
  FigmaAuthError,
  FigmaClient,
  FigmaHttpError,
  FigmaNetworkError,
  FigmaNotFoundError,
  FigmaResponseError,
  parseFigmaFileKey,
} from '../src/client'

const reponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

describe('parseFigmaFileKey', () => {
  it('accepte une cle nue', () => {
    expect(parseFigmaFileKey('AbC123')).toBe('AbC123')
  })

  it('extrait la cle d une url /design/', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/AbC123/Mon-app?node-id=1-2')).toBe('AbC123')
  })

  it('extrait la cle d une url /file/', () => {
    expect(parseFigmaFileKey('https://www.figma.com/file/XyZ/Truc')).toBe('XyZ')
  })

  it('rejette une url qui n est pas figma', () => {
    expect(() => parseFigmaFileKey('https://example.com/a/b')).toThrow()
  })

  // Cas non couverts par le cahier des charges (point 7), figes ici.
  it('rejette une url figma sans cle', () => {
    expect(() => parseFigmaFileKey('https://www.figma.com/design/')).toThrow()
  })

  it('rejette une chaine vide', () => {
    expect(() => parseFigmaFileKey('')).toThrow()
  })

  it('rejette une chaine d espaces', () => {
    expect(() => parseFigmaFileKey('   ')).toThrow()
  })

  it('accepte une cle entouree d espaces apres elagage', () => {
    expect(parseFigmaFileKey('  AbC123  ')).toBe('AbC123')
  })
})

describe('FigmaClient', () => {
  it('envoie le jeton dans l en-tete X-Figma-Token', async () => {
    const fetch = vi.fn(async () => reponse(200, { document: {}, styles: {} }))
    await new FigmaClient({ token: 'secret', fetch }).getFile('K')
    expect(fetch).toHaveBeenCalledWith('https://api.figma.com/v1/files/K', {
      headers: { 'X-Figma-Token': 'secret' },
    })
  })

  it('traduit un 403 en FigmaAuthError', async () => {
    const fetch = async () => reponse(403, { err: 'Invalid token' })
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaAuthError)
  })

  it('traduit un 401 en FigmaAuthError', async () => {
    const fetch = async () => reponse(401, { err: 'Unauthorized' })
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaAuthError)
  })

  it('traduit un 404 en FigmaNotFoundError', async () => {
    const fetch = async () => reponse(404, { err: 'Not found' })
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaNotFoundError)
  })

  it('traduit un autre statut non ok en FigmaHttpError', async () => {
    const fetch = async () => reponse(500, { err: 'boom' })
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaHttpError)
  })

  it('les erreurs http portent le status', async () => {
    const fetch = async () => reponse(500, { err: 'boom' })
    try {
      await new FigmaClient({ token: 'x', fetch }).getFile('K')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(FigmaHttpError)
      expect((e as FigmaHttpError).status).toBe(500)
    }
  })

  it('ne laisse jamais le jeton apparaitre dans le message d erreur', async () => {
    const fetch = async () => reponse(500, { err: 'boom' })
    await expect(new FigmaClient({ token: 'tres-secret', fetch }).getFile('K')).rejects.toThrow(
      /^(?!.*tres-secret).*$/s,
    )
  })

  // Point 3 : verification renforcee de la non-fuite du jeton, sur tous les
  // statuts d'erreur et sur toutes les surfaces ou il pourrait fuiter
  // (message, propriete, cause).
  it.each([401, 403, 404, 500])(
    'ne laisse jamais le jeton fuiter (message, propriete, cause) pour le statut %i',
    async (status) => {
      const token = 'jeton-tres-secret-xyz'
      const fetch = async () => reponse(status, { err: 'detail contenant peut-etre le jeton ?' })
      try {
        await new FigmaClient({ token, fetch }).getFile('K')
        expect.unreachable()
      } catch (e) {
        const err = e as Error & Record<string, unknown>
        expect(err.message).not.toContain(token)
        expect(err.stack ?? '').not.toContain(token)
        for (const value of Object.values(err)) {
          expect(JSON.stringify(value ?? null)).not.toContain(token)
        }
        expect(JSON.stringify(err.cause ?? null)).not.toContain(token)
      }
    },
  )

  // Point 5 : reponse ok mais dont le corps n'a pas la forme attendue.
  it('leve FigmaResponseError si le corps ok n a pas de document', async () => {
    const fetch = async () => reponse(200, {})
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaResponseError)
  })

  it('leve FigmaResponseError si document n est pas un objet', async () => {
    const fetch = async () => reponse(200, { document: 'pas-un-objet' })
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaResponseError)
  })

  it('leve FigmaResponseError si le corps ok n est pas un objet du tout', async () => {
    const fetch = async () => reponse(200, 'oups')
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaResponseError)
  })

  // Point 6 : le fetch injecte lui-meme echoue (reseau/DNS).
  it('traduit un rejet du fetch injecte en FigmaNetworkError', async () => {
    const fetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.figma.com')
    }
    await expect(new FigmaClient({ token: 'x', fetch }).getFile('K')).rejects.toBeInstanceOf(FigmaNetworkError)
  })

  it('l echec reseau ne laisse pas fuiter le jeton', async () => {
    const token = 'jeton-reseau-secret'
    const fetch = async () => {
      throw new Error(`echec sur url avec jeton ${token}`)
    }
    try {
      await new FigmaClient({ token, fetch }).getFile('K')
      expect.unreachable()
    } catch (e) {
      const err = e as Error & Record<string, unknown>
      expect(err.message).not.toContain(token)
      expect(JSON.stringify(err.cause ?? null)).not.toContain(token)
    }
  })
})
