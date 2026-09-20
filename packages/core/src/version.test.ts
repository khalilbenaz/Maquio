import { describe, expect, it } from 'vitest'
import { DOCUMENT_VERSION } from './index'

describe('DOCUMENT_VERSION', () => {
  it('vaut 1 pour la v1 du format', () => {
    expect(DOCUMENT_VERSION).toBe(1)
  })
})
