import { describe, expect, it } from 'vitest'
import { createDocument, serializeDocument, parseDocument, DocumentVersionError, DEVICE_PRESETS } from './document'
import { DOCUMENT_VERSION } from './version'
import type { FrameNode } from './types'

describe('createDocument', () => {
  // v2 (addendum navigation, 2026-09-21) : DOCUMENT_VERSION est passe de 1
  // a 2 (ecrans multiples et liens, §3.1 de l'addendum) -- ce test decrivait
  // l'ancien format, corrige pour verifier la version COURANTE plutot
  // qu'une valeur figee, pour ne pas se re-perimer a la prochaine version.
  it('cree un document a une page vide au format courant', () => {
    const doc = createDocument('Mon app')
    expect(doc.version).toBe(DOCUMENT_VERSION)
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
    expect(() => parseDocument(futur)).toThrow(/récente/)
  })
})

// v2 (addendum navigation, 2026-09-21, §3.1 et §8) : un document v1 (aucun
// noeud de premier niveau ne porte `device`, ce champ n'existait pas) doit
// s'ouvrir, se migrer en v2 et rester valide au schema -- sans que rien ne
// soit perdu ni deplace visuellement (memes ids, memes coordonnees pour les
// noeuds d'origine, seulement enveloppes dans un ecran).
describe('migration v1 -> v2 (parseDocument, §3.1 de l addendum navigation)', () => {
  function documentV1Json(): string {
    const doc = createDocument('Document v1')
    const page = doc.pages[0]!
    const rect1 = {
      id: 'rect1',
      name: 'rect1',
      type: 'rect' as const,
      frame: { x: 10, y: 20, w: 50, h: 50 },
      visible: true,
      locked: false,
      opacity: 1,
      rotation: 0,
      fills: [],
      strokes: [],
      cornerRadius: 0,
    }
    const docV1 = { ...doc, version: 1, pages: [{ ...page, nodes: [rect1] }] }
    return JSON.stringify(docV1)
  }

  it('enveloppe les noeuds de premier niveau d un document v1 dans un ecran unique portant le device de la page', () => {
    const migrated = parseDocument(documentV1Json())

    expect(migrated.version).toBe(DOCUMENT_VERSION)
    const page = migrated.pages[0]!
    expect(page.nodes).toHaveLength(1)

    const screen = page.nodes[0] as FrameNode
    expect(screen.type).toBe('frame')
    expect(screen.device).toEqual(page.device)
    expect(screen.frame).toEqual({ x: 0, y: 0, w: page.device.width, h: page.device.height })
    expect(screen.children).toHaveLength(1)
    expect(screen.children[0]).toMatchObject({ id: 'rect1', frame: { x: 10, y: 20, w: 50, h: 50 } })
  })

  it('le document migre reste valide au schema (aller-retour serialize/parse stable)', () => {
    const migrated = parseDocument(documentV1Json())
    expect(() => parseDocument(serializeDocument(migrated))).not.toThrow()
    expect(parseDocument(serializeDocument(migrated))).toEqual(migrated)
  })

  it('un document deja en v2 se lit tel quel, sans enveloppement supplementaire', () => {
    const doc = createDocument('Document v2')
    const json = serializeDocument(doc)
    expect(parseDocument(json)).toEqual(doc)
  })
})
