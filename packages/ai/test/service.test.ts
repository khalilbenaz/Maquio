import { describe, expect, it } from 'vitest'
import { createDocument, createNodeCommand, History, findNode } from '@maquio/core'
import type { Node } from '@maquio/core'
import { AiService } from '../src/service'
import { FakeClaudeRunner } from '../src/fake-runner'

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

describe('AiService', () => {
  const doc = createDocument('T')
  it('transmet l instruction et rend des commandes', async () => {
    const runner = new FakeClaudeRunner(['{"summary":"ajoute","ops":[]}'])
    const s = new AiService(runner)
    const out = await s.ask({ instruction: 'ajoute un bouton', document: doc, selectionIds: [], pageId: doc.pages[0]!.id })
    expect(runner.prompts[0]).toContain('ajoute un bouton')
    expect(out.patch.summary).toBe('ajoute')
    expect(out.commands).toEqual([])
  })

  it('remonte une reponse malformee sans toucher au document', async () => {
    const s = new AiService(new FakeClaudeRunner(['je ne sais pas']))
    await expect(s.ask({ instruction: 'x', document: doc, selectionIds: [], pageId: doc.pages[0]!.id }))
      .rejects.toThrow(/patch/i)
    // Le document passe en entree n a pas ete altere : ask() ne l a jamais
    // mute, ni directement ni via des commandes qu elle aurait executees.
    expect(doc.pages[0]!.nodes).toEqual([])
  })

  // Decision 11 : le message d erreur d une reponse malformee contient la
  // reponse brute (tronquee), c est ce que le panneau (Tache 17) affichera.
  it('inclut un extrait de la reponse brute dans l erreur de patch malforme', async () => {
    const s = new AiService(new FakeClaudeRunner(['reponse totalement incomprehensible du modele']))
    await expect(s.ask({ instruction: 'x', document: doc, selectionIds: [], pageId: doc.pages[0]!.id }))
      .rejects.toThrow(/reponse totalement incomprehensible du modele/)
  })

  // Decision 11 : ask() n execute jamais les commandes elle-meme - elle les
  // rend a l appelant, qui garde le controle de History (annulation).
  it('ne modifie jamais le document tokens meme quand le patch est valide', async () => {
    const runner = new FakeClaudeRunner(['{"summary":"c","ops":[{"op":"setTokens","tokens":{"spacing":{"sm":4}}}]}'])
    const s = new AiService(runner)
    await s.ask({ instruction: 'x', document: doc, selectionIds: [], pageId: doc.pages[0]!.id })
    expect(doc.tokens.spacing.sm).toBeUndefined()
  })

  // Round de correction 1 : ask() rend desormais aussi `command`, la
  // composite atomique de patchToCommand - c'est elle que l'appelant doit
  // executer pour qu'un patch a plusieurs operations soit annulable en un
  // seul undo.
  it('rend une commande composite qui s execute et s annule en un seul coup', async () => {
    const withNode = createDocument('T')
    const pageId = withNode.pages[0]!.id
    const seed = new History(withNode)
    seed.execute(createNodeCommand(pageId, null, rect('a', 'Original')))
    seed.execute(createNodeCommand(pageId, null, rect('b', 'AutreOriginal')))
    const seededDoc = seed.document

    const runner = new FakeClaudeRunner([
      '{"summary":"renomme a et b","ops":[{"op":"updateNode","nodeId":"a","patch":{"name":"A2"}},{"op":"updateNode","nodeId":"b","patch":{"name":"B2"}}]}',
    ])
    const s = new AiService(runner)
    const out = await s.ask({ instruction: 'renomme', document: seededDoc, selectionIds: [], pageId })

    const h = new History(seededDoc)
    h.execute(out.command)
    expect(findNode(h.document.pages[0]!.nodes, 'a')?.name).toBe('A2')
    expect(findNode(h.document.pages[0]!.nodes, 'b')?.name).toBe('B2')

    h.undo()
    expect(h.canUndo).toBe(false)
    expect(findNode(h.document.pages[0]!.nodes, 'a')?.name).toBe('Original')
    expect(findNode(h.document.pages[0]!.nodes, 'b')?.name).toBe('AutreOriginal')
  })
})
