// Dialogue d'export vers le disque (Tache 17, decision 5 du brief) : le
// choix du dossier, la detection des fichiers existants et la
// confirmation d'ecrasement sont tous geres cote main via des dialogues
// natifs Electron (voir src/main/adapters/electronDialogs.ts et
// exportHandlers.ts) -- ce composant se contente de declencher l'appel et
// d'afficher le resultat (fichiers ecrits, avertissements) ou
// l'annulation, sans jamais dupliquer cette logique.
import { useState } from 'react'
import { serializeDocument } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { CalqueApi, ExporterId } from '../../shared/api'
import './Dialog.css'

type Statut = 'idle' | 'loading' | 'error' | 'succes' | 'annule'

const NOMS_CIBLES: Record<ExporterId, string> = {
  flutter: 'Flutter',
  'react-native': 'React Native',
  swiftui: 'SwiftUI',
  compose: 'Jetpack Compose',
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function ExportDialog({
  api,
  exporterId,
  onClose,
}: {
  api: CalqueApi
  exporterId: ExporterId
  onClose: () => void
}) {
  const [nomProjet, setNomProjet] = useState(() => useEditorStore.getState().document.name)
  const [statut, setStatut] = useState<Statut>('idle')
  const [erreur, setErreur] = useState('')
  const [dossier, setDossier] = useState('')
  const [fichiers, setFichiers] = useState<string[]>([])
  const [avertissements, setAvertissements] = useState<string[]>([])

  async function exporter() {
    setStatut('loading')
    setErreur('')
    try {
      const resultat = await api.exportProject({
        exporterId,
        json: serializeDocument(useEditorStore.getState().document),
        projectName: nomProjet,
        // L'ecran actif du plan de travail est l'ecran de depart de la
        // navigation generee ; tous les ecrans sont exportes.
        activeScreenId: useEditorStore.getState().activeScreenId ?? undefined,
      })
      if (resultat === null) {
        setStatut('annule')
        return
      }
      setDossier(resultat.directory)
      setFichiers(resultat.files)
      setAvertissements(resultat.warnings)
      setStatut('succes')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setStatut('error')
    }
  }

  return (
    <div className="dialog-overlay">
      <section aria-label="Exporter le projet" className="dialog-panel">
        <div className="dialog-header">
          <h2 className="dialog-title">Exporter en {NOMS_CIBLES[exporterId]}</h2>
          <span className="dialog-header-spacer" />
          <button type="button" aria-label="Fermer l'export" className="dialog-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="dialog-body">
          <label htmlFor="export-project-name" className="dialog-field-label">
            Nom du projet
          </label>
          <input
            id="export-project-name"
            aria-label="Nom du projet"
            className="dialog-input"
            value={nomProjet}
            disabled={statut === 'loading'}
            onChange={(e) => setNomProjet(e.target.value)}
          />

          {statut === 'annule' ? <p className="dialog-note">Export annulé</p> : null}
          {statut === 'error' ? (
            <p role="alert" className="dialog-alert">
              {erreur}
            </p>
          ) : null}
          {statut === 'succes' ? (
            <div>
              <p className="dialog-note">
                {fichiers.length} fichier(s) exporté(s) dans {dossier}
              </p>
              {avertissements.length > 0 ? (
                <ul aria-label="Avertissements d'export">
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
              aria-label="Lancer l'export"
              className="dialog-button dialog-button-primary"
              disabled={statut === 'loading' || nomProjet.trim() === ''}
              onClick={() => void exporter()}
            >
              Exporter
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
