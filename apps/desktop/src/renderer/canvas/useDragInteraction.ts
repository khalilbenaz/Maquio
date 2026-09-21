// Interactions de pointeur du canevas (Tache 15, decisions 4, 6, 9, 10, 11).
//
// Regle centrale (decision 4) : pendant un glissement (deplacement,
// redimensionnement ou creation), AUCUNE commande n'est executee. Seul un
// `dragPreview` ephemere (dans le magasin) est mis a jour a chaque
// pointermove. Une seule commande est emise, au relachement (pointerup), et
// seulement si le geste a reellement deplace/redimensionne quelque chose.
//
// Decision 6 : la selection au clic ne s'appuie jamais sur la cible native
// de l'evenement DOM (qui n'existe pas de facon fiable sous jsdom, faute de
// mise en page reelle) mais sur hitTest() de @calque/core, interroge au
// centre du cadre absolu du noeud clique. Cela garantit que la regle du
// modele (verrouille/invisible ignores et leurs descendants, ordre de
// dessin) est celle qui decide, et rend le comportement testable sans
// navigateur reel.
import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import {
  absoluteFrame,
  alignmentCandidates,
  alignmentGuides,
  createNodeCommand,
  findNode,
  hitTest,
  moveNodeCommand,
  resizeNodeCommand,
  resizeRect,
  snapValue,
  translateRect,
} from '@calque/core'
import type { CalqueDocument, HandleId, Node, Rect } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { DragPreview, Tool } from '../state/editorStore'

// --- Utilitaires purs (testes directement, sans rendu) ---

export function pageNodesOf(doc: CalqueDocument, pageId: string): Node[] {
  return doc.pages.find((p) => p.id === pageId)?.nodes ?? []
}

// Conversion coordonnees ecran -> coordonnees de page (decision 10) : tient
// compte du decalage de l'origine du canevas a l'ecran, du panoramique et du
// zoom. `origin` est le coin haut-gauche du canevas en coordonnees ecran
// (typiquement le resultat de getBoundingClientRect() du conteneur racine).
export function screenToPage(
  client: { x: number; y: number },
  origin: { x: number; y: number },
  zoom: number,
  pan: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (client.x - origin.x - pan.x) / zoom,
    y: (client.y - origin.y - pan.y) / zoom,
  }
}

// Seuil de magnetisme (decision 9) : 4 px a l'ecran a zoom 1, divise par le
// zoom aux autres echelles pour qu'il reste 4 px A L'ECRAN quel que soit le
// zoom (sinon le magnetisme devient inutilisable en zoom arriere : un seuil
// fixe de 4 px EN ESPACE PAGE deviendrait invisible a l'ecran une fois
// dezoome).
export function snapThreshold(zoom: number): number {
  return 4 / zoom
}

function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

// Arrondi de la geometrie produite par un GESTE (creation, deplacement,
// redimensionnement), a l'entier, en unites de page -- decision de
// finition v1 : ces unites sont des points de maquette qui finissent en
// `width: 233` dans du Flutter/React Native genere, et la conversion
// ecran -> page (screenToPage, divise par le zoom) produit sinon des
// flottants a dix decimales (ex. 233.2116...) des que le zoom n'est pas un
// diviseur entier de 1. L'arrondi a lieu ICI, au moment ou la commande est
// CONSTRUITE (pas dans les fabriques de commande partagees avec
// l'inspecteur, ni dans le rendu ephemere du dragPreview pendant le
// geste) : une valeur saisie au clavier dans l'inspecteur, elle, ne doit
// JAMAIS etre arrondie (voir InspectorPanel.tsx).
export function roundRect(r: Rect): Rect {
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }
}

// Cadre absolu d'un noeud, corrige de l'aperçu de glissement en cours s'il
// le concerne. Partage par NodeView (rendu du noeud deplace/redimensionne)
// et SelectionOverlay (cadre de selection, poignees).
export function resolvePreviewAbsoluteFrame(nodes: Node[], id: string, preview: DragPreview): Rect {
  const abs = absoluteFrame(nodes, id)
  if (preview !== null && preview.kind === 'move' && preview.nodeId === id) {
    return { ...abs, x: abs.x + preview.dx, y: abs.y + preview.dy }
  }
  if (preview !== null && preview.kind === 'resize' && preview.nodeId === id) {
    const node = findNode(nodes, id)
    if (node !== null) {
      const parentOriginX = abs.x - node.frame.x
      const parentOriginY = abs.y - node.frame.y
      return {
        x: parentOriginX + preview.frame.x,
        y: parentOriginY + preview.frame.y,
        w: preview.frame.w,
        h: preview.frame.h,
      }
    }
  }
  return abs
}

