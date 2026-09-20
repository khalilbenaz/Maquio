import { describe, expect, it } from 'vitest'
import { createDocument } from '@calque/core'
import { AiService } from '../src/service'
import { FakeClaudeRunner } from '../src/fake-runner'

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
})
