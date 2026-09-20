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

type Statut = 'idle' | 'loading' | 'error' | 'succes'

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
    <section aria-label="Importer depuis Figma" className="figma-import-dialog">
      <label htmlFor="figma-file-key">Cle ou lien du fichier Figma</label>
      <input
        id="figma-file-key"
        aria-label="Cle ou lien du fichier Figma"
        value={cleOuLien}
        disabled={statut === 'loading'}
        onChange={(e) => setCleOuLien(e.target.value)}
      />
      <button
        type="button"
        aria-label="Importer depuis l API Figma"
        disabled={statut === 'loading' || cleOuLien.trim() === ''}
        onClick={() => void importerDepuis({ source: 'api', fileKey: cleOuLien })}
      >
        Importer depuis l API
      </button>
      <button
        type="button"
        aria-label="Importer un fichier Figma"
        disabled={statut === 'loading'}
        onClick={() => void importerDepuis({ source: 'file' })}
      >
        Importer un fichier .json
      </button>
      <button type="button" aria-label="Fermer l import Figma" onClick={onClose}>
        Fermer
      </button>

      {statut === 'error' ? <p role="alert">{erreur}</p> : null}
      {statut === 'succes' ? (
        <div>
          <p>{nodesImportes} noeud(s) importe(s)</p>
          {avertissements.length > 0 ? (
            <ul aria-label="Avertissements d import">
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
