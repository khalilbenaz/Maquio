// Mode prototype : apercu plein ecran qui JOUE le document. L'ecran de depart
// est affiche, les elements portant des interactions repondent au clic, a
// l'appui long et au delai ; les transitions sont animees (Web Animations),
// les overlays (dialogue, feuille basse, snackbar) s'ouvrent et se ferment.
// Echap quitte. Rien n'est modifie dans le document.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { absoluteFrame, inheritedOpacity, isScreenNode } from '@maquio/core'
import type { Node, Rect } from '@maquio/core'
import { useEditorStore } from '../state/editorStore'
import { NodeVisual } from '../canvas/NodeView'
import { pageNodesOf } from '../canvas/useDragInteraction'
import { animationFor, applyAction, currentScreenId, delayInteractions, overlayAnimation, referencedOverlays, resolveGesture, startState } from './prototypeEngine'
import type { Anim, Fired, ProtoState } from './prototypeEngine'
import './PrototypeView.css'

const LONG_PRESS_MS = 500
const SNACKBAR_MS = 3000

function flatten(nodes: Node[], hidden: Set<string>): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    if (!n.visible || hidden.has(n.id)) continue
    out.push(n)
    if (n.type === 'frame') out.push(...flatten(n.children, hidden))
  }
  return out
}

function ScreenLayer({ pageNodes, screen, hidden, open, layerRef, testId }: { pageNodes: Node[]; screen: Node; hidden: Set<string>; open: string[]; layerRef?: (el: HTMLDivElement | null) => void; testId: string }) {
  if (screen.type !== 'frame') return null
  const origin = absoluteFrame(pageNodes, screen.id)
  const local = (id: string): Rect => {
    const a = absoluteFrame(pageNodes, id)
    return { x: a.x - origin.x, y: a.y - origin.y, w: a.w, h: a.h }
  }
  // Overlays ouverts : rendus au-dessus de tout, avec leur voile.
  const openNodes = open.map((id) => findIn(pageNodes, id)).filter((n): n is Node => n !== null)
  const hiddenWithoutOpen = new Set([...hidden].filter((id) => !open.includes(id)))
  const overlayIds = new Set<string>()
  for (const o of openNodes) {
    overlayIds.add(o.id)
    if (o.type === 'frame') for (const d of flatten(o.children, new Set())) overlayIds.add(d.id)
  }
  const body = flatten(screen.children, hiddenWithoutOpen).filter((n) => !overlayIds.has(n.id))
  const top = openNodes.flatMap((o) => [o, ...(o.type === 'frame' ? flatten(o.children, new Set()) : [])])
  return (
    <div ref={layerRef} className="proto-layer" data-testid={testId} style={{ width: screen.frame.w, height: screen.frame.h }}>
      <NodeVisual node={screen} abs={{ x: 0, y: 0, w: screen.frame.w, h: screen.frame.h }} testId={`proto-node-${screen.id}`} extraStyle={{ overflow: 'hidden' }} />
      {body.map((n) => (
        <NodeVisual key={n.id} node={n} abs={local(n.id)} testId={`proto-node-${n.id}`} inherited={inheritedOpacity(pageNodes, n.id)} extraStyle={{ cursor: n.interactions?.length ? 'pointer' : undefined }} data-interactive={n.interactions?.length ? 'true' : undefined} />
      ))}
      {openNodes.some((o) => o.type !== 'component' || o.kind !== 'snackbar') ? <div className="proto-scrim" data-testid="proto-scrim" /> : null}
      {top.map((n) => (
        <NodeVisual key={`ov-${n.id}`} node={n} abs={local(n.id)} testId={`proto-node-${n.id}`} inherited={inheritedOpacity(pageNodes, n.id)} data-overlay={openNodes.includes(n) ? 'true' : undefined} />
      ))}
    </div>
  )
}

function findIn(nodes: Node[], id: string): Node | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'frame') {
      const r = findIn(n.children, id)
      if (r) return r
    }
  }
  return null
}

