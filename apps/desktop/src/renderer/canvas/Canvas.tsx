// Canevas d'edition (Tache 15, refonte visuelle et ergonomique). Rendu DOM
// absolu de la page courante, plus le calque SVG de superposition
// (SelectionOverlay). Le plan de travail (data-testid="canvas-background")
// gere le clic-dans-le-vide (desselection) ainsi que le cliquer-glisser de
// creation (decision 11) -- cette mecanique (useDragInteraction.ts) n'est
// pas touchee par la refonte.
//
// Ce que la refonte change ici, precisement :
// - le plan de travail est desormais CENTRE et AJUSTE pour tenir dans la
//   zone visible a l'ouverture et au redimensionnement de la fenetre (voir
//   viewport.ts / computeFitTransform), au lieu de rester fige a 100 % au
//   point (0,0) du monde ;
// - la zone sombre qui l'entoure (data-testid="canvas-scene") reagit
//   desormais au clic pour desselectionner -- avant la refonte, elle etait
//   inerte, ce qui est la cause directe du "le drag and drop ne marche
//   pas" signale : un clic hors du petit rectangle blanc ne declenchait
//   rien, sans que rien ne distingue visuellement le plan de travail du
//   vide autour ;
// - une etiquette (nom du document + nom de l'appareil) est affichee
//   au-dessus du plan de travail ;
// - un etat vide explicite s'affiche quand la page n'a aucun noeud, et une
//   bande d'information en bas du canevas quand un outil de creation est
//   actif ;
// - le zoom a la molette (Ctrl/Cmd) et le panoramique a la molette sont
//   ajoutes (les actions setZoom/setPan existaient deja dans le magasin,
//   mais rien ne les appelait depuis le canevas) ;
// - les raccourcis d'outils (V/F/R/E/T/I) s'ajoutent aux raccourcis
//   existants, avec la meme regle de desactivation dans un champ de
//   saisie.
//
// Les raccourcis clavier (decision 7) restent geres ici, au niveau du
// document (window), pas sur un element focusable du canevas.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { compositeCommand, deleteNodeCommand, findNode } from '@calque/core'
import type { Node as CalqueNode } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { Tool } from '../state/editorStore'
import { NodeView } from './NodeView'
import { SelectionOverlay } from './SelectionOverlay'
import { pageNodesOf, useCreateInteraction } from './useDragInteraction'
import { computeFitTransform, computeWheelZoom } from './viewport'
import './Canvas.css'

// Aplatit l'arbre en liste de dessin (du fond vers le dessus, profondeur
// d'abord) en excluant les noeuds invisibles ET tous leurs descendants --
// c'est le sens du titre du premier test du brief ("un element par noeud
// VISIBLE") : un noeud invisible ne recoit aucun element DOM.
function flattenVisible(nodes: CalqueNode[]): CalqueNode[] {
  const out: CalqueNode[] = []
  for (const n of nodes) {
    if (!n.visible) continue
    out.push(n)
    if (n.type === 'frame') out.push(...flattenVisible(n.children))
  }
  return out
}

function isTextInput(el: Element | null): boolean {
  if (el === null) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  return el instanceof HTMLElement && el.isContentEditable
}

const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: 'select',
  f: 'frame',
  r: 'rect',
  e: 'ellipse',
  t: 'text',
  i: 'image',
}

const TOOL_LABELS: Record<Exclude<Tool, 'select'>, string> = {
  frame: 'Cadre',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Texte',
  image: 'Image',
}

