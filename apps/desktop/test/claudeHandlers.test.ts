// Decision 4 et 7 du brief : askClaude traduit les erreurs nommees en
// francais (sans jamais laisser fuiter le prompt) et rend le document
// deja patche (documentJson) en plus du resume (patchJson), calcules via
// la commande composite atomique de @maquio/ai -- jamais une Command
// elle-meme (qui ne traverserait pas l'IPC).
//
// Reparation du pont : deux blocs de tests ajoutes -- l'annulation reelle
// via cancelClaude (point 2) et le message clair (sans dump de validateur)
// quand Claude Code renvoie un noeud de forme invalide (point 4), en
// reproduisant EXACTEMENT le cas constate en conditions reelles (un texte
// a plat, x/y/width/height/fontSize hors de leurs objets imbriques -- voir
// le rapport de diagnostic).
import { describe, expect, it, vi } from 'vitest'
import { AiService, FakeClaudeRunner } from '@maquio/ai'
import type { ClaudeRunner } from '@maquio/ai'
import { createDocument, findNode, parseDocument, serializeDocument } from '@maquio/core'
import { ClaudeRequestTracker, createClaudeCancelHandler, createClaudeHandler } from '../src/main/handlers/claudeHandlers'
import { documentJsonDeFormeInvalide } from './helpers/documentJsonInvalide'

// Round de correction 1 (Critical) : un ZodError (schema invalide) ne doit
// jamais remonter sous forme de dump JSON technique.
function verifieMessagePropre(message: string): void {
  expect(message).not.toContain('{')
  expect(message).not.toContain('"code"')
  expect(message).not.toContain('invalid_type')
}

function creerHandler(runner: ClaudeRunner, requests = new ClaudeRequestTracker()) {
  return { handler: createClaudeHandler({ service: new AiService(runner), requests }), requests }
}

