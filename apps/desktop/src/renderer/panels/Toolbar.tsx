// Barre d outils (Tache 16, decision 1 et 8 ; branchement Tache 17 ;
// refonte visuelle). Porte les six outils de creation, le zoom, annuler/
// retablir et les points d entree Figma/export/reglages.
//
// Cibles d export : rendues par api.listExporters() (Tache 17), plutot
// que par la constante locale de la Tache 16 -- le renderer n importe
// toujours JAMAIS @calque/codegen (regle testee par ailleurs), il passe
// desormais par le nouveau canal expose sur CalqueApi
// (apps/desktop/src/shared/api.ts). L'API est recue en propriete (comme
// ClaudePanel), jamais via window.calque directement, pour rester
// testable sans preload.
//
// Import Figma et export sont maintenant actifs (Tache 17) : le bouton
// d import ouvre FigmaImportDialog, et chaque cible du menu d export
// ouvre ExportDialog pre-selectionne sur cette cible.
//
// Refonte visuelle : les icones passent de glyphes texte/emoji a des SVG
// en traits (fidele aux maquettes), et chaque outil de creation porte
// desormais son raccourci clavier (V/F/R/E/T/I, actives dans Canvas.tsx)
// dans son infobulle -- aria-label reste inchange (teste verbatim par
// toolbar.test.tsx), seul `title` gagne le raccourci.
//
// Defaut n1 (« les reglages ont disparu ») : le bouton Reglages porte
// desormais un LIBELLE VISIBLE, au meme format (icone + texte, meme
// hauteur, meme bordure -- classe `toolbar-button-text`, partagee avec
// "Importer Figma" et "Exporter") que ses voisins -- il n'est plus une
// icone ronde isolee que rien ne distingue d'une simple decoration.
// L'etat d'ouverture du dialogue des reglages remonte desormais a
// Editeur (App.tsx), qui le rend une seule fois : c'est ce qui permet au
// panneau Claude (ClaudePanel.tsx, frere de ce composant) d'ouvrir CE
// MEME dialogue depuis son renvoi, sans dupliquer l'etat ni le dialogue.
//
// Defaut n2 (menu d'export coupe) : `.toolbar` a `overflow-y: hidden`
// (defilement horizontal quand tous les groupes ne tiennent plus sur une
// ligne, voir Toolbar.css) -- un menu positionne en `absolute` a
// l'interieur de ce conteneur etait donc rogne des qu'il depassait le bas
// de la barre d'outils (seul son bord arrondi superieur restait visible).
// La cause, pas le symptome : `ExporterMenu` ci-dessous rend le menu dans
// un portail (`createPortal`) directement sous `document.body`, en dehors
// de tout conteneur a `overflow` -- plus jamais rogne, quel que soit le
// contexte d'empilement du bouton qui l'ouvre -- et calcule sa position
// en `fixed` a partir du rectangle reel du bouton, en se repliant s'il ne
// tiendrait pas a l'ecran (au-dessus au lieu d'en dessous, borde
// horizontalement) pres d'un bord de fenetre.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import { createScreenCommand, createScreenNode, isScreenNode } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { Tool } from '../state/editorStore'
import type { CalqueApi, ExporterId, ExportTargetInfo } from '../../shared/api'
import { FigmaImportDialog } from '../dialogs/FigmaImportDialog'
import { ExportDialog } from '../dialogs/ExportDialog'
import { pageNodesOf } from '../canvas/useDragInteraction'
import { nextScreenPosition } from '../canvas/screenLayout'
import { clampZoom } from '../canvas/viewport'
import './Toolbar.css'

type IconProps = { children: ReactNode }

function Icon({ children }: IconProps) {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  )
}

