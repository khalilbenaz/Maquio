// Canevas d'edition (Tache 15, refonte visuelle et ergonomique). Rendu DOM
// absolu de la page courante, plus le calque SVG de superposition
// (SelectionOverlay). Le plan de travail (data-testid="canvas-background")
// gere le clic-dans-le-vide (desselection) ainsi que le cliquer-glisser de
// creation (decision 11) -- cette mecanique (useDragInteraction.ts) n'est
// pas touchee par la refonte.
//
// Ce que la refonte change ici, precisement :
// - le plan de travail est desormais CENTRE et AJUSTE pour tenir dans la
//   zone visible a l'ouverture d'un document (voir viewport.ts /
//   computeFitTransform), au lieu de rester fige a 100 % au point (0,0) du
//   monde -- finition v1 : cet ajustement ne se recalcule PLUS a chaque
//   redimensionnement de la fenetre (un zoom choisi a la main n'est donc
//   plus ecrase), le bouton "Ajuster a la fenetre" de la barre d'outils
//   permet de le redeclencher a la demande (voir fitToWindowToken plus
//   bas) ;
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
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import { PALETTE_ITEMS, compositeCommand, deleteNodeCommand, findNode, isScreenNode, unionRects } from '@calque/core'
import type { FrameNode, Node as CalqueNode } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { Tool } from '../state/editorStore'
import type { CalqueApi } from '../../shared/api'
import { NodeView } from './NodeView'
import { SelectionOverlay } from './SelectionOverlay'
import { LinksLayer } from './LinksLayer'
import {
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  nudgeSelection,
  pasteClipboard,
  reorderSelection,
  ungroupSelection,
} from '../state/arrangeActions'
import { PALETTE_MIME, insertPaletteItemAt } from './paletteInsert'
import { pageNodesOf, screenToPage, startMarquee, useCreateInteraction, useNodeInteraction } from './useDragInteraction'
import { computeFitTransform, computeFitTransformToBounds, computeWheelZoom } from './viewport'
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

// Etiquette d'un ecran : elle sert de POIGNEE de deplacement de l'ecran
// (le corps de l'ecran est une zone de selection par rectangle).
function ScreenLabel({ screen, active, style }: { screen: FrameNode; active: boolean; style: CSSProperties }) {
  const onPointerDown = useNodeInteraction(screen.id)
  return (
    <div
      data-testid={`screen-label-${screen.id}`}
      className={active ? 'calque-canvas-label calque-canvas-label-active' : 'calque-canvas-label'}
      style={{ ...style, pointerEvents: screen.locked ? 'none' : 'auto', cursor: 'grab' }}
      onPointerDown={screen.locked ? undefined : onPointerDown}
    >
      {screen.name} — {screen.device!.label}
    </div>
  )
}