describe('askClaude', () => {
  it('rend le patch et le document resultant', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const runner = new FakeClaudeRunner([
      `{"summary":"ajoute un rectangle","ops":[{"op":"insertNode","parentId":null,"node":{"id":"n1","name":"R","type":"rect","frame":{"x":0,"y":0,"w":10,"h":10},"visible":true,"locked":false,"opacity":1,"rotation":0,"fills":[],"strokes":[],"cornerRadius":0}}]}`,
    ])
    const { handler } = creerHandler(runner)

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
    const { handler } = creerHandler(runner)

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
    const { handler } = creerHandler(runner)
    const documentFutur = JSON.stringify({ ...JSON.parse(serializeDocument(createDocument('T'))), version: 999 })

    await expect(handler({ instruction: 'x', json: documentFutur, selectionIds: [], pageId: 'p' })).rejects.toThrow(/version 999/)
  })

  it('traduit un document d entree syntaxiquement valide mais de forme invalide sans dump technique', async () => {
    const runner = new FakeClaudeRunner([])
    const { handler } = creerHandler(runner)

    let messageErreur = ''
    try {
      await handler({ instruction: 'x', json: documentJsonDeFormeInvalide(), selectionIds: [], pageId: 'p' })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    verifieMessagePropre(messageErreur)
  })

  // Round de correction 1 (Critical) : un patch dont l'operation
  // updateNode merge un champ hors bornes (opacity > 1) fait echouer
  // nodeSchema.parse a l'interieur de patchToCommand -- un ZodError brut
  // qui, avant correction, traversait translateClaudeError sans aucune
  // reconnaissance ni prefixe.
  it('traduit sans dump technique un patch dont le noeud fusionne est invalide', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const runner = new FakeClaudeRunner([
      `{"summary":"c","ops":[` +
        `{"op":"insertNode","parentId":null,"node":{"id":"n1","name":"R","type":"rect","frame":{"x":0,"y":0,"w":10,"h":10},"visible":true,"locked":false,"opacity":1,"rotation":0,"fills":[],"strokes":[],"cornerRadius":0}},` +
        `{"op":"updateNode","nodeId":"n1","patch":{"opacity":5}}` +
        `]}`,
    ])
    const { handler } = creerHandler(runner)

    let messageErreur = ''
    try {
      await handler({ instruction: 'x', json: serializeDocument(doc), selectionIds: [], pageId })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }
    verifieMessagePropre(messageErreur)
  })

  // Point 4 (reparation du pont) : reproduit EXACTEMENT le noeud invente
  // par Claude Code en conditions reelles (voir le rapport de diagnostic)
  // -- x/y/width/height et fontSize a plat, "text" au lieu de
  // "characters", aucun "frame"/"style" imbrique. Avant la reparation,
  // service.ts propageait `result.error.message` de Zod tel quel (format
  // `path ["ops",0,"node","frame"] Required`, en anglais) : ce test
  // verifie que le message final est desormais une phrase francaise
  // propre (verifieMessagePropre) ET que la reponse brute reste
  // consultable (elle contient l'id du noeud invente par le modele).
  it('traduit en francais clair un patch dont le noeud a une forme inventee, tout en gardant la reponse brute consultable', async () => {
    const doc = createDocument('T')
    const pageId = doc.pages[0]!.id
    const reponseInventee = JSON.stringify({
      summary: 'ajoute un titre',
      ops: [
        {
          op: 'insertNode',
          parentId: null,
          index: 0,
          node: {
            id: 'text-bienvenue-001',
            name: 'Titre Bienvenue',
            x: 16,
            y: 60,
            width: 361,
            height: 40,
            text: 'Bienvenue',
            fontSize: 32,
            fontWeight: 700,
            fontFamily: 'Inter',
            textAlign: 'center',
            color: { r: 0, g: 0, b: 0, a: 1 },
          },
        },
      ],
    })
    const runner = new FakeClaudeRunner([reponseInventee])
    const { handler } = creerHandler(runner)

    let messageErreur = ''
    try {
      await handler({ instruction: "ajoute un titre 'Bienvenue'", json: serializeDocument(doc), selectionIds: [], pageId })
      throw new Error('aurait du lever')
    } catch (err) {
      messageErreur = (err as Error).message
    }

    // Jamais le code technique brut d'une ZodError (verifieMessagePropre
    // ne convient pas ici telle quelle : la reponse brute, elle,
    // CONTIENT legitimement des accolades JSON -- voir plus bas -- ce
    // n'est que l'EXPLICATION qui doit en rester exempte).
    expect(messageErreur).not.toContain('"code"')
    expect(messageErreur).not.toContain('invalid_type')
    // Jamais le format brut de ZodError (anglais, chemin entre crochets).
    expect(messageErreur).not.toMatch(/Required/)
    expect(messageErreur).not.toMatch(/\["ops"/)
    // Une phrase francaise claire est presente (pas seulement une reponse
    // brute dumpee).
    expect(messageErreur.toLowerCase()).toMatch(/patch claude code/)
    // La reponse brute reste consultable : l'id du noeud invente par le
    // modele doit etre reperable dans le message.
    expect(messageErreur).toContain('text-bienvenue-001')
  })
})

describe('cancelClaude', () => {
  // Point 2 (reparation du pont) : cancelClaude declenche reellement
  // l'AbortSignal transmis a AiService.ask/ProcessClaudeRunner.run --
  // simule ici par un ClaudeRunner de test dont run() n'aboutit que si le
  // signal recu est declenche (comme le ferait le vrai sous-processus tue
  // par kill() a la reception de l'abandon, voir runner.test.ts).
  it('interrompt reellement une demande askClaude en cours', async () => {
    let signalRecu: AbortSignal | undefined
    const runnerBloquant: ClaudeRunner = {
      isAvailable: async () => true,
      run: (_prompt, signal) =>
        new Promise((_resolve, reject) => {
          signalRecu = signal
          signal?.addEventListener('abort', () => reject(new Error('sous-processus interrompu')))
        }),
    }
    const requests = new ClaudeRequestTracker()
    const { handler } = creerHandler(runnerBloquant, requests)
    const cancelHandler = createClaudeCancelHandler({ requests })

    const doc = createDocument('T')
    const promesse = handler({ instruction: 'x', json: serializeDocument(doc), selectionIds: [], pageId: doc.pages[0]!.id })

    await vi.waitFor(() => expect(signalRecu).toBeDefined())
    await cancelHandler()

    await expect(promesse).rejects.toThrow(/interrompu/i)
  })

  // Ne doit jamais lever quand aucune demande n'est en cours (voir la note
  // sur cancelClaude dans shared/api.ts) : le panneau peut l'appeler sans
  // avoir a suivre lui-meme l'etat de la demande.
  it('ne leve pas quand aucune demande n est en cours', async () => {
    const cancelHandler = createClaudeCancelHandler({ requests: new ClaudeRequestTracker() })
    await expect(cancelHandler()).resolves.toBeUndefined()
  })
})
