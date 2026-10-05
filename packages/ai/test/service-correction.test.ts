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

describe('AiService : controle de mise en page', () => {
  const doc = createDocument('T')
  const pageId = doc.pages[0]!.id
  const screenWith = (children: unknown[]) => ({
    id: 'ecran', name: 'Écran', type: 'frame', frame: { x: 0, y: 0, w: 393, h: 852 },
    visible: true, locked: false, opacity: 1, rotation: 0,
    layout: { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' },
    fills: [], strokes: [], cornerRadius: 0, clipsContent: true, children,
    device: { id: 'iphone', label: 'iPhone', width: 393, height: 852, pixelRatio: 3 },
  })
  const at = (id: string, x: number, y: number) => ({ ...textNode('left'), id, name: id, frame: { x, y, w: 200, h: 22 } })
  const patchOf = (children: unknown[]) => JSON.stringify({ summary: 's', ops: [{ op: 'insertNode', parentId: null, node: screenWith(children) }] })
  const chevauchement = patchOf([at('a', 20, 80), at('b', 22, 82)])
  const propre = patchOf([at('a', 20, 80), at('b', 20, 120)])

  it('renvoie a Claude les defauts de mise en page d un patch valide et accepte la version corrigee', async () => {
    const runner = new FakeClaudeRunner([chevauchement, propre])
    const out = await new AiService(runner).ask({ instruction: 'x', document: doc, selectionIds: [], pageId })
    expect(runner.prompts).toHaveLength(2)
    expect(runner.prompts[1]).toMatch(/défauts de mise en page/)
    expect(runner.prompts[1]).toMatch(/"a" et "b" se chevauchent/)
    expect(findNode(out.command.apply(doc).pages[0]!.nodes, 'b')?.frame.y).toBe(120)
  })

  it('garde le dernier patch valide si la correction de mise en page est inexploitable', async () => {
    const runner = new FakeClaudeRunner([chevauchement, 'je ne sais pas'])
    const out = await new AiService(runner).ask({ instruction: 'x', document: doc, selectionIds: [], pageId })
    expect(findNode(out.command.apply(doc).pages[0]!.nodes, 'b')?.frame.y).toBe(82)
  })

  it('accepte le patch malgre ses defauts une fois les corrections epuisees (jamais de rejet esthetique)', async () => {
    const runner = new FakeClaudeRunner(() => chevauchement)
    const out = await new AiService(runner).ask({ instruction: 'x', document: doc, selectionIds: [], pageId })
    expect(runner.prompts).toHaveLength(1 + MAX_CORRECTION_ROUNDS)
    expect(findNode(out.command.apply(doc).pages[0]!.nodes, 'a')).toBeDefined()
  })
})
