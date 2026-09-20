import { describe, expect, it } from 'vitest'
import { createDocument } from '../model/document'
import { findNode, findParent, absoluteFrame, NodeNotFoundError, NotAFrameError } from '../tree/tree'
import { PageNotFoundError, InvalidPatchError, MixedParentsError, EmptySelectionError } from './command'
import {
  createNodeCommand,
  deleteNodeCommand,
  moveNodeCommand,
  resizeNodeCommand,
  reparentNodeCommand,
  updateNodeCommand,
  setTextCommand,
  groupCommand,
  ungroupCommand,
  setLayoutCommand,
  setTokensCommand,
} from './edits'
import type { CalqueDocument, FrameNode, Node, TextNode } from '../model/types'

function rect(id: string, x: number, y: number, w = 10, h = 10): Node {
  return {
    id, name: id, type: 'rect', frame: { x, y, w, h },
    visible: true, locked: false, opacity: 1, rotation: 0,
    fills: [], strokes: [], cornerRadius: 0,
  }
}

function baseDoc(): { doc: CalqueDocument; pageId: string } {
  const doc = createDocument('Test')
  return { doc, pageId: doc.pages[0]!.id }
}

describe('createNodeCommand / deleteNodeCommand', () => {
  it('cree un noeud a la racine puis le supprime', () => {
    const { doc, pageId } = baseDoc()
    const created = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(findNode(created.pages[0]!.nodes, 'a')).not.toBeNull()

    const deleted = deleteNodeCommand(pageId, 'a').apply(created)
    expect(findNode(deleted.pages[0]!.nodes, 'a')).toBeNull()
  })

  it("l'inverse d'une creation est une suppression, celui d'une suppression une creation a la meme position (point 11)", () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const withAB = createNodeCommand(pageId, null, rect('b', 0, 0)).apply(withA)
    const withABC = createNodeCommand(pageId, null, rect('c', 0, 0)).apply(withAB)

    const del = deleteNodeCommand(pageId, 'b')
    const inverse = del.invert(withABC)
    const afterDelete = del.apply(withABC)
    expect(afterDelete.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'c'])

    const restored = inverse.apply(afterDelete)
    expect(restored.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('moveNodeCommand (deplacement relatif)', () => {
  it('deplace un noeud de dx,dy et s inverse en negant le deplacement', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const cmd = moveNodeCommand(pageId, 'a', 30, 40)
    const inverse = cmd.invert(withA)
    const moved = cmd.apply(withA)
    expect(findNode(moved.pages[0]!.nodes, 'a')!.frame).toMatchObject({ x: 30, y: 40 })

    const back = inverse.apply(moved)
    expect(findNode(back.pages[0]!.nodes, 'a')!.frame).toMatchObject({ x: 0, y: 0 })
  })
})

describe('resizeNodeCommand (cadre final absolu au sein du parent)', () => {
  it('remplace le cadre puis restaure l ancien via invert', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const cmd = resizeNodeCommand(pageId, 'a', { x: 5, y: 5, w: 20, h: 20 })
    const inverse = cmd.invert(withA)
    const resized = cmd.apply(withA)
    expect(findNode(resized.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 5, y: 5, w: 20, h: 20 })

    const back = inverse.apply(resized)
    expect(findNode(back.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })
})

describe('reparentNodeCommand', () => {
  it('deplace un noeud vers une nouvelle frame puis restaure parent+index via invert', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(d)
    d = createNodeCommand(pageId, null, rect('b', 0, 0)).apply(d)

    const cmd = reparentNodeCommand(pageId, 'b', 'f', 0)
    const inverse = cmd.invert(d)
    const moved = cmd.apply(d)
    expect(findParent(moved.pages[0]!.nodes, 'b')?.id).toBe('f')

    const back = inverse.apply(moved)
    expect(findParent(back.pages[0]!.nodes, 'b')).toBeNull()
    expect(back.pages[0]!.nodes.map((n) => n.id)).toEqual(['f', 'a', 'b'])
  })
})

describe('updateNodeCommand (point 6)', () => {
  it('fusionne le patch, valide via nodeSchema, et restaure les valeurs precedentes via invert', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const cmd = updateNodeCommand(pageId, 'a', { opacity: 0.5, name: 'Renomme' })
    const inverse = cmd.invert(withA)
    const updated = cmd.apply(withA)
    const node = findNode(updated.pages[0]!.nodes, 'a')!
    expect(node.opacity).toBe(0.5)
    expect(node.name).toBe('Renomme')

    const back = inverse.apply(updated)
    const restored = findNode(back.pages[0]!.nodes, 'a')!
    expect(restored.opacity).toBe(1)
    expect(restored.name).toBe('a')
  })

  it('refuse un patch qui changerait le type', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => updateNodeCommand(pageId, 'a', { type: 'text' }).apply(withA)).toThrow(InvalidPatchError)
  })

  it('refuse un patch qui changerait l id', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => updateNodeCommand(pageId, 'a', { id: 'autre' }).apply(withA)).toThrow(InvalidPatchError)
  })

  it('leve sans toucher au document si le noeud fusionne echoue la validation du schema', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => updateNodeCommand(pageId, 'a', { opacity: 5 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })
})

