// Dialogue de reglages (Tache 17, correction round 2 : Critical ; etendu
// pour les reglages Claude Code) : ecran pour le jeton personnel Figma ET
// pour la connexion a Claude Code, au meme titre. Recoit l'API en
// propriete, comme FigmaImportDialog et ExportDialog -- jamais
// window.maquio directement.
//
// Le jeton n'est JAMAIS reaffiche une fois enregistre : getSettings ne
// rend que `hasFigmaToken` (voir figmaHandlers.ts, decision 3 du brief
// original), ce composant ne cherche pas a contourner cette limite --
// apres un enregistrement reussi, le champ est simplement vide. Le refus
// de stockage par `safeStorage` (voir secretStore.ts,
// SecretStorageUnavailableError) est deja traduit en message francais
// cote main ; ce dialogue se contente de l'afficher, sans le remplacer ni
// l'avaler.
//
// Claude Code, a l'inverse, n'est PAS un secret (voir
// claudeSettingsStore.ts) : le chemin personnalise enregistre est
// reaffiche a chaque ouverture (pre-rempli), et reste visible dans le
// champ apres un enregistrement reussi -- il n'y a rien a cacher. Un
// enregistrement reussi (ou un "Verifier") ecrit aussi le nouvel etat dans
// claudeStatusStore, le magasin partage avec ClaudePanel (freres sous
// Toolbar/App, sans prop en commun) : c'est ce qui fait que le panneau
// Claude redevient utilisable immediatement, sans redemarrer l'application.
import { useEffect, useState } from 'react'
import type { MaquioApi } from '../../shared/api'
import { messageOfError } from '../../shared/errors'
import { useClaudeStatusStore } from '../state/claudeStatusStore'
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '../../shared/claudeModels'
import { useThemeStore } from '../state/themeStore'
import { THEME_LABELS, THEME_PREFERENCES, isThemePreference } from '../../shared/theme'
import './Dialog.css'

