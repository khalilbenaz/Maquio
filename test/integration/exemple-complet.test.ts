import { describe, expect, it } from 'vitest'
import { COMPONENT_KINDS, CONTAINER_KINDS, documentSchema, serializeDocument, parseDocument } from '@calque/core'
import { documentExempleComplet, kindsPresents } from './fixtures/exemple-complet'

describe('projet d exemple « tous les composants »', () => {
  const doc = documentExempleComplet()

  it('est un document valide, qui fait l aller-retour sans perte', () => {
    expect(documentSchema.safeParse(doc).success).toBe(true)
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('contient chaque composant et chaque conteneur du catalogue', () => {
    const presents = kindsPresents(doc)
    for (const kind of [...COMPONENT_KINDS, ...CONTAINER_KINDS]) expect(presents.has(kind), kind).toBe(true)
  })

  it('compte trois ecrans relies par des liens', () => {
    expect(doc.pages[0]!.nodes).toHaveLength(3)
    expect(JSON.stringify(doc)).toContain('"link"')
  })
})