describe('setTextCommand', () => {
  it('modifie les caracteres d un noeud texte et s inverse', () => {
    const { doc, pageId } = baseDoc()
    const textNode: TextNode = {
      id: 't', name: 't', type: 'text', frame: { x: 0, y: 0, w: 10, h: 10 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      characters: 'avant',
      style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 400, lineHeight: 1, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
    }
    const withT = createNodeCommand(pageId, null, textNode).apply(doc)
    const cmd = setTextCommand(pageId, 't', 'apres')
    const inverse = cmd.invert(withT)
    const changed = cmd.apply(withT)
    expect((findNode(changed.pages[0]!.nodes, 't') as TextNode).characters).toBe('apres')

    const back = inverse.apply(changed)
    expect((findNode(back.pages[0]!.nodes, 't') as TextNode).characters).toBe('avant')
  })
})

describe('groupCommand (point 7)', () => {
  it('cree une frame dont le cadre est l union des selectionnes et reparente en coordonnees relatives', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)

    const cmd = groupCommand(pageId, ['a', 'b'])
    const grouped = cmd.apply(d)

    expect(grouped.pages[0]!.nodes).toHaveLength(1)
    const groupFrame = grouped.pages[0]!.nodes[0] as FrameNode
    expect(groupFrame.type).toBe('frame')
    expect(groupFrame.name).toBe('Groupe')
    expect(groupFrame.layout.mode).toBe('absolute')
    expect(groupFrame.clipsContent).toBe(false)
    expect(groupFrame.frame).toEqual({ x: 0, y: 0, w: 30, h: 40 })

    const a = findNode(grouped.pages[0]!.nodes, 'a')!
    const b = findNode(grouped.pages[0]!.nodes, 'b')!
    expect(a.frame).toMatchObject({ x: 0, y: 0 })
    expect(b.frame).toMatchObject({ x: 20, y: 30 })
    expect(findParent(grouped.pages[0]!.nodes, 'a')?.id).toBe(groupFrame.id)
    expect(findParent(grouped.pages[0]!.nodes, 'b')?.id).toBe(groupFrame.id)

    // Le cadre absolu des enfants n a pas bouge malgre le changement de parent.
    expect(absoluteFrame(grouped.pages[0]!.nodes, 'a')).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(absoluteFrame(grouped.pages[0]!.nodes, 'b')).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })

  it('refuse de grouper des noeuds qui n ont pas le meme parent', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    let d = createNodeCommand(pageId, null, frameNode).apply(doc)
    d = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(d)
    d = createNodeCommand(pageId, 'f', rect('c', 0, 0)).apply(d)

    expect(() => groupCommand(pageId, ['a', 'c']).apply(d)).toThrow(MixedParentsError)
  })

  it("l'inverse d'un groupCommand est un ungroupCommand sur la frame creee", () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)

    const cmd = groupCommand(pageId, ['a', 'b'])
    const inverse = cmd.invert(d)
    const grouped = cmd.apply(d)
    const ungrouped = inverse.apply(grouped)

    expect(ungrouped.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(findNode(ungrouped.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findNode(ungrouped.pages[0]!.nodes, 'b')!.frame).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })
})

describe('groupCommand - selection vide vs selection a un seul noeud (round de correction 1)', () => {
  it('leve EmptySelectionError sur une selection vide', () => {
    const { doc, pageId } = baseDoc()
    expect(() => groupCommand(pageId, []).apply(doc)).toThrow(EmptySelectionError)
  })

  it('accepte une selection a un seul noeud (grouper un element seul est legitime)', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const grouped = groupCommand(pageId, ['a']).apply(withA)
    const groupFrame = grouped.pages[0]!.nodes[0] as FrameNode
    expect(groupFrame.type).toBe('frame')
    expect(groupFrame.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findParent(grouped.pages[0]!.nodes, 'a')?.id).toBe(groupFrame.id)
  })
})

describe('validation partagee des noeuds modifies en place (round de correction 1)', () => {
  it('resizeNodeCommand refuse une largeur negative sans toucher au document', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: -10, h: 10 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })

  it('resizeNodeCommand refuse une hauteur negative sans toucher au document', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    const before = JSON.stringify(withA)
    expect(() => resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: 10, h: -10 }).apply(withA)).toThrow()
    expect(JSON.stringify(withA)).toBe(before)
  })

  it('moveNodeCommand, resizeNodeCommand et updateNodeCommand preservent le partage structurel d une branche soeur non touchee', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 20, 10, 10)).apply(d)
    const untouchedSibling = findNode(d.pages[0]!.nodes, 'b')

    const afterMove = moveNodeCommand(pageId, 'a', 1, 1).apply(d)
    expect(findNode(afterMove.pages[0]!.nodes, 'b')).toBe(untouchedSibling)

    const afterResize = resizeNodeCommand(pageId, 'a', { x: 0, y: 0, w: 5, h: 5 }).apply(d)
    expect(findNode(afterResize.pages[0]!.nodes, 'b')).toBe(untouchedSibling)

    const afterUpdate = updateNodeCommand(pageId, 'a', { name: 'Renomme' }).apply(d)
    expect(findNode(afterUpdate.pages[0]!.nodes, 'b')).toBe(untouchedSibling)
  })
})

