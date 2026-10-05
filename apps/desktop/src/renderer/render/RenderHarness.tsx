// Banc de rendu des ecrans (critique visuelle, voir
// packages/ai/src/app-pipeline.ts) : charge dans une fenetre CACHEE du main
// (adapters/screenRenderer.ts) avec l'ancre #render, il dessine UN ecran a
// l'echelle 1, exactement comme le mode prototype (meme ScreenLayer), pour
// que le main en capture l'image.
//
// Le main appelle window.__maquioRender(json, pageId, screenId) ; la promesse
// se resout une fois l'ecran peint (polices chargees, deux images), avec sa
// taille. Le document est une DONNEE (JSON.parse via parseDocument), jamais
// du code.
import { useEffect, useRef, useState } from 'react'
import { isScreenNode, parseDocument } from '@maquio/core'
import type { Node } from '@maquio/core'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf } from '../canvas/useDragInteraction'
import { ScreenLayer } from '../prototype/PrototypeView'
import { referencedOverlays } from '../prototype/prototypeEngine'

type Target = { pageId: string; screenId: string; done: (size: { w: number; h: number }) => void }

declare global {
  interface Window {
    __maquioRender?: (json: string, pageId: string, screenId: string) => Promise<{ w: number; h: number }>
  }
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function RenderHarness() {
  const [target, setTarget] = useState<Target | null>(null)
  const document_ = useEditorStore((s) => s.document)
  const pending = useRef<Target | null>(null)

  useEffect(() => {
    window.__maquioRender = (json, pageId, screenId) =>
      new Promise((resolve) => {
        useEditorStore.getState().load(parseDocument(json))
        setTarget({ pageId, screenId, done: resolve })
      })
    return () => {
      delete window.__maquioRender
    }
  }, [])

  // Une fois l'ecran monte : polices pretes et deux images peintes.
  useEffect(() => {
    if (target === null || pending.current === target) return
    pending.current = target
    void (async () => {
      await document.fonts.ready
      await nextFrame()
      await nextFrame()
      const screen = pageNodesOf(useEditorStore.getState().document, target.pageId).find((n) => n.id === target.screenId)
      target.done({ w: screen?.frame.w ?? 0, h: screen?.frame.h ?? 0 })
    })()
  }, [target])

  if (target === null) return null
  const nodes: Node[] = pageNodesOf(document_, target.pageId)
  const screen = nodes.find((n) => n.id === target.screenId && isScreenNode(n))
  if (screen === undefined) return null
  return (
    <div style={{ position: 'fixed', left: 0, top: 0, width: screen.frame.w, height: screen.frame.h, overflow: 'hidden' }}>
      <ScreenLayer pageNodes={nodes} screen={screen} hidden={referencedOverlays(nodes)} open={[]} testId="render-screen" />
    </div>
  )
}
