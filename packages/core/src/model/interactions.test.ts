import { describe, expect, it } from 'vitest'
import { createComponentNode, createContainerNode } from '../components/catalog'
import { History } from '../commands/history'
import { clearLinkCommand, InvalidInteractionError, setInteractionsCommand, setLinkCommand, deleteNodeCommand } from '../commands/edits'
import { LinkTargetNotFoundError, LinkToContainingScreenError } from '../commands/command'
import { createDocument, DEVICE_PRESETS, parseDocument, serializeDocument } from './document'
import { DEFAULT_TRANSITION, defaultTransition, interactionSchema, isDefaultTransition, tapLink, tapNavigation } from './interactions'
import type { Interaction } from './interactions'
import { documentSchema } from './schema'
import { createScreenNode } from './screen'
import type { MaquioDocument, FrameNode, Node } from './types'
import { findNode } from '../tree/tree'

const R = { x: 0, y: 0, w: 100, h: 44 }
function doc() {
  const d = createDocument('t')
  const bouton = { ...createComponentNode('button', R), id: 'bouton' }
  const dialog = { ...createComponentNode('dialog', { x: 0, y: 0, w: 300, h: 200 }), id: 'dlg' }
  const snack = { ...createComponentNode('snackbar', { x: 0, y: 0, w: 300, h: 48 }), id: 'snk' }
  const sheet = { ...createContainerNode('bottomSheet', { x: 0, y: 400, w: 393, h: 300 }), id: 'sht' }
  const a = { ...createScreenNode('A', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [bouton, dialog, snack, sheet]), id: 'A' }
  const b = { ...createScreenNode('B', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, []), id: 'B' }
  const pageId = d.pages[0]!.id
  return { doc: { ...d, pages: [{ ...d.pages[0]!, nodes: [a, b] }] } as MaquioDocument, pageId }
}
const set = (nodeId: string, its: Interaction[]) => {
  const { doc: d, pageId } = doc()
  return { d, run: () => setInteractionsCommand(pageId, nodeId, its).apply(d), pageId }
}

describe('schema des interactions', () => {
  it('accepte tous les declencheurs, actions et transitions', () => {
    const transitions = [{ type: 'none' }, { type: 'slide', direction: 'up', durationMs: 200, easing: 'spring' }, { type: 'push', durationMs: 300, easing: 'linear' }, { type: 'fade', durationMs: 0, easing: 'easeIn' }, { type: 'modal', durationMs: 5000, easing: 'easeOut' }]
    const actions = [{ type: 'navigate', target: 'B' }, { type: 'back' }, { type: 'openOverlay', overlay: 'dialog', target: 'dlg' }, { type: 'closeOverlay' }, { type: 'openUrl', url: 'https://exemple.test/x' }]
    const triggers = [{ type: 'tap' }, { type: 'longPress' }, { type: 'afterDelay', ms: 1500 }]
    for (const transition of transitions) for (const action of actions) for (const trigger of triggers) expect(interactionSchema.safeParse({ trigger, action, transition }).success).toBe(true)
  })
  it('refuse : duree hors bornes, easing inconnu, direction inconnue, url dangereuse, champ en trop', () => {
    const ok = { trigger: { type: 'tap' }, action: { type: 'back' } }
    expect(interactionSchema.safeParse({ ...ok, transition: { type: 'fade', durationMs: 9999, easing: 'linear' } }).success).toBe(false)
    expect(interactionSchema.safeParse({ ...ok, transition: { type: 'fade', durationMs: 10, easing: 'bounce' } }).success).toBe(false)
    expect(interactionSchema.safeParse({ ...ok, transition: { type: 'slide', direction: 'diagonal', durationMs: 10, easing: 'linear' } }).success).toBe(false)
    expect(interactionSchema.safeParse({ ...ok, transition: { type: 'none' }, action: { type: 'openUrl', url: 'javascript:alert(1)' } }).success).toBe(false)
    expect(interactionSchema.safeParse({ ...ok, transition: { type: 'none' }, extra: 1 }).success).toBe(false)
  })
  it('une transition par defaut est reconnue comme la navigation native', () => {
    expect(isDefaultTransition(DEFAULT_TRANSITION)).toBe(true)
    expect(isDefaultTransition(defaultTransition('fade'))).toBe(false)
    expect(isDefaultTransition({ type: 'push', durationMs: 500, easing: 'easeInOut' })).toBe(false)
  })
  it('regles du document : un seul declencheur de chaque sorte, afterDelay reserve aux ecrans, cibles valides', () => {
    const a = set('bouton', [tapLink('B'), { trigger: { type: 'tap' }, action: { type: 'back' }, transition: { type: 'none' } }])
    expect(() => a.run()).toThrow(InvalidInteractionError)
    const b = set('bouton', [{ trigger: { type: 'afterDelay', ms: 100 }, action: { type: 'back' }, transition: { type: 'none' } }])
    expect(() => b.run()).toThrow(/réservé aux écrans/)
    expect(() => set('A', [{ trigger: { type: 'afterDelay', ms: 100 }, action: { type: 'navigate', target: 'B' }, transition: { type: 'fade', durationMs: 300, easing: 'linear' } }]).run()).not.toThrow()
    expect(() => set('bouton', [tapLink('inconnu')]).run()).toThrow(LinkTargetNotFoundError)
    expect(() => set('bouton', [tapLink('A')]).run()).toThrow(LinkToContainingScreenError)
    expect(() => set('bouton', [{ trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay: 'dialog', target: 'snk' }, transition: { type: 'none' } }]).run()).toThrow(/overlay/i)
    for (const [overlay, target] of [['dialog', 'dlg'], ['snackbar', 'snk'], ['bottomSheet', 'sht']] as const)
      expect(() => set('bouton', [{ trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay, target }, transition: { type: 'modal', durationMs: 250, easing: 'easeOut' } }]).run()).not.toThrow()
  })
  it('le schema du document applique les memes regles (document ecrit a la main)', () => {
    const { d } = set('bouton', [tapLink('B')])
    const ok = set('bouton', [tapLink('B')]).run()
    expect(documentSchema.safeParse(ok).success).toBe(true)
    const bad = JSON.parse(JSON.stringify(ok))
    bad.pages[0].nodes[0].children[0].interactions[0].action.target = 'fantome'
    expect(documentSchema.safeParse(bad).success).toBe(false)
    void d
  })
})