describe('ungroupCommand (point 8)', () => {
  it('remonte les enfants a la place de la frame, en coordonnees relatives au nouveau parent', () => {
    const { doc, pageId } = baseDoc()
    let d = createNodeCommand(pageId, null, rect('a', 0, 0, 10, 10)).apply(doc)
    d = createNodeCommand(pageId, null, rect('b', 20, 30, 10, 10)).apply(d)
    const grouped = groupCommand(pageId, ['a', 'b']).apply(d)
    const groupId = grouped.pages[0]!.nodes[0]!.id

    const ungrouped = ungroupCommand(pageId, groupId).apply(grouped)
    expect(findNode(ungrouped.pages[0]!.nodes, groupId)).toBeNull()
    expect(ungrouped.pages[0]!.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(findNode(ungrouped.pages[0]!.nodes, 'a')!.frame).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(findNode(ungrouped.pages[0]!.nodes, 'b')!.frame).toEqual({ x: 20, y: 30, w: 10, h: 10 })
  })

  it('leve NotAFrameError si l identifiant ne designe pas une frame', () => {
    const { doc, pageId } = baseDoc()
    const withA = createNodeCommand(pageId, null, rect('a', 0, 0)).apply(doc)
    expect(() => ungroupCommand(pageId, 'a').apply(withA)).toThrow(NotAFrameError)
  })
})

describe('setLayoutCommand', () => {
  it('remplace la disposition d une frame et s inverse', () => {
    const { doc, pageId } = baseDoc()
    const frameNode: FrameNode = {
      id: 'f', name: 'f', type: 'frame', frame: { x: 0, y: 0, w: 100, h: 100 },
      visible: true, locked: false, opacity: 1, rotation: 0,
      layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
      fills: [], strokes: [], cornerRadius: 0, clipsContent: false, children: [],
    }
    const withF = createNodeCommand(pageId, null, frameNode).apply(doc)
    const newLayout = { mode: 'row' as const, gap: 8, padding: { top: 1, right: 2, bottom: 3, left: 4 }, alignMain: 'center' as const, alignCross: 'stretch' as const }
    const cmd = setLayoutCommand(pageId, 'f', newLayout)
    const inverse = cmd.invert(withF)
    const changed = cmd.apply(withF)
    expect((findNode(changed.pages[0]!.nodes, 'f') as FrameNode).layout).toEqual(newLayout)

    const back = inverse.apply(changed)
    expect((findNode(back.pages[0]!.nodes, 'f') as FrameNode).layout.mode).toBe('absolute')
  })
})

describe('setTokensCommand', () => {
  it('fusionne les tokens et s inverse en restaurant les tokens precedents', () => {
    const { doc } = baseDoc()
    const cmd = setTokensCommand({ spacing: { sm: 4 } })
    const inverse = cmd.invert(doc)
    const changed = cmd.apply(doc)
    expect(changed.tokens.spacing).toEqual({ sm: 4 })

    const back = inverse.apply(changed)
    expect(back.tokens).toEqual(doc.tokens)
  })
})

describe('point 12 : erreurs nommees sur toutes les fabriques', () => {
  it('leve PageNotFoundError quand pageId est introuvable', () => {
    const { doc } = baseDoc()
    expect(() => moveNodeCommand('page-inexistante', 'a', 1, 1).apply(doc)).toThrow(PageNotFoundError)
  })

  it('chaque fabrique leve NodeNotFoundError quand l id vise est introuvable', () => {
    const { doc, pageId } = baseDoc()
    expect(() => moveNodeCommand(pageId, 'x', 1, 1).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => deleteNodeCommand(pageId, 'x').apply(doc)).toThrow(NodeNotFoundError)
    expect(() => resizeNodeCommand(pageId, 'x', { x: 0, y: 0, w: 1, h: 1 }).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => reparentNodeCommand(pageId, 'x', null, 0).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => updateNodeCommand(pageId, 'x', {}).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => setTextCommand(pageId, 'x', 'y').apply(doc)).toThrow(NodeNotFoundError)
    expect(() => createNodeCommand(pageId, 'x', rect('a', 0, 0)).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => groupCommand(pageId, ['x']).apply(doc)).toThrow(NodeNotFoundError)
    expect(() => ungroupCommand(pageId, 'x').apply(doc)).toThrow(NodeNotFoundError)
    expect(() =>
      setLayoutCommand(pageId, 'x', { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' }).apply(doc),
    ).toThrow(NodeNotFoundError)
  })
})