// Parmi tous les bords du rectangle deplace (calcules par alignmentCandidates
// de @calque/core -- la MEME derivation que celle utilisee en interne par
// alignmentGuides, round de correction 1 : deux derivations separees des
// points bord/centre/bord auraient fini par diverger, ce qui aurait pu
// afficher un guide la ou rien n'accroche vraiment), celui qui s'accroche le
// plus pres (delta le plus petit en valeur absolue) l'emporte : evite qu'un
// accrochage lointain sur un bord ecrase un accrochage plus pertinent sur
// un autre bord du meme axe.
function bestSnapDelta(movingCandidates: number[], otherCandidates: number[], threshold: number): number {
  let best: number | null = null
  for (const mc of movingCandidates) {
    const { value, snappedTo } = snapValue(mc, otherCandidates, threshold)
    if (snappedTo === null) continue
    const delta = value - mc
    if (best === null || Math.abs(delta) < Math.abs(best)) best = delta
  }
  return best ?? 0
}

// Applique le magnetisme (decision 9) a un deplacement brut : cherche, sur
// chaque axe, le bord du noeud deplace (gauche/centre/droit ou
// haut/centre/bas) le plus proche d'un bord d'un AUTRE noeud de la page (au
// sens de snapValue, avec le seuil divise par le zoom), et ajuste le delta
// brut pour aligner exactement dessus. `guides` (calcule via
// alignmentGuides) accompagne le resultat pour l'affichage des lignes
// d'accrochage par SelectionOverlay pendant le geste. Fonction pure, testee
// directement sans rendu.
export function computeSnappedMoveDelta(
  nodes: Node[],
  movingId: string,
  rawDx: number,
  rawDy: number,
  zoom: number,
): { dx: number; dy: number; guides: { x: number[]; y: number[] } } {
  const abs = absoluteFrame(nodes, movingId)
  const movedAbs = translateRect(abs, rawDx, rawDy)
  const others = nodes.filter((n) => n.id !== movingId).map((n) => absoluteFrame(nodes, n.id))
  const threshold = snapThreshold(zoom)

  const otherXCandidates = others.flatMap((o) => alignmentCandidates(o).x)
  const otherYCandidates = others.flatMap((o) => alignmentCandidates(o).y)
  const movingCandidates = alignmentCandidates(movedAbs)

  const snapDx = bestSnapDelta(movingCandidates.x, otherXCandidates, threshold)
  const snapDy = bestSnapDelta(movingCandidates.y, otherYCandidates, threshold)

  const guides = alignmentGuides(translateRect(movedAbs, snapDx, snapDy), others, threshold)

  return { dx: rawDx + snapDx, dy: rawDy + snapDy, guides }
}

function defaultNameFor(tool: Exclude<Tool, 'select'>): string {
  switch (tool) {
    case 'frame': return 'Frame'
    case 'rect': return 'Rectangle'
    case 'ellipse': return 'Ellipse'
    case 'text': return 'Texte'
    case 'image': return 'Image'
  }
}

// Valeurs par defaut lisibles (decision 11) : gris clair pour les formes,
// texte d'exemple pour le texte, pas de source pour l'image (a renseigner
// ensuite via l'inspecteur de la Tache 16).
function createDefaultNode(tool: Exclude<Tool, 'select'>, frame: Rect): Node {
  const base = {
    id: crypto.randomUUID(),
    name: defaultNameFor(tool),
    frame,
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
  }
  const defaultFill = { type: 'solid' as const, color: { r: 0.85, g: 0.85, b: 0.9, a: 1 } }

  switch (tool) {
    case 'frame':
      return {
        ...base,
        type: 'frame',
        layout: {
          mode: 'absolute',
          gap: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          alignMain: 'start',
          alignCross: 'start',
        },
        fills: [defaultFill],
        strokes: [],
        cornerRadius: 0,
        clipsContent: false,
        children: [],
      }
    case 'rect':
      return { ...base, type: 'rect', fills: [defaultFill], strokes: [], cornerRadius: 0 }
    case 'ellipse':
      return { ...base, type: 'ellipse', fills: [defaultFill], strokes: [] }
    case 'text':
      return {
        ...base,
        type: 'text',
        characters: 'Texte',
        style: {
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 1.2,
          letterSpacing: 0,
          color: { r: 0, g: 0, b: 0, a: 1 },
          align: 'left',
        },
      }
    case 'image':
      return { ...base, type: 'image', src: '', fit: 'cover' }
  }
}

