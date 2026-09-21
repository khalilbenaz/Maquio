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

type Statut = 'idle' | 'loading' | 'error' | 'succes' | 'annule'

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
    <section aria-label="Exporter le projet" className="export-dialog">
      <label htmlFor="export-project-name">Nom du projet</label>
      <input
        id="export-project-name"
        aria-label="Nom du projet"
        value={nomProjet}
        disabled={statut === 'loading'}
        onChange={(e) => setNomProjet(e.target.value)}
      />
      <button
        type="button"
        aria-label="Lancer l'export"
        disabled={statut === 'loading' || nomProjet.trim() === ''}
        onClick={() => void exporter()}
      >
        Exporter
      </button>
      <button type="button" aria-label="Fermer l'export" onClick={onClose}>
        Fermer
      </button>

      {statut === 'annule' ? <p>Export annulé</p> : null}
      {statut === 'error' ? <p role="alert">{erreur}</p> : null}
      {statut === 'succes' ? (
        <div>
          <p>
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
    </section>
  )
}
