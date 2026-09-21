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
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditorStore } from '../state/editorStore'
import type { Tool } from '../state/editorStore'
import type { CalqueApi, ExporterId, ExportTargetInfo } from '../../shared/api'
import { FigmaImportDialog } from '../dialogs/FigmaImportDialog'
import { ExportDialog } from '../dialogs/ExportDialog'
import { SettingsDialog } from '../dialogs/SettingsDialog'
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

export function Toolbar({ api }: { api: CalqueApi }) {
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
  // a jour, meme si sa valeur n'est pas utilisee directement plus bas.
  useEditorStore((s) => s.document)

  const [exportOpen, setExportOpen] = useState(false)
  const [exportTargets, setExportTargets] = useState<ExportTargetInfo[]>([])
  const [exporterOuvert, setExporterOuvert] = useState<ExporterId | null>(null)
  const [figmaOuvert, setFigmaOuvert] = useState(false)
  // Correction round 2 (Critical) : sans ce dialogue, aucun composant
  // n'appelait jamais setFigmaToken/getSettings -- l'import Figma par
  // l'API etait inatteignable pour un utilisateur (jeton toujours absent).
  const [reglagesOuverts, setReglagesOuverts] = useState(false)

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
            <div role="menu" aria-label="Cibles d'export" className="toolbar-export-menu">
              {exportTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  className="toolbar-export-item"
                  onClick={() => {
                    setExporterOuvert(target.id)
                    setExportOpen(false)
                  }}
                >
                  {target.label}{' '}
                  <span className="toolbar-badge">{target.maturity === 'preview' ? 'aperçu' : 'complet'}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="toolbar-group" role="group" aria-label="Réglages de l'application">
        <button
          type="button"
          aria-label="Réglages"
          title="Réglages"
          className="toolbar-button toolbar-button-outline"
          onClick={() => setReglagesOuverts(true)}
        >
          <Icon>
            <circle cx="8" cy="8" r="2.2" />
            <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5" />
          </Icon>
        </button>
      </div>

      {figmaOuvert ? <FigmaImportDialog api={api} onClose={() => setFigmaOuvert(false)} /> : null}
      {exporterOuvert ? (
        <ExportDialog api={api} exporterId={exporterOuvert} onClose={() => setExporterOuvert(null)} />
      ) : null}
      {reglagesOuverts ? <SettingsDialog api={api} onClose={() => setReglagesOuverts(false)} /> : null}
    </header>
  )
}