// --- Hooks d'interaction (utilises par Canvas / NodeView / SelectionOverlay) ---

// Garde-fou "un seul geste actif a la fois" : si un pointerup est manque
// (fenetre perdant le focus, curseur relache hors de la fenetre, ou --
// c'est ce qui a fait echouer un test ici pendant le developpement -- deux
// gestes demarres sans que le premier soit jamais relache), demarrer un
// NOUVEAU geste force d'abord le nettoyage des ecouteurs `window` du geste
// precedent, sans executer sa commande (le geste abandonne n'a jamais ete
// "termine", donc rien n'est commit pour lui). Sans ce garde-fou, les
// ecouteurs de pointermove/pointerup d'un geste jamais relache restent
// attaches indefiniment et continuent de reagir aux evenements de gestes
// suivants.
let activeGestureCleanup: (() => void) | null = null

function beginGesture(cleanup: () => void): void {
  activeGestureCleanup?.()
  activeGestureCleanup = cleanup
}

function endGesture(cleanup: () => void): void {
  if (activeGestureCleanup === cleanup) activeGestureCleanup = null
}

// Garde-fou de DEMONTAGE (Critical, round de correction 1). Le garde-fou
// ci-dessus (un seul geste actif a la fois) ne protege que contre un
// NOUVEAU geste demarre pendant qu'un ancien traine : il ne se declenche
// qu'au prochain pointerdown. Si le composant qui a demarre le geste est
// demonte AVANT le pointerup (Canvas retire de l'arbre React en plein
// glissement), rien ne declenchait jusqu'ici le retrait des ecouteurs
// `window` : ils restaient attaches, et un pointerup tardif executait une
// commande sur un document qui n'est meme plus celui affiche -- demontre
// par le relecteur avec un load() d'un autre document suivi d'un pointerup
// tardif, qui deplacait un noeud du nouveau document. Ce hook enregistre,
// dans une ref locale a l'instance de composant, le nettoyage du geste EN
// COURS pour cette instance, et le rejoue automatiquement a l'effet de
// demontage si le geste n'a pas deja ete termine normalement (auquel cas
// la ref a ete remise a un no-op).
function useGestureCleanupRef() {
  const cleanupRef = useRef<() => void>(() => {})
  useEffect(() => {
    return () => cleanupRef.current()
  }, [])
  return cleanupRef
}

