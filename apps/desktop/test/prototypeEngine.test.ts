import { describe, expect, it } from 'vitest'
import { createComponentNode, createContainerNode, createScreenNode, DEVICE_PRESETS, tapLink } from '@maquio/core'
import type { FrameNode, Interaction, Node } from '@maquio/core'
import { animationFor, applyAction, currentScreenId, delayInteractions, overlayAnimation, referencedOverlays, resolveGesture, startState } from '../src/renderer/prototype/prototypeEngine'

const none = { type: 'none' } as const
const push = { type: 'push', durationMs: 300, easing: 'easeInOut' } as const
const dev = DEVICE_PRESETS.iphone15
const withI = (n: Node, i: Interaction[]): Node => ({ ...n, interactions: i }) as Node

function build() {
  const bouton = withI({ ...createComponentNode('button', { x: 20, y: 100, w: 200, h: 48 }), id: 'btn' }, [
    tapLink('B', { type: 'slide', direction: 'left', durationMs: 250, easing: 'easeOut' }),
    { trigger: { type: 'longPress' }, action: { type: 'openOverlay', overlay: 'dialog', target: 'dlg' }, transition: { type: 'fade', durationMs: 200, easing: 'linear' } },
  ])
  const dlg = { ...createComponentNode('dialog', { x: 40, y: 300, w: 300, h: 200 }), id: 'dlg' }
  const sheet = { ...createContainerNode('bottomSheet', { x: 0, y: 500, w: 393, h: 300 }), id: 'sht' }
  const card = withI({ ...createContainerNode('card', { x: 20, y: 200, w: 300, h: 80 }), id: 'card' } as Node, [tapLink('C')])
  const nested = { ...createComponentNode('listTile', { x: 10, y: 10, w: 280, h: 56 }), id: 'tile' }
  const cardWithChild = { ...card, children: [nested] } as FrameNode
  const nav = { ...createComponentNode('bottomNav', { x: 0, y: 780, w: 393, h: 72 }), id: 'nav' } as Node
  const navItems = (nav as { props: { items: { label: string; icon: string; target?: string }[] } }).props.items
  navItems[0]!.target = 'A'
  navItems[1]!.target = 'C'
  const appBar = { ...createComponentNode('appBar', { x: 0, y: 0, w: 393, h: 56 }, { leading: 'back' }), id: 'bar' }
  const a = withI({ ...createScreenNode('A', dev, { x: 0, y: 0, w: 393, h: 852 }, [bouton, cardWithChild, dlg, sheet, nav, appBar]), id: 'A' }, [{ trigger: { type: 'afterDelay', ms: 1500 }, action: { type: 'navigate', target: 'B' }, transition: { type: 'fade', durationMs: 300, easing: 'linear' } }])
  const b = { ...createScreenNode('B', dev, { x: 500, y: 0, w: 393, h: 852 }, []), id: 'B' }
  const c = { ...createScreenNode('C', dev, { x: 1000, y: 0, w: 393, h: 852 }, []), id: 'C' }
  return { nodes: [a, b, c] as Node[], a }
}
const ids = new Set(['A', 'B', 'C'])

describe('applyAction', () => {
  it('navigate empile et anime ; vers soi-meme ou une cible inconnue : rien', () => {
    const s0 = startState('A')
    const s1 = applyAction(s0, { type: 'navigate', target: 'B' }, push, ids)
    expect(s1.state.stack.map((e) => e.screenId)).toEqual(['A', 'B'])
    expect(s1.anim).toEqual({ kind: 'enter', transition: push, fromScreenId: 'A', toScreenId: 'B' })
    expect(applyAction(s0, { type: 'navigate', target: 'A' }, push, ids).anim).toBeNull()
    expect(applyAction(s0, { type: 'navigate', target: 'Z' }, push, ids).state).toBe(s0)
  })
  it('back rejoue la transition d arrivee a l envers ; pile a un element : rien', () => {
    const t = { type: 'slide', direction: 'up', durationMs: 100, easing: 'linear' } as const
    const s1 = applyAction(startState('A'), { type: 'navigate', target: 'B' }, t, ids).state
    const back = applyAction(s1, { type: 'back' }, none, ids)
    expect(currentScreenId(back.state)).toBe('A')
    expect(back.anim).toEqual({ kind: 'back', transition: t, fromScreenId: 'B', toScreenId: 'A' })
    expect(applyAction(startState('A'), { type: 'back' }, none, ids).anim).toBeNull()
  })
  it('overlays : ouvrir, pas de doublon, fermer le dernier ; back ferme d abord l overlay ; navigation vide les overlays', () => {
    const s = applyAction(startState('A'), { type: 'openOverlay', overlay: 'dialog', target: 'dlg' }, none, ids)
    expect(s.state.overlays).toEqual(['dlg'])
    expect(applyAction(s.state, { type: 'openOverlay', overlay: 'dialog', target: 'dlg' }, none, ids).anim).toBeNull()
    expect(applyAction(s.state, { type: 'back' }, none, ids).state.overlays).toEqual([])
    expect(applyAction(s.state, { type: 'closeOverlay' }, none, ids).anim).toMatchObject({ kind: 'overlayClose', overlayId: 'dlg' })
    expect(applyAction(s.state, { type: 'navigate', target: 'B' }, push, ids).state.overlays).toEqual([])
  })
  it('openUrl ne navigue pas : une info', () => {
    const r = applyAction(startState('A'), { type: 'openUrl', url: 'https://x.test' }, none, ids)
    expect(r.toast).toBe('Ouvrirait https://x.test')
    expect(r.anim).toBeNull()
  })
})

