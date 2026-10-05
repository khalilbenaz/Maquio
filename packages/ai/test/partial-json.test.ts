import { describe, expect, it } from 'vitest'
import { parsePartialJson } from '../src/partial-json'

describe('parsePartialJson', () => {
  it('rend un JSON complet tel quel, meme entoure de prose ou d un bloc de code', () => {
    expect(parsePartialJson('Voici :\n```json\n{"a":1,"b":[1,2]}\n```')).toEqual({ a: 1, b: [1, 2] })
  })

  // L'objet en cours garde ses membres deja termines : un conteneur a moitie
  // ecrit montre deja ses enfants finis (la validation ecarte ensuite ce qui
  // est incomplet, voir preview.ts).
  it('garde les objets termines d un tableau en cours et les membres finis de celui qui s ecrit', () => {
    expect(parsePartialJson('{"node":{"id":"e","children":[{"id":"a","w":1},{"id":"b","w":2},{"id":"c","w"')).toEqual({
      node: { id: 'e', children: [{ id: 'a', w: 1 }, { id: 'b', w: 2 }, { id: 'c' }] },
    })
  })

  it('ignore une chaine coupee et une cle sans valeur', () => {
    expect(parsePartialJson('{"name":"Écran","title":"Bonj')).toEqual({ name: 'Écran' })
    expect(parsePartialJson('{"name":"Écran","frame":')).toEqual({ name: 'Écran' })
  })

  it('ne se trompe pas sur les accolades et guillemets a l interieur des chaines', () => {
    expect(parsePartialJson('{"t":"a } \\" [ {","u":[{"v":"x"}')).toEqual({ t: 'a } " [ {', u: [{ v: 'x' }] })
  })

  it('rend null sans objet exploitable', () => {
    expect(parsePartialJson('Je réfléchis')).toBeNull()
    expect(parsePartialJson('{"na')).toEqual({})
  })
})
