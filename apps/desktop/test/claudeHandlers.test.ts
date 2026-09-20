// Decision 4 et 7 du brief : askClaude traduit les erreurs nommees en
// francais (sans jamais laisser fuiter le prompt) et rend le document
// deja patche (documentJson) en plus du resume (patchJson), calcules via
// la commande composite atomique de @calque/ai -- jamais une Command
// elle-meme (qui ne traverserait pas l'IPC).
import { describe, expect, it } from 'vitest'
import { AiService, FakeClaudeRunner } from '@calque/ai'
import { createDocument, findNode, parseDocument, serializeDocument } from '@calque/core'
import { createClaudeHandler } from '../src/main/handlers/claudeHandlers'

describe('askClaude', () => {
  it('rend le patch et le document resultant', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const runner = new FakeClaudeRunner([
      `{"summary":"ajoute un rectangle","ops":[{"op":"insertNode","parentId":null,"node":{"id":"n1","name":"R","type":"rect","frame":{"x":0,"y":0,"w":10,"h":10},"visible":true,"locked":false,"opacity":1,"rotation":0,"fills":[],"strokes":[],"cornerRadius":0}}]}`,
    ])
    const handler = createClaudeHandler({ service: new AiService(runner) })

    const result = await handler({ instruction: 'ajoute un rectangle', json: serializeDocument(doc), selectionIds: [], pageId })

    expect(JSON.parse(result.patchJson).summary).toBe('ajoute un rectangle')
    const nextDoc = parseDocument(result.documentJson)
    expect(findNode(nextDoc.pages[0]!.nodes, 'n1')).not.toBeNull()
    // Le document d'entree n'est jamais mute (voir AiService.ask) : le
    // handler n'ecrit rien non plus dans un etat partage.
    expect(doc.pages[0]!.nodes).toEqual([])
  })

  it('traduit une reponse Claude Code inexploitable sans exposer le prompt', async () => {
    const doc = createDocument('T')
    const runner = new FakeClaudeRunner(['je ne sais pas repondre'])
    const handler = createClaudeHandler({ service: new AiService(runner) })

    await expect(
      handler({ instruction: 'instruction secrete', json: serializeDocument(doc), selectionIds: [], pageId: doc.pages[0]!.id }),
    ).rejects.toThrow(/patch/i)

    try {
      await handler({ instruction: 'instruction secrete', json: serializeDocument(doc), selectionIds: [], pageId: doc.pages[0]!.id })
      throw new Error('aurait du lever')
    } catch (err) {
      expect((err as Error).message).not.toContain('instruction secrete')
    }
  })

  it('traduit une version de document incompatible', async () => {
    const runner = new FakeClaudeRunner([])
    const handler = createClaudeHandler({ service: new AiService(runner) })
    const documentFutur = JSON.stringify({ ...JSON.parse(serializeDocument(createDocument('T'))), version: 999 })

    await expect(handler({ instruction: 'x', json: documentFutur, selectionIds: [], pageId: 'p' })).rejects.toThrow(/version 999/)
  })
})