export function Canvas({ api }: { api: CalqueApi }) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const zoom = useEditorStore((s) => s.zoom)
  const pan = useEditorStore((s) => s.pan)
  const tool = useEditorStore((s) => s.tool)
  const dragPreview = useEditorStore((s) => s.dragPreview)
  const fitToWindowToken = useEditorStore((s) => s.fitToWindowToken)

  const linksVisible = useEditorStore((s) => s.linksVisible)
  const activeScreenId = useEditorStore((s) => s.activeScreenId)

  const onBackgroundPointerDown = useCreateInteraction(canvasRef, api)

  const page = document_.pages.find((p) => p.id === pageId)
  const device = page?.device

  // v2 (addendum navigation §4) : plusieurs ecrans visibles a la fois, cote
  // a cote sur le plan de travail. `screens` filtre les noeuds de premier
  // niveau qui EN SONT (frame + device) -- une page sans aucun ecran
  // (document v1 non migre, ou construit a la main pour les tests de
  // l'engin d'interaction generique) retombe exactement sur le
  // comportement v1 (voir l'effet d'ajustement et le fond ci-dessous).
  const screens = pageNodesOf(document_, pageId).filter(isScreenNode)

  // Ajustement et centrage du plan de travail (correction du defaut
  // fonctionnel principal de la refonte). Finition v1 (correction d'un
  // second defaut, signale par nous-memes en revue) : cet ajustement ne se
  // recalcule plus QU'A L'OUVERTURE D'UN DOCUMENT -- montage, ouverture de
  // fichier, import Figma, nouveau document, tous representes ici par un
  // changement de `pageId` (chaque document charge via load() recoit un
  // nouvel identifiant de page) ou des dimensions de l'appareil edite --
  // et sur demande explicite via `fitToWindowToken` (bouton "Ajuster a la
  // fenetre" de la barre d'outils, voir Toolbar.tsx). Il ne reagit PLUS au
  // redimensionnement de la fenetre : avant cette correction, un
  // utilisateur qui avait zoome a la main puis redimensionnait la fenetre
  // perdait silencieusement son reglage, l'ajustement automatique
  // l'ecrasant a chaque resize.
  //
  // Sous jsdom (tests), le conteneur n'a jamais de dimensions reelles
  // (getBoundingClientRect() rend des zeros, aucune mise en page n'etant
  // executee) : computeFitTransform rend alors ses valeurs neutres (zoom 1,
  // pan {0,0}) et cet effet n'a aucun effet observable, ce qui laisse les
  // tests existants (qui supposent ce zoom et ce pan par defaut apres un
  // load()) inchanges.
  // v2 (addendum navigation §4 : « l'ajustement à la fenêtre cadre tous les
  // écrans »). Une page avec au moins un ecran est cadree sur l'UNION de
  // TOUS ses ecrans (computeFitTransformToBounds), pas seulement le
  // premier -- avant cette correction, une page a plusieurs ecrans aurait
  // ete cadree sur le seul `page.device`, coupant les ecrans suivants hors
  // champ. Une page SANS aucun ecran retombe sur l'ancien comportement v1
  // (cadrage sur `page.device` seul), inchange.
  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    if (screens.length > 0) {
      const bounds = unionRects(screens.map((s) => s.frame))
      const { zoom: zoomAjuste, pan: panAjuste } = computeFitTransformToBounds(
        { width: rect.width, height: rect.height },
        bounds,
      )
      useEditorStore.getState().setZoom(zoomAjuste)
      useEditorStore.getState().setPan(panAjuste)
      return
    }

    if (!device) return
    const { zoom: zoomAjuste, pan: panAjuste } = computeFitTransform(
      { width: rect.width, height: rect.height },
      { width: device.width, height: device.height },
    )
    useEditorStore.getState().setZoom(zoomAjuste)
    useEditorStore.getState().setPan(panAjuste)
  }, [pageId, device?.width, device?.height, fitToWindowToken, screens.length])

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
        // Une seule commande composite pour toute la selection : un seul
        // « annuler » restaure tous les noeuds supprimes.
        deleteSelection()
        return
      }

      if (isMod && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelection()
        return
      }
      if (isMod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        if (e.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (isMod && (e.key === ']' || e.key === '[')) {
        e.preventDefault()
        reorderSelection(e.key === ']' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward')
        return
      }
      // Fleches : deplacement de 1 px (10 avec Maj).
      if (!isMod && state.selection.length > 0 && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        nudgeSelection(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
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

    // Copier / couper / coller : evenements DOM (le menu natif Edition les
    // declenche via ses roles ; un keydown Cmd+C n'arrive jamais ici).
    function onCopy(e: ClipboardEvent) {
      if (isTextInput(window.document.activeElement)) return
      if (copySelection()) e.preventDefault()
    }
    function onCut(e: ClipboardEvent) {
      if (isTextInput(window.document.activeElement)) return
      if (cutSelection()) e.preventDefault()
    }
    function onPaste(e: ClipboardEvent) {
      if (isTextInput(window.document.activeElement)) return
      e.preventDefault()
      pasteClipboard()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
    }
  }, [])

  // Clic sur la zone sombre (hors plan de travail) : desselectionne.
  // `e.target !== e.currentTarget` exclut tout clic qui a deja ete gere
  // par un descendant (plan de travail, noeud, poignee -- qui appellent
  // deja select()/select([]) eux-memes ou stoppent la propagation) : cette
  // zone ne reagit qu'a un clic qui la touche elle, directement.
  function onScenePointerDown(e: ReactPointerEvent) {
    if (e.target !== e.currentTarget) return
    if (useEditorStore.getState().tool === 'select') startMarquee(e)
    else useEditorStore.getState().select([])
  }

  // Glisser-deposer depuis la palette : le depot cree le composant sous le
  // curseur (point de PAGE, voir screenToPage), dans le conteneur le plus
  // profond -- placePaletteItem choisit parent et cadre.
  function onPaletteDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(PALETTE_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onPaletteDrop(e: DragEvent) {
    const id = e.dataTransfer.getData(PALETTE_MIME)
    if (id === '') return
    e.preventDefault()
    const item = PALETTE_ITEMS.find((i) => i.id === id)
    if (item === undefined || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return
    const state = useEditorStore.getState()
    const rect = canvasRef.current?.getBoundingClientRect()
    const origin = rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 }
    insertPaletteItemAt(item, screenToPage({ x: e.clientX, y: e.clientY }, origin, state.zoom, state.pan))
  }

  const pageNodes = pageNodesOf(document_, pageId)
  const outilActif = tool !== 'select' ? tool : null

  // v2 (addendum navigation §4) : "le plan de travail est vide" ne peut
  // plus se lire comme "la page n'a aucun noeud de premier niveau" des
  // qu'elle porte des ecrans -- un ecran fraichement cree EST un noeud de
  // premier niveau, vide de contenu. Une page avec au moins un ecran est
  // vide quand TOUS ses ecrans le sont ; une page sans ecran retombe sur
  // l'ancien critere v1 (aucun changement pour les tests/documents qui ne
  // connaissent pas encore les ecrans).
  const estVide = screens.length > 0 ? screens.every((s) => s.children.length === 0) : pageNodes.length === 0

  const artboardScreen = device
    ? { left: pan.x, top: pan.y, width: device.width * zoom, height: device.height * zoom }
    : null

  // Cadre ecran (pixels ecran, pour positionner etiquette/etat vide) d'un
  // ecran donne, converti depuis son cadre de PAGE (absolu, puisque de
  // premier niveau) via le zoom/panoramique courants.
  function screenScreenRect(s: FrameNode) {
    return { left: pan.x + s.frame.x * zoom, top: pan.y + s.frame.y * zoom, width: s.frame.w * zoom, height: s.frame.h * zoom }
  }

  // L'ecran sur lequel afficher l'etat vide : l'ecran actif s'il en existe
  // un et qu'il est bien de cette page, sinon le premier ecran de la page.
  const ecranPourEtatVide = screens.find((s) => s.id === activeScreenId) ?? screens[0]

  return (
    <div
      ref={canvasRef}
      className="calque-canvas"
      data-testid="canvas-scene"
      onPointerDown={onScenePointerDown}
      onDragOver={onPaletteDragOver}
      onDrop={onPaletteDrop}
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

        {/* Correctif parentage (§3) : liseré en accent sur l'ecran survole
            par le noeud en cours de deplacement, quand il differe de son
            ecran englobant actuel -- dragPreview.targetScreenId ne porte
            cette valeur que dans ce cas precis (voir useNodeInteraction).
            Rendu dans le meme conteneur transforme que les ecrans eux-memes
            (canvas-canvas-world), donc en unites de PAGE directement, comme
            canvas-background ci-dessus. */}
        {dragPreview !== null && dragPreview.kind === 'move' && dragPreview.targetScreenId !== null
          ? (() => {
              const cible = screens.find((s) => s.id === dragPreview.targetScreenId)
              if (cible === undefined) return null
              return (
                <div
                  data-testid={`screen-drop-target-${cible.id}`}
                  className="calque-canvas-drop-target"
                  style={{
                    position: 'absolute',
                    left: cible.frame.x,
                    top: cible.frame.y,
                    width: cible.frame.w,
                    height: cible.frame.h,
                    pointerEvents: 'none',
                  }}
                />
              )
            })()
          : null}
      </div>

      {/* v2 (addendum navigation §4) : une etiquette par ecran (nom +
          gabarit), au-dessus de CHACUN d'eux -- l'etiquette de l'ecran actif
          est en accent. Une page sans aucun ecran retombe sur l'ancienne
          etiquette unique (v1, basee sur page.device). */}
      {screens.length > 0
        ? screens.map((s) => {
            const rect = screenScreenRect(s)
            return (
              <ScreenLabel
                key={s.id}
                screen={s}
                active={s.id === activeScreenId}
                style={{ left: rect.left, top: rect.top - 26, width: rect.width }}
              />
            )
          })
        : device && artboardScreen ? (
            <div
              className="calque-canvas-label"
              style={{ left: artboardScreen.left, top: artboardScreen.top - 26, width: artboardScreen.width, pointerEvents: 'none' }}
            >
              {page?.name} — {device.label}
            </div>
          ) : null}

      {/* v2 (addendum navigation §4) : calque de connecteurs persistes,
          affiche/masque par le bouton "Liens" de la barre d'outils, et
          jamais rendu pendant un glissement (dragPreview !== null) quel
          qu'il soit -- pas seulement celui de la poignee de lien -- pour ne
          jamais encombrer un geste de deplacement/redimensionnement/
          creation en cours. */}
      {linksVisible && dragPreview === null ? (
        <svg
          data-testid="links-layer-svg"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <LinksLayer />
          </g>
        </svg>
      ) : null}

      {estVide && (ecranPourEtatVide ? screenScreenRect(ecranPourEtatVide) : artboardScreen) ? (
        <div
          className="calque-canvas-empty"
          style={(() => {
            const rect = ecranPourEtatVide ? screenScreenRect(ecranPourEtatVide) : artboardScreen!
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, pointerEvents: 'none' as const }
          })()}
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

      <SelectionOverlay canvasRef={canvasRef} />

      {/* Correctif parentage : un outil de creation actif capture le geste
          sur TOUT le canevas, par-dessus les ecrans et les noeuds deja
          presents -- pas seulement sur l'ancien "canvas-background" (le
          plan de travail v1, borne a page.device et desormais recouvert
          par le premier ecran des qu'il en existe un : useNodeInteraction,
          attache a chaque NodeView, capturerait sinon le pointerdown en
          premier -- e.stopPropagation() y est inconditionnel -- sans rien
          faire tant que l'outil actif n'est pas 'select'). Rendu tout en
          haut de la pile (apres SelectionOverlay), actif UNIQUEMENT quand
          un outil de creation est selectionne : aucune interference avec
          la selection, le deplacement ou les poignees en mode 'select'. */}
      {outilActif ? (
        <div
          data-testid="canvas-create-overlay"
          onPointerDown={onBackgroundPointerDown}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'crosshair' }}
        />
      ) : null}

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