const TOOLS: { id: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  {
    id: 'select',
    label: 'Sélection',
    shortcut: 'V',
    icon: (
      <Icon>
        <path d="M3 2l9 5.2-4 1-1.6 4.2z" strokeLinejoin="round" />
      </Icon>
    ),
  },
  {
    id: 'frame',
    label: 'Frame',
    shortcut: 'F',
    icon: (
      <Icon>
        <path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13" />
      </Icon>
    ),
  },
  {
    id: 'rect',
    label: 'Rectangle',
    shortcut: 'R',
    icon: (
      <Icon>
        <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
      </Icon>
    ),
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    shortcut: 'E',
    icon: (
      <Icon>
        <circle cx="8" cy="8" r="5.5" />
      </Icon>
    ),
  },
  {
    id: 'text',
    label: 'Texte',
    shortcut: 'T',
    icon: (
      <Icon>
        <path d="M3 3.5h10M8 3.5v9M6 12.5h4" />
      </Icon>
    ),
  },
  {
    id: 'image',
    label: 'Image',
    shortcut: 'I',
    icon: (
      <Icon>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <circle cx="6" cy="6.5" r="1.1" />
        <path d="M2.6 11.5l3.2-3 2.4 2.2 2-1.8 3.2 2.9" />
      </Icon>
    ),
  },
]

const ZOOM_STEP = 0.1

const MARGE_ECRAN = 8

