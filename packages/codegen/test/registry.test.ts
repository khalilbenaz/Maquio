import { describe, expect, it } from 'vitest'
import { getExporter, listExporters } from '../src/registry'

describe('registre', () => {
  it('expose les quatre exportateurs avec leur maturite', () => {
    expect(listExporters().map((e) => [e.id, e.maturity])).toEqual([
      ['flutter', 'complete'], ['react-native', 'complete'],
      ['swiftui', 'preview'], ['compose', 'preview'],
    ])
  })
  it('leve sur un identifiant inconnu', () => {
    // @ts-expect-error identifiant volontairement invalide
    expect(() => getExporter('cobol')).toThrow()
  })
})
