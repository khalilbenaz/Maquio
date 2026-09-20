// Dialogue de reglages (Tache 17, correction round 2 : Critical) : ecran
// minimal pour saisir le jeton personnel Figma, sans lequel l'import
// Figma par l'API est inatteignable (aucun autre composant n'appelait
// setFigmaToken/getSettings avant ce correctif). Recoit l'API en
// propriete, comme FigmaImportDialog et ExportDialog -- jamais
// window.calque directement.
//
// Le jeton n'est JAMAIS reaffiche une fois enregistre : getSettings ne
// rend que `hasFigmaToken` (voir figmaHandlers.ts, decision 3 du brief
// original), ce composant ne cherche pas a contourner cette limite --
// apres un enregistrement reussi, le champ est simplement vide. Le refus
// de stockage par `safeStorage` (voir secretStore.ts,
// SecretStorageUnavailableError) est deja traduit en message francais
// cote main ; ce dialogue se contente de l'afficher, sans le remplacer ni
// l'avaler.
import { useEffect, useState } from 'react'
import type { CalqueApi } from '../../shared/api'

type Statut = 'idle' | 'loading' | 'error'

export function SettingsDialog({ api, onClose }: { api: CalqueApi; onClose: () => void }) {
  const [jeton, setJeton] = useState('')
  const [hasFigmaToken, setHasFigmaToken] = useState(false)
  const [statut, setStatut] = useState<Statut>('idle')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    api.getSettings().then((reglages) => {
      if (!annule) setHasFigmaToken(reglages.hasFigmaToken)
    })
    return () => {
      annule = true
    }
  }, [api])

  async function enregistrer() {
    setStatut('loading')
    setErreur('')
    try {
      await api.setFigmaToken(jeton)
      // Enregistrement reussi : le jeton n'est jamais reaffiche, le champ
      // est vide immediatement (decision 2 de la correction).
      setJeton('')
      setHasFigmaToken(true)
      setStatut('idle')
    } catch (err) {
      // Refus (ex. safeStorage indisponible) : la raison est montree,
      // jamais avalee -- et le champ garde sa valeur pour que
      // l'utilisateur n'ait pas a la ressaisir (decision 3).
      setErreur(err instanceof Error ? err.message : String(err))
      setStatut('error')
    }
  }

  return (
    <section aria-label="Reglages" className="settings-dialog">
      <p>{hasFigmaToken ? 'Un jeton Figma est enregistre' : 'Aucun jeton Figma enregistre'}</p>

      <label htmlFor="figma-token-input">Jeton personnel Figma</label>
      <input
        id="figma-token-input"
        aria-label="Jeton personnel Figma"
        type="password"
        value={jeton}
        disabled={statut === 'loading'}
        onChange={(e) => setJeton(e.target.value)}
      />
      <button
        type="button"
        aria-label="Enregistrer le jeton Figma"
        disabled={statut === 'loading' || jeton.trim() === ''}
        onClick={() => void enregistrer()}
      >
        Enregistrer
      </button>
      <button type="button" aria-label="Fermer les reglages" onClick={onClose}>
        Fermer
      </button>

      <p>Obtenir un jeton personnel Figma : https://www.figma.com/developers/api#access-tokens</p>

      {statut === 'error' ? <p role="alert">{erreur}</p> : null}
    </section>
  )
}
