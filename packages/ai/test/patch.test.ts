import { describe, expect, it } from 'vitest'
import { parsePatch, InvalidPatchError } from '../src/patch'

describe('parsePatch', () => {
  it('lit un patch nu', () => {
    const p = parsePatch('{"summary":"ok","ops":[{"op":"deleteNode","nodeId":"a"}]}')
    expect(p.ops[0]).toEqual({ op: 'deleteNode', nodeId: 'a' })
  })

  it('lit un patch entoure de prose et de balises de code', () => {
    const p = parsePatch('Voici le patch :\n```json\n{"summary":"ok","ops":[]}\n```\nVoila.')
    expect(p.summary).toBe('ok')
  })

  it('rejette une operation inconnue sans appliquer les autres', () => {
    expect(() => parsePatch('{"summary":"x","ops":[{"op":"deleteNode","nodeId":"a"},{"op":"formatDisque"}]}'))
      .toThrow(InvalidPatchError)
  })

  it('rejette une reponse sans json', () => {
    expect(() => parsePatch('desole, je ne peux pas')).toThrow(InvalidPatchError)
  })

  it('rejette un document complet substitue au patch', () => {
    expect(() => parsePatch('{"version":1,"pages":[]}')).toThrow(InvalidPatchError)
  })

  // Decision 3 : le rejet de "version"+"pages" est une regle dediee, pas un
  // effet de bord de la validation stricte du schema. Ce patch a par
  // ailleurs une forme de patch valide (summary + ops vide) : il doit tout
  // de meme etre rejete.
  it('rejette un objet qui porte version et pages meme s il a par ailleurs la forme d un patch valide', () => {
    expect(() => parsePatch('{"summary":"x","ops":[],"version":1,"pages":[]}')).toThrow(InvalidPatchError)
  })

  // Decision 4 : une seule operation invalide rejette tout le patch, y
  // compris quand une operation valide la precede dans le tableau.
  it('rejette tout le patch si une operation valide precede une operation invalide', () => {
    expect(() =>
      parsePatch('{"summary":"x","ops":[{"op":"deleteNode","nodeId":"a"},{"op":"insertNode"}]}'),
    ).toThrow(InvalidPatchError)
  })

  // Decision 4 : parsePatch ne "repare" jamais un JSON malforme, meme
  // entoure de balises de code qui, elles, sont bien reconnues.
  it('rejette un JSON malforme dans un bloc de code sans tenter de le reparer', () => {
    expect(() => parsePatch('```json\n{"summary":"x","ops":[,]}\n```')).toThrow(InvalidPatchError)
  })
})
