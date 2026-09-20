import { describe, expect, it } from 'vitest'
import { createDocument, History, findNode } from '@calque/core'
import { patchToCommands } from '../src/apply'

describe('patchToCommands', () => {
  it('rend des commandes annulables', () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const h = new History(doc)
    const cmds = patchToCommands({
      summary: 'ajoute un rectangle',
      ops: [{ op: 'insertNode', parentId: null, node: { id: 'n1', name: 'R', type: 'rect', frame: { x: 0, y: 0, w: 10, h: 10 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 } }],
    }, pageId)
    cmds.forEach((c) => h.execute(c))
    expect(findNode(h.document.pages[0]!.nodes, 'n1')).not.toBeNull()
    cmds.forEach(() => h.undo())
    expect(findNode(h.document.pages[0]!.nodes, 'n1')).toBeNull()
  })

  it('refuse un patch qui reference un noeud inexistant, sans rien appliquer', () => {
    const doc = createDocument('T')
    const h = new History(doc)
    expect(() => patchToCommands({ summary: 'x', ops: [{ op: 'deleteNode', nodeId: 'fantome' }] }, doc.pages[0]!.id)
      .forEach((c) => h.execute(c))).toThrow()
    expect(h.canUndo).toBe(false)
  })

  // Decision 5, meme garantie pour updateNode : reference a un noeud
  // inexistant, l'historique doit rester vierge.
  it('refuse un updateNode qui reference un noeud inexistant, sans rien appliquer', () => {
    const doc = createDocument('T')
    const h = new History(doc)
    expect(() =>
      patchToCommands({ summary: 'x', ops: [{ op: 'updateNode', nodeId: 'fantome', patch: { name: 'X' } }] }, doc.pages[0]!.id)
        .forEach((c) => h.execute(c)),
    ).toThrow()
    expect(h.canUndo).toBe(false)
  })

  // Decision 5, meme garantie pour moveNode.
  it('refuse un moveNode qui reference un noeud inexistant, sans rien appliquer', () => {
    const doc = createDocument('T')
    const h = new History(doc)
    expect(() =>
      patchToCommands({ summary: 'x', ops: [{ op: 'moveNode', nodeId: 'fantome', parentId: null, index: 0 }] }, doc.pages[0]!.id)
        .forEach((c) => h.execute(c)),
    ).toThrow()
    expect(h.canUndo).toBe(false)
  })

  // patchToCommands elle-meme ne modifie jamais le document : construire les
  // commandes d'un patch valide, sans les executer, laisse le document et
  // l'historique intacts.
  it('ne modifie jamais le document par elle-meme', () => {
    const doc = createDocument('T')
    const h = new History(doc)
    patchToCommands({
      summary: 'ajoute',
      ops: [{ op: 'insertNode', parentId: null, node: { id: 'n1', name: 'R', type: 'rect', frame: { x: 0, y: 0, w: 10, h: 10 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [], strokes: [], cornerRadius: 0 } }],
    }, doc.pages[0]!.id)
    expect(h.document).toBe(doc)
    expect(findNode(h.document.pages[0]!.nodes, 'n1')).toBeNull()
  })

  it('traduit setTokens en commande annulable', () => {
    const doc = createDocument('T')
    const h = new History(doc)
    const cmds = patchToCommands({
      summary: 'couleur',
      ops: [{ op: 'setTokens', tokens: { spacing: { sm: 4 } } }],
    }, doc.pages[0]!.id)
    cmds.forEach((c) => h.execute(c))
    expect(h.document.tokens.spacing.sm).toBe(4)
    h.undo()
    expect(h.document.tokens.spacing.sm).toBeUndefined()
  })
})
