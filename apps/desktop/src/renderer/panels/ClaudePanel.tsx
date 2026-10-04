// Panneau Claude Code (Tache 17, decisions 7 et 8 du brief). Recoit l'API
// en propriete (jamais window.maquio directement) : c'est ce qui le rend
// testable sans preload (voir test/helpers/apiFactice.ts et
// test/claudePanel.test.tsx).
//
// Decision 8 : le patch recu de Claude Code a ete calcule a partir d'un
// instantane du document pris AU MOMENT DE LA DEMANDE (envoye comme
// `json` a askClaude). Si le document courant a change pendant l'attente
// de la reponse (l'utilisateur a continue a editer), l'appliquer
// aveuglement ecraserait ces changements sans avertissement. On compare
// donc l'etat courant a cet instantane juste avant d'executer quoi que ce
// soit, et on affiche explicitement l'ecart plutot que d'echouer en
// silence ou d'ecraser du travail recent -- avec un bouton pour relancer
// la demande a partir du document a jour.
import { useEffect, useState } from 'react'
import { DocumentVersionError, parseDocument, serializeDocument } from '@maquio/core'
import type { MaquioDocument, Command } from '@maquio/core'
import { useEditorStore } from '../state/editorStore'
import { useClaudeStatusStore } from '../state/claudeStatusStore'
import { useUiPrefs } from '../state/uiPrefsStore'
import type { MaquioApi } from '../../shared/api'
import { translateUnknownError, messageOfError } from '../../shared/errors'
import './ClaudePanel.css'

type Statut = 'idle' | 'loading' | 'done' | 'error' | 'perime'

// Commande generique qui remplace le document entier par celui recu de
// Claude Code (deja patche cote main via la commande composite atomique
// de @maquio/ai, voir claudeHandlers.ts) et sait revenir en arriere en un
// seul geste : c'est ce qui garde "un seul Ctrl-Z defait toute la
// demande" vrai, sans que ce fichier ait besoin d'importer @maquio/ai
// (interdit dans le renderer).
function commandeRemplacementDocument(label: string, precedent: MaquioDocument, suivant: MaquioDocument): Command {
  return {
    label,
    apply: () => suivant,
    invert: () => ({
      label,
      apply: () => precedent,
      invert: () => commandeRemplacementDocument(label, precedent, suivant),
    }),
  }
}