describe('commandes d interactions', () => {
  it('setInteractionsCommand : annulable, une seule entree d historique', () => {
    const { doc: d, pageId } = doc()
    const h = new History(d)
    h.execute(setInteractionsCommand(pageId, 'bouton', [tapLink('B', { type: 'fade', durationMs: 200, easing: 'linear' }), { trigger: { type: 'longPress' }, action: { type: 'back' }, transition: { type: 'none' } }]))
    expect(findNode(h.document.pages[0]!.nodes, 'bouton')!.interactions).toHaveLength(2)
    h.undo()
    expect('interactions' in findNode(h.document.pages[0]!.nodes, 'bouton')!).toBe(false)
  })
  it('setLinkCommand garde les autres interactions et choisit la transition', () => {
    const { doc: d, pageId } = doc()
    const h = new History(d)
    h.execute(setInteractionsCommand(pageId, 'bouton', [{ trigger: { type: 'longPress' }, action: { type: 'back' }, transition: { type: 'none' } }]))
    h.execute(setLinkCommand(pageId, 'bouton', 'B', defaultTransition('modal')))
    const n = findNode(h.document.pages[0]!.nodes, 'bouton')!
    expect(n.interactions).toHaveLength(2)
    expect(tapNavigation(n.interactions)).toEqual({ target: 'B', transition: defaultTransition('modal') })
    h.execute(clearLinkCommand(pageId, 'bouton'))
    expect(findNode(h.document.pages[0]!.nodes, 'bouton')!.interactions).toEqual([{ trigger: { type: 'longPress' }, action: { type: 'back' }, transition: { type: 'none' } }])
    h.undo(); h.undo()
    expect(findNode(h.document.pages[0]!.nodes, 'bouton')!.interactions).toHaveLength(1)
  })
  it('supprimer un overlay ou un ecran retire les interactions qui le visaient, dans la meme commande annulable', () => {
    const { doc: d, pageId } = doc()
    const h = new History(d)
    h.execute(setInteractionsCommand(pageId, 'bouton', [tapLink('B'), { trigger: { type: 'longPress' }, action: { type: 'openOverlay', overlay: 'dialog', target: 'dlg' }, transition: { type: 'modal', durationMs: 300, easing: 'easeOut' } }]))
    h.execute(deleteNodeCommand(pageId, 'dlg'))
    expect(findNode(h.document.pages[0]!.nodes, 'bouton')!.interactions).toEqual([tapLink('B')])
    h.execute(deleteNodeCommand(pageId, 'B'))
    expect('interactions' in findNode(h.document.pages[0]!.nodes, 'bouton')!).toBe(false)
    h.undo(); h.undo()
    expect(findNode(h.document.pages[0]!.nodes, 'bouton')!.interactions).toHaveLength(2)
    expect(findNode(h.document.pages[0]!.nodes, 'dlg')).not.toBeNull()
  })
})

describe('migration v3 -> v4 des liens', () => {
  it('un lien devient tap -> navigate avec la transition par defaut, a tous les niveaux', () => {
    const { doc: d } = doc()
    const raw = JSON.parse(serializeDocument(d))
    raw.version = 3
    raw.pages[0].nodes[0].children[0].link = { target: 'B' }
    raw.pages[0].nodes[1].link = { target: 'A' }
    const migrated = parseDocument(JSON.stringify(raw))
    expect(migrated.version).toBe(4)
    const bouton = (migrated.pages[0]!.nodes[0] as FrameNode).children[0] as Node
    expect(bouton.interactions).toEqual([tapLink('B', DEFAULT_TRANSITION)])
    expect('link' in bouton).toBe(false)
    expect(migrated.pages[0]!.nodes[1]!.interactions).toEqual([tapLink('A')])
  })
  it('un lien invalide d un ancien document est toujours refuse (cible inconnue)', () => {
    const { doc: d } = doc()
    const raw = JSON.parse(serializeDocument(d))
    raw.version = 3
    raw.pages[0].nodes[0].children[0].link = { target: 'fantome' }
    expect(() => parseDocument(JSON.stringify(raw))).toThrow()
  })
  it('un document v4 aller-retour sans perte', () => {
    const { d } = set('bouton', [tapLink('B')])
    const ok = set('bouton', [tapLink('B', { type: 'slide', direction: 'down', durationMs: 123, easing: 'spring' })]).run()
    expect(parseDocument(serializeDocument(ok))).toEqual(ok)
    void d
  })
})