function ToolIcon({ tool }: { tool: Exclude<Tool, 'select'> }) {
  switch (tool) {
    case 'frame':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13" />
        </svg>
      )
    case 'rect':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
        </svg>
      )
    case 'ellipse':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.5" />
        </svg>
      )
    case 'text':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3.5h10M8 3.5v9M6 12.5h4" />
        </svg>
      )
    case 'image':
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <circle cx="6" cy="6.5" r="1.1" />
          <path d="M2.6 11.5l3.2-3 2.4 2.2 2-1.8 3.2 2.9" />
        </svg>
      )
  }
}

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const zoom = useEditorStore((s) => s.zoom)
  const pan = useEditorStore((s) => s.pan)
  const tool = useEditorStore((s) => s.tool)

  const onBackgroundPointerDown = useCreateInteraction(canvasRef)

  const page = document_.pages.find((p) => p.id === pageId)
  const device = page?.device

  // Ajustement et centrage du plan de travail (correction du defaut
  // fonctionnel principal de la refonte) : calcule au montage et a chaque
  // redimensionnement de la fenetre. Sous jsdom (tests), le conteneur n'a
  // jamais de dimensions reelles (getBoundingClientRect() rend des zeros,
  // aucune mise en page n'etant executee) : computeFitTransform rend alors
  // ses valeurs neutres (zoom 1, pan {0,0}) et cet effet n'a aucun effet
  // observable, ce qui laisse les tests existants (qui supposent ce zoom
  // et ce pan par defaut apres un load()) inchanges.
  useLayoutEffect(() => {
    if (!device) return
    function ajuster() {
      const el = canvasRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const { zoom: zoomAjuste, pan: panAjuste } = computeFitTransform(
        { width: rect.width, height: rect.height },
        { width: device!.width, height: device!.height },
      )
      if (rect.width <= 0 || rect.height <= 0) return
      useEditorStore.getState().setZoom(zoomAjuste)
      useEditorStore.getState().setPan(panAjuste)
    }
    ajuster()
    window.addEventListener('resize', ajuster)
    return () => window.removeEventListener('resize', ajuster)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, device?.width, device?.height])

  // Zoom (Ctrl/Cmd + molette) et panoramique (molette seule) : les deux
  // actions setZoom/setPan existaient deja dans le magasin, mais rien ne
  // les appelait encore depuis le canevas -- un plan de travail desormais
  // ajuste a l'ouverture ne serait plus explorable sans cela des qu'il
  // depasse la taille de la fenetre.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const state = useEditorStore.getState()
      if (e.ctrlKey || e.metaKey) {
        const rect = canvasRef.current!.getBoundingClientRect()
        const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        const { zoom: nextZoom, pan: nextPan } = computeWheelZoom(state.zoom, state.pan, cursor, e.deltaY)
        state.setZoom(nextZoom)
        state.setPan(nextPan)
        return
      }
      state.setPan({ x: state.pan.x - e.deltaX, y: state.pan.y - e.deltaY })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Panoramique au glissement avec la barre d'espace maintenue (en plus de
  // la molette ci-dessus) : la barre d'espace bascule un mode
  // "glissement", pendant lequel un cliquer-glisser deplace la vue au lieu
  // d'interagir avec le contenu.
  useEffect(() => {
    let espaceMaintenue = false
    let glissementEnCours = false
    let dernierPoint = { x: 0, y: 0 }

    function onKeyDownEspace(e: KeyboardEvent) {
      if (e.code === 'Space' && !isTextInput(window.document.activeElement)) espaceMaintenue = true
    }
    function onKeyUpEspace(e: KeyboardEvent) {
      if (e.code === 'Space') espaceMaintenue = false
    }
    function onPointerDown(e: PointerEvent) {
      if (!espaceMaintenue) return
      // Capture (et non bulle) + stopPropagation : empeche l'evenement
      // d'atteindre le plan de travail ou un noeud en dessous, pour que le
      // glissement panoramique ne declenche jamais AUSSI une selection ou
      // un deplacement de noeud pendant que la barre d'espace est
      // maintenue -- les deux gestes seraient sinon en concurrence sur le
      // meme pointerdown.
      e.stopPropagation()
      glissementEnCours = true
      dernierPoint = { x: e.clientX, y: e.clientY }
    }
    function onPointerMove(e: PointerEvent) {
      if (!glissementEnCours) return
      const dx = e.clientX - dernierPoint.x
      const dy = e.clientY - dernierPoint.y
      dernierPoint = { x: e.clientX, y: e.clientY }
      const state = useEditorStore.getState()
      state.setPan({ x: state.pan.x + dx, y: state.pan.y + dy })
    }
    function onPointerUp() {
      glissementEnCours = false
    }

    window.addEventListener('keydown', onKeyDownEspace)
    window.addEventListener('keyup', onKeyUpEspace)
    const el = canvasRef.current
    el?.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('keydown', onKeyDownEspace)
      window.removeEventListener('keyup', onKeyUpEspace)
      el?.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTextInput(window.document.activeElement)) return

      const state = useEditorStore.getState()
      const isMod = e.metaKey || e.ctrlKey

      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection.length > 0) {
        e.preventDefault()
        const nodes = pageNodesOf(state.document, state.pageId)
        const idsToDelete = state.selection.filter((id) => findNode(nodes, id) !== null)
        // Round de correction 1 : une seule commande composite pour toute
        // la selection, pour qu'un seul "annuler" restaure tous les noeuds
        // supprimes -- l'utilisateur percoit "supprimer ma selection" comme
        // un geste unique, pas comme N suppressions independantes.
        if (idsToDelete.length > 0) {
          const commands = idsToDelete.map((id) => deleteNodeCommand(state.pageId, id))
          state.execute(compositeCommand('Supprimer la sélection', commands))
        }
        state.select([])
        return
      }

      if (isMod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        state.redo()
        return
      }

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        state.undo()
        return
      }

      if (e.key === 'Escape') {
        state.select([])
        return
      }

      // Raccourcis d'outils (V/F/R/E/T/I, refonte visuelle) : jamais avec
      // un modificateur (Cmd/Ctrl/Alt), pour ne jamais interceptor un
      // raccourci systeme ou navigateur qui partage la meme lettre
      // (Cmd+V coller, Ctrl+R recharger, etc.).
      if (!isMod && !e.altKey) {
        const raccourci = TOOL_SHORTCUTS[e.key.toLowerCase()]
        if (raccourci !== undefined) {
          e.preventDefault()
          state.setTool(raccourci)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Clic sur la zone sombre (hors plan de travail) : desselectionne.
  // `e.target !== e.currentTarget` exclut tout clic qui a deja ete gere
  // par un descendant (plan de travail, noeud, poignee -- qui appellent
  // deja select()/select([]) eux-memes ou stoppent la propagation) : cette
  // zone ne reagit qu'a un clic qui la touche elle, directement.
  function onScenePointerDown(e: ReactPointerEvent) {
    if (e.target !== e.currentTarget) return
    useEditorStore.getState().select([])
  }

  const pageNodes = pageNodesOf(document_, pageId)
  const estVide = pageNodes.length === 0
  const outilActif = tool !== 'select' ? tool : null

  const artboardScreen = device
    ? { left: pan.x, top: pan.y, width: device.width * zoom, height: device.height * zoom }
    : null

  return (
    <div
      ref={canvasRef}
      className="calque-canvas"
      data-testid="canvas-scene"
      onPointerDown={onScenePointerDown}
    >
      <div
        className="calque-canvas-world"
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          // pointer-events: none ici (et non sur le conteneur racine) est
          // ce qui permet au clic sur la zone sombre d'atteindre le
          // gestionnaire de la scene (onScenePointerDown, plus bas) : ce
          // conteneur transforme occupe TOUTE la zone du canevas (inset:
          // 0), pas seulement la zone du plan de travail, et intercepterait
          // sinon tout clic hors des elements interactifs qu'il contient
          // avant qu'il n'atteigne son parent. Chaque enfant reellement
          // interactif (le plan de travail ci-dessous, les noeuds dans
          // NodeView, les poignees dans SelectionOverlay) reactive
          // explicitement pointer-events: auto sur lui-meme -- la regle
          // CSS pointer-events est heritee, elle ne s'applique donc pas a
          // eux implicitement.
          pointerEvents: 'none',
        }}
      >
        <div
          data-testid="canvas-background"
          className="calque-canvas-artboard"
          onPointerDown={onBackgroundPointerDown}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: device?.width ?? 0,
            height: device?.height ?? 0,
            pointerEvents: 'auto',
          }}
        />
        {flattenVisible(pageNodes).map((node) => (
          <NodeView key={node.id} node={node} nodes={pageNodes} />
        ))}
      </div>

      {device && artboardScreen ? (
        <div
          className="calque-canvas-label"
          style={{ left: artboardScreen.left, top: artboardScreen.top - 26, width: artboardScreen.width, pointerEvents: 'none' }}
        >
          {page?.name} — {device.label}
        </div>
      ) : null}

      {estVide && artboardScreen ? (
        <div
          className="calque-canvas-empty"
          style={{
            left: artboardScreen.left,
            top: artboardScreen.top,
            width: artboardScreen.width,
            height: artboardScreen.height,
            pointerEvents: 'none',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" strokeDasharray="3 3" />
            <path d="M12 10.5v3M10.5 12h3" />
          </svg>
          <p className="calque-canvas-empty-title">Le plan de travail est vide</p>
          <p className="calque-canvas-empty-hint">
            Choisissez un outil dans la barre du haut,
            <br />
            puis tracez ici en maintenant le clic.
          </p>
          <span className="calque-canvas-empty-shortcuts">R rectangle · T texte · F cadre</span>
        </div>
      ) : null}

      <SelectionOverlay />

      {outilActif ? (
        <div className="calque-canvas-toolinfo">
          <ToolIcon tool={outilActif} />
          <span>
            Outil <strong>{TOOL_LABELS[outilActif]}</strong> actif — tracez sur la zone claire
          </span>
        </div>
      ) : null}
    </div>
  )
}
