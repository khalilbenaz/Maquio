import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { documentSchema, parseDocument, serializeDocument } from '@maquio/core'
import type { Node } from '@maquio/core'
import { BANQUE_ECRANS, documentBanque } from './fixtures/banque'

const walk = (nodes: Node[], f: (n: Node) => void): void => nodes.forEach((n) => { f(n); if (n.type === 'frame') walk(n.children, f) })

describe('prototype bancaire', () => {
  const doc = documentBanque()
  it('est valide et fait l aller-retour', () => {
    expect(documentSchema.safeParse(doc).success).toBe(true)
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })
  it('compte les 16 ecrans de la maquette (390 x 844) et la barre d onglets', () => {
    const ecrans = doc.pages[0]!.nodes
    expect(ecrans.length).toBe(BANQUE_ECRANS().length)
    expect(ecrans).toHaveLength(17)
    for (const e of ecrans.slice(0, 16)) expect([e.frame.w, e.frame.h]).toEqual([390, 844])
    expect(ecrans[16]!.frame.h).toBe(96)
  })
  it('n emploie que des composants et conteneurs semantiques du catalogue, et des textes Geist', () => {
    const kinds = new Set<string>()
    const fonts = new Set<string>()
    walk(doc.pages[0]!.nodes, (n) => {
      if (n.type === 'component') kinds.add(n.kind)
      if (n.type === 'text') fonts.add(n.style.fontFamily)
    })
    for (const k of ['button', 'bottomNav', 'icon', 'switch', 'progressBar']) expect(kinds.has(k), k).toBe(true)
    expect([...fonts]).toEqual(['Geist'])
  })
  it('n a aucune cible d interaction orpheline', () => {
    const ids = new Set<string>()
    walk(doc.pages[0]!.nodes, (n) => ids.add(n.id))
    walk(doc.pages[0]!.nodes, (n) => n.interactions?.forEach((i) => { if ('target' in i.action) expect(ids.has(i.action.target), `${n.name}`).toBe(true) }))
  })
})

describe('fichier banque livre', () => {
  // Mise a jour : UPDATE_EXEMPLE=1 npx vitest run test/integration/banque.test.ts
  const chemin = join(__dirname, '..', '..', 'exemples', 'banque.maquio')
  const attendu = serializeDocument(documentBanque())
  it('est a jour', () => {
    if (process.env.UPDATE_EXEMPLE === '1') writeFileSync(chemin, attendu)
    expect(readFileSync(chemin, 'utf8')).toBe(attendu)
  })
  it('est deterministe', () => { expect(serializeDocument(documentBanque())).toBe(attendu) })
})