export function PrototypeView({ onClose }: { onClose: () => void }) {
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const nodes = pageNodesOf(document_, pageId)
  const screens = nodes.filter(isScreenNode)
  const screenIds = useMemo(() => new Set(screens.map((s) => s.id)), [screens])
  const hidden = useMemo(() => referencedOverlays(nodes), [nodes])

  const startId = (() => {
    const active = useEditorStore.getState().activeScreenId
    return active !== null && screenIds.has(active) ? active : (screens[0]?.id ?? '')
  })()
  // Debut du parcours : le premier ecran de la page. Le prototype s'ouvre sur
  // l'ecran selectionne (startId), mais « Départ » rejoue depuis le debut.
  const flowStartId = screens[0]?.id ?? startId
  const [state, setState] = useState<ProtoState>(() => startState(startId))
  const [anim, setAnim] = useState<(Anim & { id: number }) | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const counter = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; consumed: boolean }>({ timer: null, consumed: false })
  const stateRef = useRef(state)
  stateRef.current = state
  const [leaving, setLeaving] = useState<string | null>(null)

  const currentId = currentScreenId(state)
  const current = screens.find((s) => s.id === currentId)

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function fire(f: Fired) {
    if (f === null) return
    const step = applyAction(stateRef.current, f.action, f.transition, screenIds)
    if (step.state === stateRef.current && step.anim === null && step.toast === null) return
    setState(step.state)
    stateRef.current = step.state
    if (step.toast !== null) {
      setToast(step.toast)
      window.setTimeout(() => setToast(null), 2500)
    }
    if (step.anim !== null) {
      counter.current += 1
      setAnim({ ...step.anim, id: counter.current })
      if (step.anim.kind === 'enter' || step.anim.kind === 'back') setLeaving(step.anim.fromScreenId)
    }
  }

  // Anime les ecrans / overlays a chaque nouvelle action.
  useLayoutEffect(() => {
    if (anim === null) return
    const finishers: Animation[] = []
    const run = (el: HTMLElement | null | undefined, a: ReturnType<typeof animationFor>) => {
      if (!el || !a || typeof el.animate !== 'function') return
      finishers.push(el.animate(a.keyframes, a.options))
    }
    if (anim.kind === 'enter') {
      run(refs.current[`cur-${anim.toScreenId}`], animationFor(anim.transition, 'enter'))
      run(refs.current[`old-${anim.fromScreenId}`], animationFor(anim.transition, 'underEnter'))
    } else if (anim.kind === 'back') {
      run(refs.current[`old-${anim.fromScreenId}`], animationFor(anim.transition, 'exitBack'))
      run(refs.current[`cur-${anim.toScreenId}`], animationFor(anim.transition, 'underBack'))
    } else if (anim.kind === 'overlayOpen') {
      run(stage.current?.querySelector(`[data-testid="proto-node-${anim.overlayId}"]`), overlayAnimation(anim.transition, true))
    }
    const done = Promise.all(finishers.map((f) => f.finished.catch(() => undefined))).then(() => {
      setLeaving(null)
    })
    void done
    if (finishers.length === 0) setLeaving(null)
    return () => finishers.forEach((f) => f.cancel())
  }, [anim])

  // Interactions « apres un delai » de l'ecran courant.
  useEffect(() => {
    if (current === undefined) return
    const timers = delayInteractions(current).map((d) => window.setTimeout(() => fire({ action: d.action, transition: d.transition, sourceId: current.id }), d.ms))
    return () => timers.forEach((t) => window.clearTimeout(t))
    // fire lit l'etat par ref : il ne change pas la logique de ce minuteur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  // Snackbar ouvert : se ferme seul.
  useEffect(() => {
    const last = state.overlays[state.overlays.length - 1]
    if (last === undefined) return
    const n = findIn(nodes, last)
    if (n === null || n.type !== 'component' || n.kind !== 'snackbar') return
    const t = window.setTimeout(() => fire({ action: { type: 'closeOverlay' }, transition: { type: 'none' }, sourceId: last }), SNACKBAR_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.overlays])

  if (current === undefined) {
    return (
      <div className="proto-root" role="dialog" aria-label="Prototype">
        <p className="proto-empty">Aucun écran à jouer : créez un écran puis relancez le prototype.</p>
        <button type="button" onClick={onClose}>Quitter</button>
      </div>
    )
  }

  const scale = Math.min((size.w - 80) / current.frame.w, (size.h - 120) / current.frame.h, 1.6)
  const pagePoint = (e: React.PointerEvent): { x: number; y: number } => {
    const r = stage.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / scale + current.frame.x, y: (e.clientY - r.top) / scale + current.frame.y }
  }

  function onDown(e: React.PointerEvent) {
    const p = pagePoint(e)
    press.current.consumed = false
    if (press.current.timer !== null) clearTimeout(press.current.timer)
    press.current.timer = setTimeout(() => {
      press.current.timer = null
      press.current.consumed = true
      fire(resolveGesture(nodes, current!, p, 'longPress', stateRef.current.overlays))
    }, LONG_PRESS_MS)
  }
  function onUp(e: React.PointerEvent) {
    if (press.current.timer !== null) {
      clearTimeout(press.current.timer)
      press.current.timer = null
      if (!press.current.consumed) fire(resolveGesture(nodes, current!, pagePoint(e), 'tap', stateRef.current.overlays))
    }
  }

  const leavingScreen = leaving !== null && leaving !== currentId ? screens.find((s) => s.id === leaving) : undefined
  const backAnim = anim?.kind === 'back'

  return (
    <div className="proto-root" role="dialog" aria-label="Prototype" aria-modal="true">
      <header className="proto-bar">
        <span className="proto-title">▶ Prototype</span>
        <span className="proto-screen-name" data-testid="proto-current">{current.name}</span>
        <span className="proto-spacer" />
        <button type="button" aria-label="Revenir au départ" onClick={() => { setState(startState(flowStartId)); setAnim(null); setLeaving(null) }}>↺ Départ</button>
        <button type="button" aria-label="Quitter le prototype" onClick={onClose}>Quitter (Échap)</button>
      </header>
      <div className="proto-viewport">
        <div
          ref={stage}
          className="proto-stage"
          data-testid="proto-stage"
          data-current={currentId}
          data-animating={leaving !== null ? 'true' : 'false'}
          style={{ width: current.frame.w, height: current.frame.h, transform: `scale(${scale})` }}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerLeave={() => { if (press.current.timer !== null) { clearTimeout(press.current.timer); press.current.timer = null } }}
        >
          {leavingScreen !== undefined && !backAnim ? (
            <ScreenLayer key={`old-${leavingScreen.id}`} pageNodes={nodes} screen={leavingScreen} hidden={hidden} open={[]} testId={`proto-screen-${leavingScreen.id}`} layerRef={(el) => { refs.current[`old-${leavingScreen.id}`] = el }} />
          ) : null}
          {backAnim ? (
            <ScreenLayer key={`cur-${current.id}`} pageNodes={nodes} screen={current} hidden={hidden} open={state.overlays} testId={`proto-screen-${current.id}`} layerRef={(el) => { refs.current[`cur-${current.id}`] = el }} />
          ) : null}
          {leavingScreen !== undefined && backAnim ? (
            <ScreenLayer key={`old-${leavingScreen.id}`} pageNodes={nodes} screen={leavingScreen} hidden={hidden} open={[]} testId={`proto-screen-${leavingScreen.id}`} layerRef={(el) => { refs.current[`old-${leavingScreen.id}`] = el }} />
          ) : null}
          {!backAnim ? (
            <ScreenLayer key={`cur-${current.id}`} pageNodes={nodes} screen={current} hidden={hidden} open={state.overlays} testId={`proto-screen-${current.id}`} layerRef={(el) => { refs.current[`cur-${current.id}`] = el }} />
          ) : null}
        </div>
        {toast !== null ? <div className="proto-toast" role="status">{toast}</div> : null}
      </div>
    </div>
  )
}
