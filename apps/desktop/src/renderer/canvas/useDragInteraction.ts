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
  compositeCommand,
  isScreenNode,
  marqueeSelect,
  moveNodeCommand,
  removeNode,
  reparentNodeCommand,
  resizeNodeCommand,
  resizeRect,
  screenAtPoint,
  screenContaining,
  setLinkCommand,
  snapValue,
  translateRect,
} from '@calque/core'
import type { CalqueDocument, FrameNode, HandleId, Node, Rect } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { DragPreview, Tool } from '../state/editorStore'
import type { CalqueApi } from '../../shared/api'

// --- Utilitaires purs (testes directement, sans rendu) ---

function depthIsTop(nodes: Node[], id: string): boolean {
  return nodes.some((n) => n.id === id)
}

// Frame (groupe, conteneur, ecran) la plus profonde, visible et deverrouillee,
// qui contient le point (coordonnees de PAGE) : parent d'un element trace a
// cet endroit. Les composants (feuilles) ne sont jamais parents.
export function deepestFrameAt(nodes: Node[], point: { x: number; y: number }): FrameNode | null {
  let best: FrameNode | null = null
  const visit = (list: Node[], ox: number, oy: number) => {
    for (const n of list) {
      if (!n.visible || n.locked || n.type !== 'frame') continue
      const x = ox + n.frame.x
      const y = oy + n.frame.y
      if (point.x >= x && point.x < x + n.frame.w && point.y >= y && point.y < y + n.frame.h) {
        best = n
        visit(n.children, x, y)
      }
    }
  }
  visit(nodes, 0, 0)
  return best
}

export function pageNodesOf(doc: CalqueDocument, pageId: string): Node[] {
  return doc.pages.find((p) => p.id === pageId)?.nodes ?? []
}

// Parmi les noeuds selectionnes, ceux dont aucun ancetre n'est lui-meme
// selectionne : deplacer un cadre deplace deja ses enfants, les deplacer
// aussi les ferait avancer deux fois.
export function outermostSelection(nodes: Node[], ids: string[]): string[] {
  return ids.filter((id) =>
    !ids.some((other) => {
      if (other === id) return false
      const parent = findNode(nodes, other)
      return parent !== null && parent.type === 'frame' && findNode(parent.children, id) !== null
    }),
  )
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
  if (preview !== null && preview.kind === 'move' && (preview.nodeId === id || preview.nodeIds?.includes(id))) {
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
// texte d'exemple pour le texte. `imageSrc` (defaut n3, « comment mettre
// l'image ? ») : le src choisi via le selecteur de fichier (voir
// useCreateInteraction ci-dessous) -- vide par defaut pour les autres
// outils, ou si aucun appelant ne le fournit.
export function createDefaultNode(tool: Exclude<Tool, 'select'>, frame: Rect, imageSrc = ''): Node {
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
          // Pixels (voir TextStyle.lineHeight) : 1,2 x la taille de police.
          lineHeight: 19,
          letterSpacing: 0,
          color: { r: 0, g: 0, b: 0, a: 1 },
          align: 'left',
        },
      }
    case 'image':
      return { ...base, type: 'image', src: imageSrc, fit: 'cover' }
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
    // La ref est volontairement relue au demontage : elle porte le nettoyage du
    // geste EN COURS a cet instant, pas celui d'un geste passe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => cleanupRef.current()
  }, [])
  return cleanupRef
}


// Selection par rectangle (marquee). Demarre sur le fond du canevas ou sur
// le corps d'un ecran, avec l'outil Selection. Comme les autres gestes :
// aucune commande, un `dragPreview` ephemere pendant le trace ; la selection
// est posee au relachement. Sans mouvement (simple clic) : la selection est
// videe -- ou, si `clickSelects` est fourni (clic sur un ecran), reduite a
// ce noeud. Maj : ajoute a la selection existante.
const MARQUEE_THRESHOLD = 3

