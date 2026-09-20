// packages/core/src/commands/history.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument } from '../model/document'
import { History } from './history'
import { createNodeCommand, moveNodeCommand, deleteNodeCommand } from './edits'
import { findNode } from '../tree/tree'
import type { Node } from '../model/types'
import type { Command } from './command'

const rect: Node = {
  id: 'r1', name: 'Rectangle', type: 'rect', frame: { x: 0, y: 0, w: 10, h: 10 },
  visible: true, locked: false, opacity: 1, rotation: 0,
  fills: [], strokes: [], cornerRadius: 0,
}

describe('History', () => {
  let h: History
  let pageId: string
  beforeEach(() => {
    const doc = createDocument('Test')
    pageId = doc.pages[0]!.id
    h = new History(doc)
  })

  it('annule une creation', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    expect(findNode(h.document.pages[0]!.nodes, 'r1')).not.toBeNull()
    h.undo()
    expect(findNode(h.document.pages[0]!.nodes, 'r1')).toBeNull()
    expect(h.canRedo).toBe(true)
    h.redo()
    expect(findNode(h.document.pages[0]!.nodes, 'r1')).not.toBeNull()
  })

  it('annule un deplacement en restaurant la position exacte', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    h.execute(moveNodeCommand(pageId, 'r1', 30, 40))
    expect(findNode(h.document.pages[0]!.nodes, 'r1')!.frame).toMatchObject({ x: 30, y: 40 })
    h.undo()
    expect(findNode(h.document.pages[0]!.nodes, 'r1')!.frame).toMatchObject({ x: 0, y: 0 })
  })

  it('restaure un noeud supprime avec sa position dans la fratrie', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    h.execute(createNodeCommand(pageId, null, { ...rect, id: 'r2' }))
    h.execute(deleteNodeCommand(pageId, 'r1'))
    h.undo()
    expect(h.document.pages[0]!.nodes.map((n) => n.id)).toEqual(['r1', 'r2'])
  })

  it('vide la pile de retablissement apres une nouvelle commande', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    h.undo()
    h.execute(createNodeCommand(pageId, null, { ...rect, id: 'r3' }))
    expect(h.canRedo).toBe(false)
  })

  it('ne fait rien quand il n y a rien a annuler', () => {
    expect(h.canUndo).toBe(false)
    expect(() => h.undo()).not.toThrow()
  })

  it('ne fait rien quand il n y a rien a retablir', () => {
    expect(h.canRedo).toBe(false)
    expect(() => h.redo()).not.toThrow()
  })

  // --- Tests complementaires (decisions du cahier des charges) ---

  it('reste inchangee si apply leve : atomicite (point 3)', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    const docAvant = h.document
    const undoLabelsAvant = h.undoLabels

    const throwingCommand: Command = {
      label: 'Echoue toujours',
      apply(): never {
        throw new Error('boom')
      },
      invert(): Command {
        return throwingCommand
      },
    }

    expect(() => h.execute(throwingCommand)).toThrow('boom')
    expect(h.document).toBe(docAvant)
    expect(h.undoLabels).toEqual(undoLabelsAvant)
    expect(h.canRedo).toBe(false)
  })

  it('undoLabels rend les libelles du plus recent au plus ancien (point 5)', () => {
    h.execute(createNodeCommand(pageId, null, rect))
    h.execute(moveNodeCommand(pageId, 'r1', 5, 5))
    h.execute(deleteNodeCommand(pageId, 'r1'))
    expect(h.undoLabels).toEqual(['Supprimer', 'Deplacer', 'Creer'])
  })
})