type Statut = 'idle' | 'loading' | 'error'

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export function SettingsDialog({ api, onClose }: { api: MaquioApi; onClose: () => void }) {
  const theme = useThemeStore((s) => s.preference)
  const setTheme = useThemeStore((s) => s.setPreference)
  const [jeton, setJeton] = useState('')
  const [hasFigmaToken, setHasFigmaToken] = useState(false)
  const [statut, setStatut] = useState<Statut>('idle')
  const [erreur, setErreur] = useState('')

  const [claudeAvailable, setClaudeAvailable] = useState(false)
  const [claudePath, setClaudePath] = useState<string | null>(null)
  const [cheminSaisi, setCheminSaisi] = useState('')
  const [claudeStatut, setClaudeStatut] = useState<Statut>('idle')
  const [claudeErreur, setClaudeErreur] = useState('')
  const [claudeModel, setClaudeModel] = useState<string>(DEFAULT_CLAUDE_MODEL)

  const ecrireStatutPartage = useClaudeStatusStore((s) => s.setStatus)

  useEffect(() => {
    let annule = false
    api.getSettings().then((reglages) => {
      if (annule) return
      setHasFigmaToken(reglages.hasFigmaToken)
      setClaudeAvailable(reglages.claudeAvailable)
      setClaudePath(reglages.claudePath)
      setCheminSaisi(reglages.claudeCustomPath ?? '')
      setClaudeModel(reglages.claudeModel)
      ecrireStatutPartage({ available: reglages.claudeAvailable, path: reglages.claudePath })
    })
    return () => {
      annule = true
    }
  }, [api, ecrireStatutPartage])

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
      setErreur(messageOfError(err))
      setStatut('error')
    }
  }

  // Relance la detection sans rien enregistrer : reutilise getSettings(),
  // qui refait un `which` a chaque appel cote main (jamais mis en cache) --
  // voir claudeSettingsHandlers.ts / main.ts (resolveClaudeStatus).
  async function verifierClaude() {
    setClaudeStatut('loading')
    setClaudeErreur('')
    try {
      await api.redetectClaude()
      const reglages = await api.getSettings()
      setClaudeAvailable(reglages.claudeAvailable)
      setClaudePath(reglages.claudePath)
      setCheminSaisi(reglages.claudeCustomPath ?? '')
      ecrireStatutPartage({ available: reglages.claudeAvailable, path: reglages.claudePath })
      setClaudeStatut('idle')
    } catch (err) {
      setClaudeErreur(messageOfError(err))
      setClaudeStatut('error')
    }
  }

  // Selecteur de fichier : le chemin choisi est valide (executable ET reponse
  // a `--version`) puis enregistre ; un refus garde le champ rempli et la raison.
  async function parcourirClaude() {
    const choisi = await api.chooseClaudeBinary()
    if (choisi === null) return
    setCheminSaisi(choisi)
    await enregistrerCheminClaude(choisi)
  }

  async function enregistrerCheminClaude(chemin: string = cheminSaisi) {
    setClaudeStatut('loading')
    setClaudeErreur('')
    try {
      const resultat = await api.setClaudeCustomPath(chemin)
      setClaudeAvailable(resultat.claudeAvailable)
      setClaudePath(resultat.claudePath)
      ecrireStatutPartage({ available: resultat.claudeAvailable, path: resultat.claudePath })
      setClaudeStatut('idle')
    } catch (err) {
      // Refuse avec sa raison (fichier inexistant, non executable, ou
      // dossier -- voir claudeSettingsHandlers.ts) : le champ garde la
      // valeur saisie, et l'etat affiche (claudeAvailable/claudePath) n'est
      // pas touche, puisque le reglage cote main n'a pas ete ecrase non
      // plus.
      setClaudeErreur(messageOfError(err))
      setClaudeStatut('error')
    }
  }

  return (
    <div className="dialog-overlay">
      <section aria-label="Réglages" className="dialog-panel">
        <div className="dialog-header">
          <h2 className="dialog-title">Réglages</h2>
          <span className="dialog-header-spacer" />
          <button type="button" aria-label="Fermer les réglages" className="dialog-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="dialog-body">
          <section className="dialog-section" aria-label="Apparence">
            <h2>Apparence</h2>
            <label htmlFor="theme-select" className="dialog-field-label">
              Thème de l'éditeur
            </label>
            <select
              id="theme-select"
              aria-label="Thème de l'éditeur"
              className="dialog-input"
              value={theme}
              onChange={(e) => {
                const choix = e.target.value
                if (!isThemePreference(choix)) return
                setTheme(choix)
                void api.setThemePreference(choix).catch(() => undefined)
              }}
            >
              {THEME_PREFERENCES.map((p) => (
                <option key={p} value={p}>
                  {THEME_LABELS[p]}
                </option>
              ))}
            </select>
            <p className="dialog-hint">« Système » suit l'apparence de votre ordinateur. Le canevas et les écrans de votre maquette gardent leurs propres couleurs.</p>
          </section>

          <hr className="dialog-divider" />

          <section className="dialog-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h2>Figma</h2>
              <span className="dialog-header-spacer" />
              <span className={hasFigmaToken ? 'dialog-status-badge' : 'dialog-status-badge dialog-status-badge-off'}>
                <span className="dialog-status-dot" />
                {hasFigmaToken ? 'Un jeton Figma est enregistré' : 'Aucun jeton Figma enregistré'}
              </span>
            </div>

            <label htmlFor="figma-token-input" className="dialog-field-label">
              Jeton personnel Figma
            </label>
            <input
              id="figma-token-input"
              aria-label="Jeton personnel Figma"
              type="password"
              className="dialog-input"
              value={jeton}
              disabled={statut === 'loading'}
              onChange={(e) => setJeton(e.target.value)}
            />

            <p className="dialog-hint">Obtenir un jeton personnel Figma : https://www.figma.com/developers/api#access-tokens</p>

            {statut === 'error' ? (
              <p role="alert" className="dialog-alert">
                {erreur}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button
                type="button"
                aria-label="Enregistrer le jeton Figma"
                className="dialog-button dialog-button-primary"
                disabled={statut === 'loading' || jeton.trim() === ''}
                onClick={() => void enregistrer()}
              >
                Enregistrer
              </button>
            </div>
          </section>

          <hr className="dialog-divider" />

          <div role="group" aria-label="Claude Code" className="dialog-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <h2>Claude Code</h2>
              <span className="dialog-header-spacer" />
              <span className={claudeAvailable ? 'dialog-status-badge' : 'dialog-status-badge dialog-status-badge-off'}>
                <span className="dialog-status-dot" />
                {claudeAvailable ? 'Connecté' : 'Non connecté'}
              </span>
            </div>

            <p className="dialog-hint">
              {claudeAvailable ? `Claude Code trouvé : ${claudePath ?? ''}` : 'Claude Code introuvable'}
            </p>
            <p className="dialog-hint">
              Maquio lance le binaire 'claude' déjà installé sur cette machine et n'utilise aucune clé d'API.
            </p>

            <label htmlFor="claude-custom-path-input" className="dialog-field-label">
              Chemin personnalisé vers le binaire claude
            </label>
            <input
              id="claude-custom-path-input"
              aria-label="Chemin personnalisé vers le binaire claude"
              type="text"
              className="dialog-input"
              placeholder="/usr/local/bin/claude"
              value={cheminSaisi}
              disabled={claudeStatut === 'loading'}
              onChange={(e) => setCheminSaisi(e.target.value)}
            />

            {claudeStatut === 'error' ? (
              <p role="alert" className="dialog-alert">
                {claudeErreur}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button
                type="button"
                aria-label="Enregistrer le chemin de Claude Code"
                className="dialog-button dialog-button-primary"
                disabled={claudeStatut === 'loading'}
                onClick={() => void enregistrerCheminClaude(cheminSaisi)}
              >
                Enregistrer
              </button>
              <button
                type="button"
                aria-label="Parcourir pour choisir le binaire claude"
                className="dialog-button dialog-button-secondary"
                disabled={claudeStatut === 'loading'}
                onClick={() => void parcourirClaude()}
              >
                Parcourir…
              </button>
              <button
                type="button"
                aria-label="Vérifier la connexion Claude Code"
                className="dialog-button dialog-button-secondary"
                disabled={claudeStatut === 'loading'}
                onClick={() => void verifierClaude()}
              >
                Vérifier
              </button>
            </div>

            <label htmlFor="claude-model-select" className="dialog-field-label">
              Modèle Claude
            </label>
            <select
              id="claude-model-select"
              aria-label="Modèle Claude"
              className="dialog-input"
              value={claudeModel}
              onChange={(e) => {
                const choix = e.target.value
                setClaudeModel(choix)
                void api.setClaudeModel(choix).catch((err: unknown) => setClaudeErreur(messageOfError(err)))
              }}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="dialog-hint">Opus donne les designs les plus soignés ; Sonnet répond plus vite.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