export function startMarquee(e: ReactPointerEvent, clickSelects: string | null = null): void {
  const shiftToggleId = e.shiftKey ? clickSelects : null
  const state = useEditorStore.getState()
  const sceneEl = (e.target as Element | null)?.closest?.('[data-testid="canvas-scene"]') ?? null
  const r = sceneEl?.getBoundingClientRect()
  const origin = r ? { x: r.left, y: r.top } : { x: 0, y: 0 }
  const base = e.shiftKey ? state.selection : []
  const start = screenToPage({ x: e.clientX, y: e.clientY }, origin, state.zoom, state.pan)
  const startX = e.clientX
  const startY = e.clientY
  let frame: Rect = { x: start.x, y: start.y, w: 0, h: 0 }
  let moved = false

  if (!e.shiftKey) state.select(clickSelects === null ? [] : [clickSelects])

  const handleMove = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < MARQUEE_THRESHOLD) return
    moved = true
    const current = useEditorStore.getState()
    const point = screenToPage({ x: ev.clientX, y: ev.clientY }, origin, current.zoom, current.pan)
    frame = rectFromPoints(start, point)
    current.setDragPreview({ kind: 'marquee', frame })
    const nodes = pageNodesOf(current.document, current.pageId)
    current.select([...new Set([...base, ...marqueeSelect(nodes, frame)])])
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', handleUp)
    endGesture(cleanup)
  }
  const handleUp = () => {
    cleanup()
    const current = useEditorStore.getState()
    current.setDragPreview(null)
    // Maj + simple clic sur un ecran : bascule sa presence dans la selection.
    if (!moved && shiftToggleId !== null) {
      const sel = current.selection
      current.select(sel.includes(shiftToggleId) ? sel.filter((id) => id !== shiftToggleId) : [...sel, shiftToggleId])
    }
  }
  beginGesture(cleanup)
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

// Deplacement d'une multi-selection : un seul geste, une seule commande
// composite (donc un seul Annuler). Pas de reparentage ni d'accroche
// magnetique en groupe : le groupe reste dans ses parents actuels.
function startGroupMove(
  e: ReactPointerEvent,
  targetId: string,
  movingIds: string[],
  cleanupRef: { current: () => void },
): void {
  const startX = e.clientX
  const startY = e.clientY
  let dx = 0
  let dy = 0
  let moved = false

  const handleMove = (ev: PointerEvent) => {
    const current = useEditorStore.getState()
    dx = (ev.clientX - startX) / current.zoom
    dy = (ev.clientY - startY) / current.zoom
    moved = true
    current.setDragPreview({
      kind: 'move',
      nodeId: targetId,
      nodeIds: movingIds,
      dx,
      dy,
      guides: { x: [], y: [] },
      targetScreenId: null,
    })
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
    if (!moved) {
      current.select([targetId])
      return
    }
    const rx = Math.round(dx)
    const ry = Math.round(dy)
    if (rx === 0 && ry === 0) return
    current.execute(
      compositeCommand(
        'Déplacer la sélection',
        movingIds.map((id) => moveNodeCommand(current.pageId, id, rx, ry)),
      ),
    )
  }
  cleanupRef.current = cleanup
  beginGesture(cleanup)
  window.addEventListener('pointermove', handleMove)
  window.addEventListener('pointerup', handleUp)
}

