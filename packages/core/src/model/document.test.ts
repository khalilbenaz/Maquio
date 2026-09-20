import { describe, expect, it } from 'vitest'
import { createDocument, serializeDocument, parseDocument, DocumentVersionError, DEVICE_PRESETS } from './document'

describe('createDocument', () => {
  it('cree un document a une page vide au format courant', () => {
    const doc = createDocument('Mon app')
    expect(doc.version).toBe(1)
    expect(doc.name).toBe('Mon app')
    expect(doc.pages).toHaveLength(1)
    expect(doc.pages[0]!.nodes).toEqual([])
    expect(doc.pages[0]!.device.width).toBe(393) // iPhone 15 par defaut
  })

  it('clone le preset d appareil au lieu de partager le singleton DEVICE_PRESETS', () => {
    const doc = createDocument('Mon app')
    expect(doc.pages[0]!.device).not.toBe(DEVICE_PRESETS.iphone15)
    expect(doc.pages[0]!.device).toEqual(DEVICE_PRESETS.iphone15)
  })
})

describe('serialize/parse', () => {
  it('fait un aller-retour sans perte', () => {
    const doc = createDocument('Aller-retour')
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('refuse un document d une version future', () => {
    const futur = JSON.stringify({ ...createDocument('X'), version: 99 })
    expect(() => parseDocument(futur)).toThrow(DocumentVersionError)
  })

  it('refuse un document qui ne respecte pas le schema', () => {
    expect(() => parseDocument('{"version":1,"pages":"pas un tableau"}')).toThrow()
  })

  it('refuse un document d une version anterieure, avec un message distinct de celui d une version future', () => {
    const ancien = JSON.stringify({ ...createDocument('X'), version: 0 })
    expect(() => parseDocument(ancien)).toThrow(DocumentVersionError)
    expect(() => parseDocument(ancien)).toThrow(/ancienne/)

    const futur = JSON.stringify({ ...createDocument('X'), version: 99 })
    expect(() => parseDocument(futur)).toThrow(/recente/)
  })
})
