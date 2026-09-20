// Barre d outils (Tache 16, decision 1 et 8 ; branchement Tache 17).
// Porte les six outils de creation, le zoom, annuler/retablir et les
// points d entree Figma/export.
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
import { useEffect, useState } from 'react'
import { useEditorStore } from '../state/editorStore'
import type { Tool } from '../state/editorStore'
import type { CalqueApi, ExporterId, ExportTargetInfo } from '../../shared/api'
import { FigmaImportDialog } from '../dialogs/FigmaImportDialog'
import { ExportDialog } from '../dialogs/ExportDialog'
import './Toolbar.css'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Selection', icon: '⬜' },
  { id: 'frame', label: 'Frame', icon: '▢' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'text', label: 'Texte', icon: 'T' },
  { id: 'image', label: 'Image', icon: '\u{1F5BC}' },
]

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.1
const ZOOM_MAX = 8

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export function Toolbar({ api }: { api: CalqueApi }) {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
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
    <header className="toolbar" aria-label="Barre d outils">
      <div className="toolbar-group" role="group" aria-label="Outils de creation">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            title={t.label}
            className={tool === t.id ? 'toolbar-button toolbar-button-active' : 'toolbar-button'}
            onClick={() => setTool(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-group" role="group" aria-label="Zoom">
        <button type="button" aria-label="Reduire le zoom" className="toolbar-button" onClick={() => setZoom(clampZoom(zoom - ZOOM_STEP))}>
          -
        </button>
        <button type="button" aria-label="Reinitialiser le zoom" className="toolbar-button" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" aria-label="Agrandir le zoom" className="toolbar-button" onClick={() => setZoom(clampZoom(zoom + ZOOM_STEP))}>
          +
        </button>
      </div>

      <div className="toolbar-group" role="group" aria-label="Historique">
        <button
          type="button"
          aria-label="Annuler"
          className="toolbar-button"
          disabled={!canUndo}
          title={canUndo ? `Annuler : ${nextUndoLabel}` : 'Rien a annuler'}
          onClick={undo}
        >
          {'↶'}
        </button>
        <button
          type="button"
          aria-label="Retablir"
          className="toolbar-button"
          disabled={!canRedo}
          title={canRedo ? 'Retablir la derniere action annulee' : 'Rien a retablir'}
          onClick={redo}
        >
          {'↷'}
        </button>
      </div>

      <div className="toolbar-group" role="group" aria-label="Figma et export">
        <button
          type="button"
          aria-label="Importer depuis Figma"
          className="toolbar-button"
          onClick={() => setFigmaOuvert(true)}
        >
          Importer Figma
        </button>

        <div className="toolbar-export">
          <button
            type="button"
            aria-label="Exporter"
            aria-expanded={exportOpen}
            className="toolbar-button"
            onClick={() => setExportOpen((v) => !v)}
          >
            Exporter
          </button>
          {exportOpen ? (
            <div role="menu" aria-label="Cibles d export" className="toolbar-export-menu">
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

      {figmaOuvert ? <FigmaImportDialog api={api} onClose={() => setFigmaOuvert(false)} /> : null}
      {exporterOuvert ? (
        <ExportDialog api={api} exporterId={exporterOuvert} onClose={() => setExporterOuvert(null)} />
      ) : null}
    </header>
  )
}
