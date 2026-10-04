import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPONENT_KINDS, CONTAINER_KINDS, documentSchema, serializeDocument, parseDocument } from '@maquio/core'
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
    expect(JSON.stringify(doc)).toContain('"interactions"')
  })
})

describe('fichier d exemple livre', () => {
  // exemples/tous-les-composants.maquio est le document ci-dessus, serialise.
  // Mise a jour : UPDATE_EXEMPLE=1 npx vitest run test/integration/exemple-complet.test.ts
  const chemin = join(__dirname, '..', '..', 'exemples', 'tous-les-composants.maquio')
  const attendu = serializeDocument(documentExempleComplet())

  it('est a jour et s ouvre (migration comprise)', () => {
    if (process.env.UPDATE_EXEMPLE === '1') writeFileSync(chemin, attendu)
    const lu = readFileSync(chemin, 'utf8')
    expect(lu).toBe(attendu)
    expect(parseDocument(lu).version).toBe(4)
  })

  it('est deterministe', () => {
    expect(serializeDocument(documentExempleComplet())).toBe(attendu)
  })
})