// Poignee sur un NodeView : resout la selection (clic simple / Maj+clic) via
// hitTest, puis demarre un glissement de deplacement.
export function useNodeInteraction(nodeId: string) {
  const cleanupRef = useGestureCleanupRef()

  return useCallback(
    (e: ReactPointerEvent) => {
      e.stopPropagation()
      const state = useEditorStore.getState()
      if (state.tool !== 'select') return

      const nodes = pageNodesOf(state.document, state.pageId)
      const abs = absoluteFrame(nodes, nodeId)
      const center = { x: abs.x + abs.w / 2, y: abs.y + abs.h / 2 }
      const hit = hitTest(nodes, center)
      const targetId = hit !== null ? hit.id : nodeId

      if (e.shiftKey) {
        const current = state.selection
        const next = current.includes(targetId)
          ? current.filter((id) => id !== targetId)
          : [...current, targetId]
        state.select(next)
        // Un Maj+clic bascule la selection, il ne demarre pas de glissement.
        return
      }

      state.select([targetId])

      const startX = e.clientX
      const startY = e.clientY
      let dx = 0
      let dy = 0
      let moved = false

      const handleMove = (ev: PointerEvent) => {
        const current = useEditorStore.getState()
        const rawDx = (ev.clientX - startX) / current.zoom
        const rawDy = (ev.clientY - startY) / current.zoom
        const currentNodes = pageNodesOf(current.document, current.pageId)
        const snapped = computeSnappedMoveDelta(currentNodes, targetId, rawDx, rawDy, current.zoom)
        dx = snapped.dx
        dy = snapped.dy
        moved = true
        current.setDragPreview({ kind: 'move', nodeId: targetId, dx, dy, guides: snapped.guides })
      }

      // Nettoyage "abandon" (pointerup jamais recu) : retire les
      // ecouteurs et libere les deux garde-fous, mais N'EXECUTE AUCUNE
      // commande -- un geste abandonne n'a jamais ete termine.
      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        endGesture(cleanup)
        cleanupRef.current = () => {}
      }

      const handleUp = () => {
        cleanup()
        const current = useEditorStore.getState()
        current.setDragPreview(null)
        // Arrondi a l'entier en unites de page (finition v1) : dx/dy bruts
        // sont divises par le zoom (screenToPage) et donc potentiellement
        // fractionnaires a un zoom non entier -- seul le delta arrondi est
        // commis dans le document.
        const roundedDx = Math.round(dx)
        const roundedDy = Math.round(dy)
        if (moved && (roundedDx !== 0 || roundedDy !== 0)) {
          current.execute(moveNodeCommand(current.pageId, targetId, roundedDx, roundedDy))
        }
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [nodeId, cleanupRef],
  )
}

// Poignee de redimensionnement (une des huit, decision 5/8).
export function useResizeInteraction(nodeId: string, handle: HandleId) {
  const cleanupRef = useGestureCleanupRef()

  return useCallback(
    (e: ReactPointerEvent) => {
      e.stopPropagation()
      const state = useEditorStore.getState()
      if (state.tool !== 'select') return

      const nodes = pageNodesOf(state.document, state.pageId)
      const node = findNode(nodes, nodeId)
      if (node === null) return
      const startFrame = node.frame

      const startX = e.clientX
      const startY = e.clientY
      let currentFrame = startFrame
      let resized = false

      const handleMove = (ev: PointerEvent) => {
        const current = useEditorStore.getState()
        const dx = (ev.clientX - startX) / current.zoom
        const dy = (ev.clientY - startY) / current.zoom
        currentFrame = resizeRect(startFrame, handle, dx, dy)
        resized = true
        current.setDragPreview({ kind: 'resize', nodeId, handle, frame: currentFrame })
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        endGesture(cleanup)
        cleanupRef.current = () => {}
      }

      const handleUp = () => {
        cleanup()
        const current = useEditorStore.getState()
        current.setDragPreview(null)
        if (resized) {
          current.execute(resizeNodeCommand(current.pageId, nodeId, roundRect(currentFrame)))
        }
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [nodeId, handle, cleanupRef],
  )
}

// Clic/glisser sur le fond : desselectionne quand l'outil actif est
// 'select', sinon pose un nouveau noeud du type de l'outil actif
// (decision 11). Apres creation, l'outil revient a 'select' et le noeud
// cree est selectionne.
export function useCreateInteraction(canvasRef: RefObject<HTMLElement | null>) {
  const cleanupRef = useGestureCleanupRef()

  return useCallback(
    (e: ReactPointerEvent) => {
      const state = useEditorStore.getState()

      if (state.tool === 'select') {
        state.select([])
        return
      }

      const tool = state.tool
      const originOf = () => {
        const r = canvasRef.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top } : { x: 0, y: 0 }
      }

      const start = screenToPage({ x: e.clientX, y: e.clientY }, originOf(), state.zoom, state.pan)
      let currentFrame: Rect = { x: start.x, y: start.y, w: 0, h: 0 }
      state.setDragPreview({ kind: 'create', tool, frame: currentFrame })

      const handleMove = (ev: PointerEvent) => {
        const current = useEditorStore.getState()
        const point = screenToPage({ x: ev.clientX, y: ev.clientY }, originOf(), current.zoom, current.pan)
        currentFrame = rectFromPoints(start, point)
        current.setDragPreview({ kind: 'create', tool, frame: currentFrame })
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        endGesture(cleanup)
        cleanupRef.current = () => {}
      }

      const handleUp = () => {
        cleanup()
        const current = useEditorStore.getState()
        current.setDragPreview(null)

        const finalFrame: Rect = {
          x: Math.round(currentFrame.x),
          y: Math.round(currentFrame.y),
          w: Math.max(1, Math.round(currentFrame.w)),
          h: Math.max(1, Math.round(currentFrame.h)),
        }
        const node = createDefaultNode(tool, finalFrame)
        current.execute(createNodeCommand(current.pageId, null, node))
        current.select([node.id])
        current.setTool('select')
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [canvasRef, cleanupRef],
  )
}
