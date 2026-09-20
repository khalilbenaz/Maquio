import { describe, expect, it } from 'vitest'
import { createDocument, createNodeCommand, History, findNode } from '@calque/core'
import type { Node } from '@calque/core'
import { patchToCommand, patchToCommands } from '../src/apply'

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

// Round de correction 1 (Critical) : patchToCommands + forEach(execute) sur
// un patch a plusieurs operations n'est pas atomique. patchToCommand rend
// une commande composite qui, elle, l'est.
describe('patchToCommand', () => {
  // Reproduction exacte du cas du relecteur : document avec un noeud 'a',
  // patch [updateNode(a), deleteNode(fantome), updateNode(a)]. Avant ce
  // correctif, updateNode(a) s'executait, deleteNode(fantome) levait, et le
  // document restait modifie avec un historique non vierge.
  it('leve sans rien appliquer quand une operation du milieu du patch echoue', () => {
    const base = createDocument('T')
    const pageId = base.pages[0]!.id
    const seed = new History(base)
    seed.execute(createNodeCommand(pageId, null, rect('a', 'Original')))
    const doc = seed.document

    const patch = {
      summary: 'renomme deux fois puis supprime un fantome',
      ops: [
        { op: 'updateNode' as const, nodeId: 'a', patch: { name: 'Modifie1' } },
        { op: 'deleteNode' as const, nodeId: 'fantome' },
        { op: 'updateNode' as const, nodeId: 'a', patch: { name: 'Modifie2' } },
      ],
    }

    const h = new History(doc)
    expect(() => h.execute(patchToCommand(patch, pageId, doc))).toThrow()

    // Le document est reste STRICTEMENT identique (meme reference, comme
    // avant tout essai) et l'historique vierge.
    expect(h.document).toBe(doc)
    expect(h.canUndo).toBe(false)
    const node = findNode(h.document.pages[0]!.nodes, 'a')
    expect(node?.name).toBe('Original')
  })

  it('leve immediatement a la construction, avant meme d etre executee', () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    expect(() =>
      patchToCommand({ summary: 'x', ops: [{ op: 'deleteNode', nodeId: 'fantome' }] }, pageId, doc),
    ).toThrow()
  })

  // Un patch valide a plusieurs operations doit s'annuler en UN SEUL undo
  // et se retablir en UN SEUL redo : l'utilisateur ne doit pas avoir a
  // appuyer sur Ctrl-Z une fois par operation du patch.
  it('un patch valide a plusieurs operations s annule en un seul undo et se retablit en un seul redo', () => {
    const base = createDocument('T')
    const pageId = base.pages[0]!.id
    const seed = new History(base)
    seed.execute(createNodeCommand(pageId, null, rect('a', 'Original')))
    seed.execute(createNodeCommand(pageId, null, rect('b', 'AutreOriginal')))
    const doc = seed.document

    const patch = {
      summary: 'renomme a et b',
      ops: [
        { op: 'updateNode' as const, nodeId: 'a', patch: { name: 'A2' } },
        { op: 'updateNode' as const, nodeId: 'b', patch: { name: 'B2' } },
      ],
    }

    const h = new History(doc)
    h.execute(patchToCommand(patch, pageId, doc))
    expect(findNode(h.document.pages[0]!.nodes, 'a')?.name).toBe('A2')
    expect(findNode(h.document.pages[0]!.nodes, 'b')?.name).toBe('B2')

    h.undo()
    expect(h.canUndo).toBe(false)
    expect(findNode(h.document.pages[0]!.nodes, 'a')?.name).toBe('Original')
    expect(findNode(h.document.pages[0]!.nodes, 'b')?.name).toBe('AutreOriginal')

    h.redo()
    expect(findNode(h.document.pages[0]!.nodes, 'a')?.name).toBe('A2')
    expect(findNode(h.document.pages[0]!.nodes, 'b')?.name).toBe('B2')
  })

  it('a pour label le resume du patch', () => {
    const doc = createDocument('T')
    const cmd = patchToCommand({ summary: 'Ajoute une barre de navigation', ops: [] }, doc.pages[0]!.id, doc)
    expect(cmd.label).toBe('Ajoute une barre de navigation')
  })
})
