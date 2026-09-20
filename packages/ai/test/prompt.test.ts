import { describe, expect, it } from 'vitest'
import { createDocument, createNodeCommand, History } from '@calque/core'
import type { Node } from '@calque/core'
import { buildPrompt } from '../src/prompt'

function rect(id: string, name: string): Node {
  return {
    id,
    name,
    type: 'rect',
    frame: { x: 0, y: 0, w: 10, h: 10 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    fills: [],
    strokes: [],
    cornerRadius: 0,
  }
}

describe('buildPrompt', () => {
  const doc = createDocument('Mon app')
  it('contient l instruction, le schema attendu et le document', () => {
    const p = buildPrompt({ instruction: 'ajoute un bouton', document: doc, selectionIds: [] })
    expect(p).toContain('ajoute un bouton')
    expect(p).toContain('insertNode')
    expect(p).toContain(doc.pages[0]!.id)
  })
  it('nomme explicitement la selection quand il y en a une', () => {
    const p = buildPrompt({ instruction: 'x', document: doc, selectionIds: ['a', 'b'] })
    expect(p).toContain('a, b')
  })
  it('interdit explicitement de renvoyer un document complet', () => {
    expect(buildPrompt({ instruction: 'x', document: doc, selectionIds: [] }))
      .toMatch(/jamais un document complet/i)
  })

  // Decision 6 : le modele doit connaitre les bornes du modele de donnees,
  // sous peine de produire un patch qui sera rejete.
  it('nomme les bornes du modele (couleurs, dimensions, rotation)', () => {
    const p = buildPrompt({ instruction: 'x', document: doc, selectionIds: [] })
    expect(p).toMatch(/entre 0 et 1/i) // couleurs 0..1
    expect(p.toLowerCase()).toContain('degr') // rotation en degres
    expect(p.toLowerCase()).toMatch(/positi/) // dimensions positives
  })

  // Decision 6 : quand une selection existe, c'est ELLE qui est serialisee,
  // pas le document entier - un noeud hors selection ne doit pas fuiter.
  it('serialise la selection seule, pas le reste du document', () => {
    const withNodes = createDocument('Mon app')
    const pageId = withNodes.pages[0]!.id
    const h = new History(withNodes)
    h.execute(createNodeCommand(pageId, null, rect('sel', 'NoeudSelectionne')))
    h.execute(createNodeCommand(pageId, null, rect('autre', 'NoeudHorsSelection')))

    const p = buildPrompt({ instruction: 'x', document: h.document, selectionIds: ['sel'] })
    expect(p).toContain('NoeudSelectionne')
    expect(p).not.toContain('NoeudHorsSelection')
  })
})