// Poignee sur un NodeView : resout la selection (clic simple / Maj+clic) via
// hitTest, puis demarre un glissement de deplacement.
export function useNodeInteraction(nodeId: string, options: { screenBodyIsMarquee?: boolean } = {}) {
  const screenBodyIsMarquee = options.screenBodyIsMarquee ?? false
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

      // Le corps d'un ecran est, comme dans Figma, une zone de selection par
      // rectangle ; un ecran se deplace par son etiquette (ScreenLabel).
      // Le noeud touche est l'ecran lui-meme (pas un descendant : chaque
      // noeud est un element frere, un enfant recoit son propre evenement).
      if (screenBodyIsMarquee) {
        const own = findNode(nodes, nodeId)
        if (own !== null && isScreenNode(own) && depthIsTop(nodes, nodeId)) {
          startMarquee(e, nodeId)
          return
        }
      }

      if (e.shiftKey) {
        const current = state.selection
        const next = current.includes(targetId)
          ? current.filter((id) => id !== targetId)
          : [...current, targetId]
        state.select(next)
        // Un Maj+clic bascule la selection, il ne demarre pas de glissement.
        return
      }

      // Glisser un noeud qui fait deja partie d'une multi-selection deplace
      // TOUTE la selection (comportement Figma) ; un simple clic sans
      // mouvement la reduit a ce noeud au relachement.
      if (state.selection.length > 1 && state.selection.includes(targetId)) {
        startGroupMove(e, targetId, outermostSelection(nodes, state.selection), cleanupRef)
        return
      }

      state.select([targetId])

      // Correctif parentage (v2, addendum navigation) : un ecran ne devient
      // JAMAIS l'enfant d'un autre ecran (regle imposee cote interface, pas
      // seulement par le coeur) -- on ne calcule donc meme pas de cible de
      // reparentage quand le noeud deplace EST un ecran, il ne fait jamais
      // que se deplacer parmi les noeuds de premier niveau, exactement comme
      // avant ce correctif. `originalScreenId` est l'ecran englobant ACTUEL
      // du noeud (screenContaining, pas seulement son parent direct) : null
      // pour un noeud de premier niveau qui n'est pas un ecran (le "repere
      // hors maquette" legitime, §1 du correctif). `targetAbs` et
      // `nodesWithoutTarget` (le sous-arbre du noeud deplace retire de la
      // liste, pour ne jamais le laisser se "detecter lui-meme" sous le
      // curseur) sont captures UNE FOIS au debut du geste : le document ne
      // change pas pendant un glissement (decision 4), aucune commande
      // n'etant executee avant le relachement.
      const targetNode = findNode(nodes, targetId)
      const isScreen = targetNode !== null && isScreenNode(targetNode)
      const originalScreenId = isScreen ? null : screenContaining(nodes, targetId)
      const targetAbs = absoluteFrame(nodes, targetId)
      const nodesWithoutTarget = isScreen ? nodes : removeNode(nodes, targetId)

      const startX = e.clientX
      const startY = e.clientY
      let dx = 0
      let dy = 0
      let moved = false
      // Ecran survole par le noeud deplace, DIFFERENT de son ecran englobant
      // actuel (ou null hors de tout ecran) -- recalcule a chaque
      // pointermove, lu au relachement pour decider du reparentage. Distinct
      // du champ `targetScreenId` du dragPreview (qui ne sert qu'a
      // l'indication visuelle, §3 du correctif) : les deux portent la meme
      // valeur pour un noeud ordinaire, mais seule celle-ci est lue par
      // handleUp (le dragPreview est deja remis a null a ce moment-la).
      let hoveredScreenId: string | null = originalScreenId

      const handleMove = (ev: PointerEvent) => {
        const current = useEditorStore.getState()
        const rawDx = (ev.clientX - startX) / current.zoom
        const rawDy = (ev.clientY - startY) / current.zoom
        const currentNodes = pageNodesOf(current.document, current.pageId)
        const snapped = computeSnappedMoveDelta(currentNodes, targetId, rawDx, rawDy, current.zoom)
        dx = snapped.dx
        dy = snapped.dy
        moved = true

        if (!isScreen) {
          const movedCenter = { x: targetAbs.x + dx + targetAbs.w / 2, y: targetAbs.y + dy + targetAbs.h / 2 }
          const hovered = screenAtPoint(nodesWithoutTarget, movedCenter)
          hoveredScreenId = hovered?.id ?? null
        }
        // Indice visuel (§3 du correctif) : seulement quand l'ecran survole
        // differe de l'ecran englobant ACTUEL -- rien pendant un simple
        // deplacement a l'interieur du meme ecran (hoveredScreenId ===
        // originalScreenId), et jamais pour un ecran deplace (isScreen).
        const highlight = !isScreen && hoveredScreenId !== originalScreenId ? hoveredScreenId : null

        current.setDragPreview({ kind: 'move', nodeId: targetId, dx, dy, guides: snapped.guides, targetScreenId: highlight })
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

        if (!moved) return

        // Reparentage (§2 du correctif) : le point de relachement retombe
        // sur un ecran DIFFERENT de l'ecran englobant actuel du noeud (y
        // compris "hors de tout ecran", hoveredScreenId === null). Un seul
        // et unique reparentNodeCommand porte a la fois le changement de
        // parent ET le nouveau cadre (relatif au nouveau parent, calcule
        // pour que le noeud ne bouge pas visuellement) : deplacement et
        // reparentage sont le meme geste, donc la meme commande annulable.
        if (!isScreen && hoveredScreenId !== originalScreenId) {
          const nodesNow = pageNodesOf(current.document, current.pageId)
          const newParent = hoveredScreenId === null ? null : findNode(nodesNow, hoveredScreenId)
          const originX = newParent !== null ? newParent.frame.x : 0
          const originY = newParent !== null ? newParent.frame.y : 0
          const siblings = newParent !== null && newParent.type === 'frame' ? newParent.children : nodesNow
          const newFrame = roundRect({
            x: targetAbs.x + dx - originX,
            y: targetAbs.y + dy - originY,
            w: targetAbs.w,
            h: targetAbs.h,
          })
          current.execute(
            reparentNodeCommand(current.pageId, targetId, hoveredScreenId, siblings.length, newFrame),
          )
          return
        }

        // Deplacement ordinaire, meme ecran englobant (ou noeud sans ecran,
        // ou noeud ecran lui-meme) : comportement inchange depuis la v1.
        // Arrondi a l'entier en unites de page (finition v1) : dx/dy bruts
        // sont divises par le zoom (screenToPage) et donc potentiellement
        // fractionnaires a un zoom non entier -- seul le delta arrondi est
        // commis dans le document.
        const roundedDx = Math.round(dx)
        const roundedDy = Math.round(dy)
        if (roundedDx !== 0 || roundedDy !== 0) {
          current.execute(moveNodeCommand(current.pageId, targetId, roundedDx, roundedDy))
        }
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [nodeId, cleanupRef, screenBodyIsMarquee],
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

// Poignee de lien sur le cadre de selection (§5, chemin 2 : « une poignee
// de lien sur le cadre de sélection, que l'on tire jusqu'à l'écran cible »).
// Meme discipline que les autres gestes du canevas (decision 4) : AUCUNE
// commande pendant le glissement, seul un dragPreview 'link' ephemere
// (consomme par SelectionOverlay pour dessiner la ligne en cours) ; une
// SEULE commande (setLinkCommand) au relachement, et seulement si le point
// de relachement retombe sur un ecran DIFFERENT de celui qui contient deja
// le noeud -- sinon le geste est simplement abandonne (aucune commande,
// exactement comme un tracé d'outil Image annule).
export function useLinkInteraction(nodeId: string, canvasRef: RefObject<HTMLElement | null>) {
  const cleanupRef = useGestureCleanupRef()

  return useCallback(
    (e: ReactPointerEvent) => {
      e.stopPropagation()
      const state = useEditorStore.getState()
      if (state.tool !== 'select') return

      const originOf = () => {
        const r = canvasRef.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top } : { x: 0, y: 0 }
      }

      const updatePreview = (ev: { clientX: number; clientY: number }) => {
        const current = useEditorStore.getState()
        const point = screenToPage({ x: ev.clientX, y: ev.clientY }, originOf(), current.zoom, current.pan)
        current.setDragPreview({ kind: 'link', nodeId, point })
        return point
      }

      let lastPoint = updatePreview(e)

      const handleMove = (ev: PointerEvent) => {
        lastPoint = updatePreview(ev)
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

        const nodes = pageNodesOf(current.document, current.pageId)
        const target = screenAtPoint(nodes, lastPoint)
        if (target === null) return
        if (screenContaining(nodes, nodeId) === target.id) return

        try {
          current.execute(setLinkCommand(current.pageId, nodeId, target.id))
        } catch {
          // Cible refusee par la commande (cas deja filtre ci-dessus en
          // temps normal, garde-fou de dernier recours) : le geste est
          // abandonne comme un relachement hors cible, aucune commande.
        }
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [nodeId, canvasRef, cleanupRef],
  )
}

// Clic/glisser sur le fond : desselectionne quand l'outil actif est
// 'select', sinon pose un nouveau noeud du type de l'outil actif
// (decision 11). Apres creation, l'outil revient a 'select' et le noeud
// cree est selectionne.
//
// Defaut n3 (« comment mettre l'image ? ») : pour l'outil 'image', le
// relachement du geste n'execute plus createNodeCommand immediatement --
// il ouvre d'abord le selecteur de fichier natif (api.chooseImage(),
// process main, voir main.ts) et n'execute la commande de creation
// qu'une fois un fichier reellement choisi. Si l'utilisateur annule
// (chooseImage() rend null), AUCUN noeud n'est cree : le geste de trace
// est abandonne comme s'il n'avait jamais eu lieu, seul l'outil actif
// revient a 'select' (meme comportement de sortie que pour les autres
// outils, pour ne jamais laisser l'outil Image actif sans que rien
// n'indique pourquoi).
export function useCreateInteraction(canvasRef: RefObject<HTMLElement | null>, api: CalqueApi) {
  const cleanupRef = useGestureCleanupRef()

  return useCallback(
    (e: ReactPointerEvent) => {
      const state = useEditorStore.getState()

      if (state.tool === 'select') {
        startMarquee(e)
        return
      }

      const tool = state.tool
      const originOf = () => {
        const r = canvasRef.current?.getBoundingClientRect()
        return r ? { x: r.left, y: r.top } : { x: 0, y: 0 }
      }

      const start = screenToPage({ x: e.clientX, y: e.clientY }, originOf(), state.zoom, state.pan)

      // Correctif parentage (§1) : le parent du noeud a venir se decide UNE
      // FOIS, au demarrage du geste, sur le point de DEPART -- pas sur le
      // point de relachement, qui peut deriver hors de tout ecran pendant le
      // trace sans que l'intention change. `screenAtPoint` reutilise deja la
      // regle de `hitTest` pour retenir l'ecran le plus profond quand
      // plusieurs se chevauchent (voir tree.ts). `null` si le geste demarre
      // sur le fond, hors de tout ecran -- le noeud reste alors de premier
      // niveau, un cas legitime (repere, note hors maquette), pas un refus.
      const nodesAuDepart = pageNodesOf(state.document, state.pageId)
      const parentScreen = deepestFrameAt(nodesAuDepart, start)

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

        const finalFrameAbsolue: Rect = {
          x: Math.round(currentFrame.x),
          y: Math.round(currentFrame.y),
          w: Math.max(1, Math.round(currentFrame.w)),
          h: Math.max(1, Math.round(currentFrame.h)),
        }

        // Correctif parentage (§1) : cadre relatif a l'ecran de depart, quand
        // il y en a un -- les ecrans etant tous de premier niveau, leur
        // cadre ABSOLU est directement `frame` (aucun cumul d'ancetre), donc
        // une simple soustraction suffit. Entier deja garanti par
        // finalFrameAbsolue (arrondie ci-dessus) moins un entier.
        const parentId = parentScreen !== null ? parentScreen.id : null
        const parentOrigin = parentScreen !== null ? absoluteFrame(pageNodesOf(current.document, current.pageId), parentScreen.id) : null
        const finalFrame: Rect =
          parentOrigin === null
            ? finalFrameAbsolue
            : {
                x: finalFrameAbsolue.x - parentOrigin.x,
                y: finalFrameAbsolue.y - parentOrigin.y,
                w: finalFrameAbsolue.w,
                h: finalFrameAbsolue.h,
              }

        if (tool === 'image') {
          // Asynchrone (dialogue natif cote main) : aucune commande n'est
          // executee avant la resolution du choix -- si l'utilisateur
          // annule, `createNodeCommand` n'est jamais appele.
          void api.chooseImage().then((chosenPath) => {
            const stateApresChoix = useEditorStore.getState()
            if (chosenPath === null) {
              stateApresChoix.setTool('select')
              return
            }
            const node = createDefaultNode(tool, finalFrame, chosenPath)
            stateApresChoix.execute(createNodeCommand(stateApresChoix.pageId, parentId, node))
            stateApresChoix.select([node.id])
            stateApresChoix.setTool('select')
          })
          return
        }

        const node = createDefaultNode(tool, finalFrame)
        current.execute(createNodeCommand(current.pageId, parentId, node))
        current.select([node.id])
        current.setTool('select')
        // Un texte fraichement trace s'edite aussitot (le contenu est selectionne).
        if (tool === 'text') current.setEditingTextId(node.id)
      }

      cleanupRef.current = cleanup
      beginGesture(cleanup)
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    },
    [canvasRef, cleanupRef, api],
  )
}