// Portail (voir la note de defaut n2 en tete de fichier) : mesure le
// bouton ancre ET le menu lui-meme (apres son premier rendu, hors-ecran)
// pour placer ce dernier en `position: fixed`, replie au besoin pour
// rester entierement visible pres d'un bord de fenetre.
function ExporterMenu({
  anchorRef,
  targets,
  onPick,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>
  targets: ExportTargetInfo[]
  onPick: (id: ExporterId) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ top: number; left: number; visibility: 'hidden' | 'visible' }>({
    top: 0,
    left: 0,
    visibility: 'hidden',
  })

  useLayoutEffect(() => {
    function reposition() {
      const anchor = anchorRef.current
      const menu = menuRef.current
      if (!anchor || !menu) return

      const anchorRect = anchor.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()

      // Par defaut : sous l'ancre, bord droit aligne sur son bord droit
      // (comme avant la correction).
      let top = anchorRect.bottom + 4
      let left = anchorRect.right - menuRect.width

      // Ne tient pas en dessous jusqu'au bas de l'ecran : bascule
      // au-dessus de l'ancre plutot que de deborder hors de la fenetre.
      if (top + menuRect.height > window.innerHeight - MARGE_ECRAN) {
        top = anchorRect.top - menuRect.height - 4
      }
      if (top < MARGE_ECRAN) top = MARGE_ECRAN

      // Deborderait a droite ou a gauche : borde a la fenetre avec une
      // marge, jamais coupe ni hors-ecran.
      if (left + menuRect.width > window.innerWidth - MARGE_ECRAN) {
        left = window.innerWidth - MARGE_ECRAN - menuRect.width
      }
      if (left < MARGE_ECRAN) left = MARGE_ECRAN

      setStyle({ top, left, visibility: 'visible' })
    }

    reposition()
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [anchorRef, targets])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Cibles d'export"
      className="toolbar-export-menu"
      style={{ position: 'fixed', top: style.top, left: style.left, visibility: style.visibility }}
    >
      {targets.map((target) => (
        <button
          key={target.id}
          type="button"
          role="menuitem"
          className="toolbar-export-item"
          onClick={() => onPick(target.id)}
        >
          {target.label} <span className="toolbar-badge">{target.maturity === 'preview' ? 'aperçu' : 'complet'}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

export function Toolbar({ api, onOpenSettings }: { api: CalqueApi; onOpenSettings: () => void }) {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const requestFitToWindow = useEditorStore((s) => s.requestFitToWindow)
  const history = useEditorStore((s) => s.history)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  // Souscription supplementaire, necessaire pour que la barre d'outils se
  // re-rende quand l'historique change : `history` est un objet MUTE en
  // place par editorStore (execute/undo/redo ne le remplacent jamais dans
  // le magasin), donc une selection sur `s.history` seule ne change jamais
  // de reference et ne declenche aucun rendu. `document`, lui, est bien
  // remplace a chaque execute/undo/redo : le souscrire ici sert de signal
  // de rafraichissement pour lire `history.canUndo`/`canRedo`/`undoLabels`
  // a jour. Sa valeur sert desormais aussi (v2, addendum navigation) a
  // "Nouvel ecran" ci-dessous, qui a besoin du document courant pour
  // trouver la page et ses ecrans existants.
  const document_ = useEditorStore((s) => s.document)

  // v2 (addendum navigation §4) : bouton "Nouvel ecran" et bascule
  // d'affichage du calque de connecteurs (linksVisible).
  const pageId = useEditorStore((s) => s.pageId)
  const execute = useEditorStore((s) => s.execute)
  const select = useEditorStore((s) => s.select)
  const linksVisible = useEditorStore((s) => s.linksVisible)
  const toggleLinksVisible = useEditorStore((s) => s.toggleLinksVisible)

  // Place le nouvel ecran a droite du dernier (le plus a droite parmi ceux
  // qui existent deja), gouttiere fixe (voir screenLayout.ts), avec le
  // gabarit par defaut de la page (Page.device -- §3.1 : « Page.device
  // devient le gabarit par défaut des nouveaux écrans »). Le selectionne
  // aussitot cree : select() derive alors activeScreenId de lui-meme (voir
  // editorStore.ts), ce qui en fait naturellement l'ecran "actif" sans
  // appel supplementaire.
  function nouvelEcran() {
    const page = document_.pages.find((p) => p.id === pageId)
    if (!page) return
    const screens = pageNodesOf(document_, pageId).filter(isScreenNode)
    const { x, y } = nextScreenPosition(screens)
    const device = page.device
    const screen = createScreenNode(`Écran ${screens.length + 1}`, device, { x, y, w: device.width, h: device.height })
    execute(createScreenCommand(pageId, screen))
    select([screen.id])
  }

  const [exportOpen, setExportOpen] = useState(false)
  const [exportTargets, setExportTargets] = useState<ExportTargetInfo[]>([])
  const [exporterOuvert, setExporterOuvert] = useState<ExporterId | null>(null)
  const [figmaOuvert, setFigmaOuvert] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    let annule = false
    api.listExporters().then((targets) => {
      if (!annule) setExportTargets(targets)
    })
    return () => {
      annule = true
    }
  }, [exportOpen, api])

  const canUndo = history.canUndo
  const canRedo = history.canRedo
  const nextUndoLabel = history.undoLabels[0]

  return (
    <header className="toolbar" aria-label="Barre d'outils">
      <div className="toolbar-group toolbar-group-tools" role="group" aria-label="Outils de création">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={`${t.label} — ${t.shortcut}`}
            className={tool === t.id ? 'toolbar-button toolbar-button-active' : 'toolbar-button'}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <span className="toolbar-separator" aria-hidden="true" />

      <div className="toolbar-group" role="group" aria-label="Zoom">
        <button
          type="button"
          aria-label="Réduire le zoom"
          title="Réduire le zoom"
          className="toolbar-button toolbar-button-outline"
          onClick={() => setZoom(clampZoom(zoom - ZOOM_STEP))}
        >
          <Icon>
            <path d="M3.5 8h9" strokeLinecap="round" />
          </Icon>
        </button>
        <button
          type="button"
          aria-label="Réinitialiser le zoom"
          title="Réinitialiser le zoom"
          className="toolbar-button toolbar-zoom-value"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Agrandir le zoom"
          title="Agrandir le zoom"
          className="toolbar-button toolbar-button-outline"
          onClick={() => setZoom(clampZoom(zoom + ZOOM_STEP))}
        >
          <Icon>
            <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
          </Icon>
        </button>
        {/* Finition v1 : l'ajustement automatique ne reagit plus au
            redimensionnement de la fenetre (voir Canvas.tsx) -- ce bouton
            est desormais le seul moyen de le redeclencher a la demande. */}
        <button
          type="button"
          aria-label="Ajuster à la fenêtre"
          title="Ajuster à la fenêtre"
          className="toolbar-button toolbar-button-outline"
          onClick={requestFitToWindow}
        >
          <Icon>
            <path d="M2 6V3.5a1.5 1.5 0 0 1 1.5-1.5H6M10 2h2.5A1.5 1.5 0 0 1 14 3.5V6M14 10v2.5a1.5 1.5 0 0 1-1.5 1.5H10M6 14H3.5A1.5 1.5 0 0 1 2 12.5V10" />
          </Icon>
        </button>
      </div>

      <span className="toolbar-separator" aria-hidden="true" />

      <div className="toolbar-group" role="group" aria-label="Historique">
        <button
          type="button"
          aria-label="Annuler"
          className="toolbar-button"
          disabled={!canUndo}
          title={canUndo ? `Annuler : ${nextUndoLabel}` : 'Rien à annuler'}
          onClick={undo}
        >
          <Icon>
            <path d="M6 3.5L2.5 7 6 10.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 7h6.8A3.7 3.7 0 0 1 13 10.7v0A3.7 3.7 0 0 1 9.3 14.4H6" strokeLinecap="round" strokeLinejoin="round" />
          </Icon>
        </button>
        <button
          type="button"
          aria-label="Rétablir"
          className="toolbar-button"
          disabled={!canRedo}
          title={canRedo ? 'Rétablir la dernière action annulée' : 'Rien à rétablir'}
          onClick={redo}
        >
          <Icon>
            <path d="M10 3.5L13.5 7 10 10.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.5 7H6.7A3.7 3.7 0 0 0 3 10.7v0a3.7 3.7 0 0 0 3.7 3.7H10" strokeLinecap="round" strokeLinejoin="round" />
          </Icon>
        </button>
      </div>

      <span className="toolbar-separator" aria-hidden="true" />

      {/* v2 (addendum navigation §4) : "Nouvel écran" (place a droite du
          dernier, voir screenLayout.ts) et la bascule d'affichage du
          calque de connecteurs persistes (LinksLayer.tsx, plan de
          travail). */}
      <div className="toolbar-group" role="group" aria-label="Écrans et liens">
        <button type="button" aria-label="Nouvel écran" className="toolbar-button-text" onClick={nouvelEcran}>
          <Icon>
            <path d="M5 1.5v13M11 1.5v13M1.5 5h13M1.5 11h13" />
          </Icon>
          Nouvel écran
        </button>
        <button
          type="button"
          aria-label="Afficher les liens"
          aria-pressed={linksVisible}
          title={linksVisible ? 'Masquer les liens' : 'Afficher les liens'}
          className={linksVisible ? 'toolbar-button toolbar-button-active' : 'toolbar-button'}
          onClick={toggleLinksVisible}
        >
          <Icon>
            <path d="M6.5 9.5l3-3M6 4.5H4A2.5 2.5 0 0 0 1.5 7v0A2.5 2.5 0 0 0 4 9.5h2M10 4.5h2A2.5 2.5 0 0 1 14.5 7v0A2.5 2.5 0 0 1 12 9.5h-2" strokeLinecap="round" />
          </Icon>
        </button>
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-group" role="group" aria-label="Figma et export">
        <button type="button" aria-label="Importer depuis Figma" className="toolbar-button-text" onClick={() => setFigmaOuvert(true)}>
          <Icon>
            <path d="M8 1.5v13M3.2 4.2l9.6 5.6M12.8 4.2L3.2 9.8" />
          </Icon>
          Importer Figma
        </button>

        <div className="toolbar-export">
          <button
            ref={exportButtonRef}
            type="button"
            aria-label="Exporter"
            aria-expanded={exportOpen}
            className="toolbar-button-text"
            onClick={() => setExportOpen((v) => !v)}
          >
            <Icon>
              <path d="M8 10.5V2.5M5 5.5L8 2.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 10v3.5h11V10" strokeLinecap="round" strokeLinejoin="round" />
            </Icon>
            Exporter
          </button>
          {exportOpen ? (
            <ExporterMenu
              anchorRef={exportButtonRef}
              targets={exportTargets}
              onPick={(id) => {
                setExporterOuvert(id)
                setExportOpen(false)
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="toolbar-group" role="group" aria-label="Réglages de l'application">
        {/* Defaut n1 : meme format que "Importer Figma"/"Exporter" ci-dessus
            (icone + LIBELLE VISIBLE, classe toolbar-button-text partagee) --
            avant cette correction, seule une icone ronde isolee (classe
            toolbar-button-outline) distinguait ce bouton, sans rien qui le
            rattache visuellement aux reglages qu'il ouvre. */}
        <button type="button" aria-label="Réglages" title="Réglages" className="toolbar-button-text" onClick={onOpenSettings}>
          <Icon>
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5" />
          </Icon>
          Réglages
        </button>
      </div>

      {figmaOuvert ? <FigmaImportDialog api={api} onClose={() => setFigmaOuvert(false)} /> : null}
      {exporterOuvert ? (
        <ExportDialog api={api} exporterId={exporterOuvert} onClose={() => setExporterOuvert(null)} />
      ) : null}
    </header>
  )
}