export function ClaudePanel({ api, onOpenSettings }: { api: MaquioApi; onOpenSettings: () => void }) {
  const [instruction, setInstruction] = useState('')
  // La disponibilite vit dans un magasin partage avec SettingsDialog (voir
  // claudeStatusStore.ts), pas dans un etat local : c'est ce qui permet au
  // panneau de redevenir utilisable des qu'un reglage Claude Code reussit
  // ailleurs dans l'application, sans redemarrer (SettingsDialog et
  // ClaudePanel sont freres, sans prop en commun -- voir Toolbar.tsx).
  const disponible = useClaudeStatusStore((s) => s.available)
  const setStatutClaude = useClaudeStatusStore((s) => s.setStatus)
  const [statutLocal, setStatutLocal] = useState<Statut>('idle')
  const setPhase = useClaudeStatusStore((s) => s.setPhase)
  const phase = useClaudeStatusStore((s) => s.phase)
  const replie = useUiPrefs((s) => s.claudeCollapsed)
  const toggleClaude = useUiPrefs((s) => s.toggleClaude)
  // Le statut local alimente aussi la pastille du panneau replie.
  const setStatut = (s: Statut) => {
    setStatutLocal(s)
    setPhase(s === 'loading' ? 'loading' : s === 'done' ? 'done' : s === 'error' || s === 'perime' ? 'error' : 'idle')
  }
  const statut = statutLocal
  const [derniereInstruction, setDerniereInstruction] = useState('')
  const [resume, setResume] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    api
      .claudeAvailable()
      .then((ok) => {
        if (!annule) setStatutClaude({ available: ok, path: null })
      })
      .catch(() => {
        if (!annule) setStatutClaude({ available: false, path: null })
      })
    return () => {
      annule = true
    }
  }, [api, setStatutClaude])

  // Point 2 de la reparation du pont : le bouton "Annuler" (affiche
  // uniquement pendant `statut === 'loading'`, voir le rendu plus bas)
  // appelle cancelClaude(), qui declenche cote main l'AbortSignal transmis
  // jusqu'a ProcessClaudeRunner.run (packages/ai/src/runner.ts) -- celui-ci
  // interrompt reellement le sous-processus. L'appel askClaude() en cours
  // (dans demander() ci-dessous) rejette alors avec un message deja
  // traduit en francais ("Demande interrompue par l'utilisateur", voir
  // claudeHandlers.ts) : c'est le meme chemin d'erreur que n'importe quel
  // autre echec, pas un statut dedie. Les erreurs de cancelClaude()
  // lui-meme (improbables : simple IPC local) n'ont rien de plus a faire
  // ici, l'echec de la demande en cours les couvre deja.
  async function annuler() {
    try {
      await api.cancelClaude()
    } catch {
      // Volontairement ignoree : voir la note ci-dessus.
    }
  }

  async function demander() {
    const documentAvantEnvoi = useEditorStore.getState().document
    const pageId = useEditorStore.getState().pageId
    const selection = useEditorStore.getState().selection
    const instructionEnvoyee = instruction

    setStatut('loading')
    setErreur('')
    setDerniereInstruction(instructionEnvoyee)

    // Round de correction 1 (Critical) : deux try/catch distincts, pas un
    // seul. L'appel askClaude() est deja traduit cote main (voir
    // claudeHandlers.ts) -- son message est relaye tel quel, jamais
    // reprefixe. Les etapes locales qui suivent (JSON.parse, parseDocument)
    // peuvent en revanche lever un SyntaxError ou un ZodError brut : elles
    // passent par la traduction generique partagee, qui ne rend jamais de
    // dump technique (voir src/shared/errors.ts).
    let resultat: { patchJson: string; documentJson: string }
    try {
      resultat = await api.askClaude({
        instruction: instructionEnvoyee,
        json: serializeDocument(documentAvantEnvoi),
        selectionIds: selection,
        pageId,
      })
    } catch (err) {
      setErreur(messageOfError(err))
      setStatut('error')
      return
    }

    // Decision 8 : le document a-t-il change pendant l'attente ?
    // editorStore remplace toujours `document` par une nouvelle reference
    // a chaque mutation (execute/undo/redo/load), une simple comparaison
    // de reference suffit donc a detecter tout ecart.
    if (useEditorStore.getState().document !== documentAvantEnvoi) {
      setStatut('perime')
      return
    }

    try {
      const patch = JSON.parse(resultat.patchJson) as { summary: string }
      const documentSuivant = parseDocument(resultat.documentJson)
      const commande = commandeRemplacementDocument(patch.summary, documentAvantEnvoi, documentSuivant)
      useEditorStore.getState().execute(commande)
      setResume(patch.summary)
      setStatut('done')
    } catch (err) {
      const erreurTraduite =
        err instanceof DocumentVersionError ? new Error(err.message) : translateUnknownError(err, 'Réponse de Claude Code invalide')
      setErreur(erreurTraduite.message)
      setStatut('error')
    }
  }

  const desactive = !disponible

  // Replie : une fine barre (titre + pastille d'activite ou de resultat). Le
  // composant reste monte, donc une demande en cours n'est jamais perdue.
  function deplier() {
    toggleClaude()
    // En depliant, le resultat est considere comme vu.
    if (replie && (phase === 'done' || phase === 'error')) setPhase('idle')
  }

  return (
    <section
      aria-label="Assistant Claude Code"
      className={replie ? 'claude-panel claude-panel-collapsed' : 'claude-panel'}
    >
      <div className="claude-panel-header">
        {replie ? (
          <button type="button" className="claude-panel-bar" aria-label="Déplier le panneau Claude" aria-expanded={false} title="Déplier Claude (Cmd/Ctrl+J)" onClick={deplier}>
            <span className={disponible ? 'claude-panel-dot claude-panel-dot-on' : 'claude-panel-dot claude-panel-dot-off'} />
            <span className="claude-panel-title">Claude Code</span>
            {phase !== 'idle' ? (
              <span
                data-testid="claude-badge"
                data-phase={phase}
                role="status"
                aria-label={phase === 'loading' ? 'Claude travaille' : phase === 'done' ? 'Claude a terminé' : 'Claude a échoué'}
                className={`claude-badge claude-badge-${phase}`}
              />
            ) : null}
            <span className="claude-panel-header-spacer" />
            <span aria-hidden="true">▴</span>
          </button>
        ) : (
          <>
            <span className={disponible ? 'claude-panel-dot claude-panel-dot-on' : 'claude-panel-dot claude-panel-dot-off'} />
            <span className="claude-panel-title">Claude Code</span>
            <span className="claude-panel-header-spacer" />
            <span className="claude-panel-status">{disponible ? 'connecté' : 'non connecté'}</span>
            <button type="button" className="claude-panel-fold" aria-label="Replier le panneau Claude" aria-expanded={true} title="Replier Claude (Cmd/Ctrl+J)" onClick={deplier}>
              ▾
            </button>
          </>
        )}
      </div>

      <div className="claude-panel-body" hidden={replie}>
        {!disponible ? (
          <>
            <p role="alert" className="claude-panel-alert">
              Claude Code introuvable : ouvrez les Réglages pour vérifier l'installation ou indiquer l'emplacement du
              binaire 'claude'
            </p>
            {/* Defaut n1 : le renvoi vers les Reglages doit etre un VRAI
                bouton cliquable qui ouvre le dialogue, pas seulement une
                phrase -- avant cette correction, rien dans ce panneau ne
                pouvait effectivement l'ouvrir. Sibling du <p> ci-dessus
                (pas imbrique dedans) : `role="alert"` reste porte par le
                seul <p>, pour que `screen.getByText(/Claude Code
                introuvable/)` continue a designer un unique element sans
                ambiguite avec ce bouton. */}
            <button type="button" className="claude-panel-settings-link" onClick={onOpenSettings}>
              Ouvrir les Réglages
            </button>
          </>
        ) : null}

        <label htmlFor="claude-instruction">Instruction</label>
        <textarea
          id="claude-instruction"
          aria-label="Instruction"
          value={instruction}
          disabled={desactive}
          onChange={(e) => setInstruction(e.target.value)}
        />

        <button
          type="button"
          aria-label="Demander à Claude"
          disabled={desactive || statut === 'loading'}
          onClick={() => void demander()}
        >
          Demander à Claude
        </button>

        {statut === 'loading' ? (
          <div role="status" className="claude-panel-loading">
            <p>En attente de la réponse de Claude Code…</p>
            <button type="button" className="claude-panel-settings-link" onClick={() => void annuler()}>
              Annuler
            </button>
          </div>
        ) : null}

        {statut === 'perime' ? (
          <div role="alert" className="claude-panel-alert">
            <p>Le document a changé depuis la réponse de Claude Code.</p>
            <button type="button" onClick={() => void demander()}>
              Relancer la demande
            </button>
          </div>
        ) : null}

        {statut === 'error' ? (
          <p role="alert" className="claude-panel-alert">
            {erreur}
          </p>
        ) : null}

        {statut === 'done' ? (
          <p className="claude-panel-result">
            Instruction envoyée : {derniereInstruction} — {resume}
          </p>
        ) : null}
      </div>
    </section>
  )
}
