// Dialogue d'import Figma (Tache 17, decision 6 du brief) : import tout
// ou rien -- le document courant n'est remplace (via useEditorStore.load)
// que si l'import ET la traduction reussissent integralement ; en cas
// d'echec (jeton absent, erreur Figma, traduction impossible), rien n'est
// touche et le message d'erreur (deja traduit en francais par le pont,
// jamais le jeton) est affiche tel quel. Le rapport d'import (nombre de
// noeuds, avertissements) est affiche a la fin pour que l'utilisateur
// voie ce qui a ete approxime.
import { useState } from 'react'
import { parseDocument } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { CalqueApi } from '../../shared/api'
import './Dialog.css'

type Statut = 'idle' | 'loading' | 'error' | 'succes'

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function FigmaImportDialog({ api, onClose }: { api: CalqueApi; onClose: () => void }) {
  const [cleOuLien, setCleOuLien] = useState('')
  const [statut, setStatut] = useState<Statut>('idle')
  const [erreur, setErreur] = useState('')
  const [nodesImportes, setNodesImportes] = useState(0)
  const [avertissements, setAvertissements] = useState<string[]>([])

  async function importerDepuis(source: { source: 'api'; fileKey: string } | { source: 'file' }) {
    setStatut('loading')
    setErreur('')
    try {
      const resultat = await api.importFigma(source)
      if (resultat === null) {
        setStatut('idle')
        return
      }
      // Tout ou rien : le document courant n'est remplace qu'ici, une
      // fois l'import ET la traduction deja entierement reussis cote main
      // (voir figmaHandlers.ts) -- jamais avant.
      const document = parseDocument(resultat.json)
      useEditorStore.getState().load(document)
      setNodesImportes(resultat.report.nodesImported)
      setAvertissements(resultat.report.warnings.map((w) => `${w.nodeName} : ${w.reason}`))
      setStatut('succes')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setStatut('error')
    }
  }

  return (
    <div className="dialog-overlay">
      <section aria-label="Importer depuis Figma" className="dialog-panel">
        <div className="dialog-header">
          <h2 className="dialog-title">Importer depuis Figma</h2>
          <span className="dialog-header-spacer" />
          <button type="button" aria-label="Fermer l'import Figma" className="dialog-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="dialog-body">
          <label htmlFor="figma-file-key" className="dialog-field-label">
            Clé ou lien du fichier Figma
          </label>
          <input
            id="figma-file-key"
            aria-label="Clé ou lien du fichier Figma"
            className="dialog-input"
            value={cleOuLien}
            disabled={statut === 'loading'}
            onChange={(e) => setCleOuLien(e.target.value)}
          />

          {statut === 'error' ? (
            <p role="alert" className="dialog-alert">
              {erreur}
            </p>
          ) : null}
          {statut === 'succes' ? (
            <div>
              <p className="dialog-note">{nodesImportes} nœud(s) importé(s)</p>
              {avertissements.length > 0 ? (
                <ul aria-label="Avertissements d'import">
                  {avertissements.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="dialog-actions">
            <button
              type="button"
              aria-label="Importer depuis l'API Figma"
              className="dialog-button dialog-button-primary"
              disabled={statut === 'loading' || cleOuLien.trim() === ''}
              onClick={() => void importerDepuis({ source: 'api', fileKey: cleOuLien })}
            >
              Importer depuis l'API
            </button>
            <button
              type="button"
              aria-label="Importer un fichier Figma"
              className="dialog-button dialog-button-secondary"
              disabled={statut === 'loading'}
              onClick={() => void importerDepuis({ source: 'file' })}
            >
              Importer un fichier .json
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
