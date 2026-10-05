// Boucle de correction du pont Claude Code : un patch rejete (forme
// invalide ou operation inapplicable) est renvoye a Claude avec la liste
// precise des problemes, au lieu d'echouer des le premier essai.
import { describe, expect, it } from 'vitest'
import { createDocument, findNode } from '@maquio/core'
import { AiService, ClaudePatchRejectedError, MAX_CORRECTION_ROUNDS } from '../src/service'
import { FakeClaudeRunner } from '../src/fake-runner'

function textNode(align: string) {
  return {
    id: 't1',
    name: 'Titre',
    type: 'text',
    frame: { x: 0, y: 0, w: 100, h: 20 },
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    characters: 'Solde',
    style: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 20,
      letterSpacing: 0,
      color: { r: 0, g: 0, b: 0, a: 1 },
      align,
    },
  }
}

function insertPatch(align: string): string {
  return JSON.stringify({ summary: 'ajoute', ops: [{ op: 'insertNode', parentId: null, node: textNode(align) }] })
}

describe('AiService : boucle de correction', () => {
  const doc = createDocument('T')
  const pageId = doc.pages[0]!.id

  it('renvoie a Claude les problemes du patch rejete et accepte la version corrigee', async () => {
    const runner = new FakeClaudeRunner([insertPatch('start'), insertPatch('left')])
    const out = await new AiService(runner).ask({ instruction: 'ajoute', document: doc, selectionIds: [], pageId })

    expect(runner.prompts).toHaveLength(2)
    const correction = runner.prompts[1]!
    // Le chemin fautif, la valeur recue et les valeurs autorisees.
    expect(correction).toContain('ops[0].node.style.align')
    expect(correction).toContain('"start"')
    expect(correction).toMatch(/"left".*"center".*"right"/)
    // La reponse precedente est rappelee pour que Claude la corrige.
    expect(correction).toContain(insertPatch('start'))
    expect(findNode(out.command.apply(doc).pages[0]!.nodes, 't1')).toBeDefined()
  })

  it('corrige aussi une operation qui echoue a l application (noeud inexistant)', async () => {
    const runner = new FakeClaudeRunner([
      '{"summary":"x","ops":[{"op":"deleteNode","nodeId":"absent"}]}',
      '{"summary":"x","ops":[]}',
    ])
    await new AiService(runner).ask({ instruction: 'x', document: doc, selectionIds: [], pageId })
    expect(runner.prompts).toHaveLength(2)
    expect(runner.prompts[1]).toContain('absent')
  })

  it('abandonne apres le nombre maximal de corrections et rend la derniere reponse brute', async () => {
    const runner = new FakeClaudeRunner(() => insertPatch('justify'))
    const err = await new AiService(runner)
      .ask({ instruction: 'x', document: doc, selectionIds: [], pageId })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudePatchRejectedError)
    expect((err as ClaudePatchRejectedError).rawResponse).toBe(insertPatch('justify'))
    expect(runner.prompts).toHaveLength(1 + MAX_CORRECTION_ROUNDS)
  })

  it('ne relance pas Claude quand la demande a ete annulee', async () => {
    const controller = new AbortController()
    const runner = new FakeClaudeRunner(() => {
      controller.abort()
      return insertPatch('start')
    })
    await expect(
      new AiService(runner).ask({ instruction: 'x', document: doc, selectionIds: [], pageId }, controller.signal),
    ).rejects.toThrow()
    expect(runner.prompts).toHaveLength(1)
  })
})
