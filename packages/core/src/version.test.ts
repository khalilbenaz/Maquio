import { describe, expect, it } from 'vitest'
import { DOCUMENT_VERSION } from './index'

// v2 (addendum navigation, 2026-09-21, §3.1) : passe de 1 a 2 avec l'ajout
// des ecrans multiples et des liens -- ce test decrivait la version v1,
// corrige pour verifier la version courante.
describe('DOCUMENT_VERSION', () => {
  it('vaut 2 pour la v2 du format (ecrans multiples et liens)', () => {
    expect(DOCUMENT_VERSION).toBe(2)
  })
})