describe('resolveGesture', () => {
  const { nodes, a } = build()
  it('tap sur un bouton : sa navigation avec sa transition', () => {
    const r = resolveGesture(nodes, a, { x: 50, y: 120 }, 'tap', [])
    expect(r).toMatchObject({ action: { type: 'navigate', target: 'B' }, sourceId: 'btn', transition: { type: 'slide', direction: 'left' } })
  })
  it('appui long sur le meme bouton : l overlay', () => {
    expect(resolveGesture(nodes, a, { x: 50, y: 120 }, 'longPress', [])).toMatchObject({ action: { type: 'openOverlay', target: 'dlg' } })
  })
  it('un enfant sans interaction remonte a l interaction de son conteneur', () => {
    // le listTile (10,10 dans la carte en 20,200) -> carte -> C
    expect(resolveGesture(nodes, a, { x: 60, y: 230 }, 'tap', [])).toMatchObject({ action: { type: 'navigate', target: 'C' }, sourceId: 'card' })
  })
  it('entrees d une barre de navigation basse et retour d une barre d application', () => {
    expect(resolveGesture(nodes, a, { x: 300, y: 800 }, 'tap', [])).toBeNull() // entree 3 : pas de cible
    expect(resolveGesture(nodes, a, { x: 100, y: 800 }, 'tap', [])).toMatchObject({ action: { type: 'navigate', target: 'A' } })
    expect(resolveGesture(nodes, a, { x: 140, y: 800 }, 'tap', [])).toMatchObject({ action: { type: 'navigate', target: 'C' } })
    expect(resolveGesture(nodes, a, { x: 20, y: 20 }, 'tap', [])).toMatchObject({ action: { type: 'back' } })
  })
  it('un overlay ouvert capte le geste : un tap le ferme', () => {
    expect(resolveGesture(nodes, a, { x: 60, y: 120 }, 'tap', ['dlg'])).toMatchObject({ action: { type: 'closeOverlay' }, sourceId: 'dlg' })
    expect(resolveGesture(nodes, a, { x: 60, y: 320 }, 'tap', ['dlg'])).toMatchObject({ action: { type: 'closeOverlay' } })
  })
  it('un overlay reference mais ferme ne recoit aucun geste (il ne masque pas ce qui est dessous)', () => {
    const { nodes, a } = build()
    // le dialogue est en (40,300)-(340,500) ; la carte en (20,200)-(320,280) n'est pas concernee ; un tap sur la zone du dialogue ne ferme rien
    expect(resolveGesture(nodes, a, { x: 200, y: 400 }, 'tap', [])).toBeNull()
  })
  it('rien sous le point : null', () => {
    expect(resolveGesture(nodes, a, { x: 380, y: 700 }, 'tap', [])).toBeNull()
  })
})

describe('autres', () => {
  it('overlays referencees et interactions apres un delai', () => {
    const { nodes, a } = build()
    expect([...referencedOverlays(nodes)]).toEqual(['dlg'])
    expect(delayInteractions(a)).toEqual([{ ms: 1500, action: { type: 'navigate', target: 'B' }, transition: { type: 'fade', durationMs: 300, easing: 'linear' } }])
  })
})

describe('animationFor', () => {
  const slideLeft = { type: 'slide', direction: 'left', durationMs: 250, easing: 'easeOut' } as const
  it('slide : entre par le cote oppose au mouvement, sans toucher l ecran dessous', () => {
    expect(animationFor(slideLeft, 'enter')!.keyframes).toEqual([{ transform: 'translate(100%, 0%)' }, { transform: 'translate(0%, 0%)' }])
    expect(animationFor(slideLeft, 'enter')!.options).toMatchObject({ duration: 250, easing: 'ease-out' })
    expect(animationFor(slideLeft, 'underEnter')).toBeNull()
    expect(animationFor({ ...slideLeft, direction: 'down' }, 'enter')!.keyframes[0]).toEqual({ transform: 'translate(0%, -100%)' })
  })
  it('push : le precedent recule d un tiers, le retour inverse', () => {
    expect(animationFor(push, 'underEnter')!.keyframes[1]).toEqual({ transform: 'translate(-30%, 0%)' })
    expect(animationFor(push, 'underBack')!.keyframes[0]).toEqual({ transform: 'translate(-30%, 0%)' })
    expect(animationFor(push, 'exitBack')!.keyframes).toEqual([{ transform: 'translate(0%, 0%)' }, { transform: 'translate(100%, 0%)' }])
  })
  it('fade et modal ; none = aucune animation ; ressort = courbe a depassement', () => {
    expect(animationFor({ type: 'fade', durationMs: 100, easing: 'linear' }, 'enter')!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(animationFor({ type: 'modal', durationMs: 350, easing: 'spring' }, 'enter')!.keyframes[0]).toEqual({ transform: 'translate(0%, 100%)' })
    expect(animationFor({ type: 'modal', durationMs: 350, easing: 'spring' }, 'enter')!.options.easing).toContain('cubic-bezier')
    expect(animationFor(none, 'enter')).toBeNull()
    expect(overlayAnimation(none, true)).toBeNull()
    expect(overlayAnimation({ type: 'fade', durationMs: 100, easing: 'linear' }, true)!.keyframes[0]).toMatchObject({ opacity: 0 })
  })
})
