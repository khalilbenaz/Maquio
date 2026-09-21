// Panneau Claude Code (Tache 17, decisions 7 et 8 du brief). Recoit l'API
// en propriete (jamais window.calque directement) : c'est ce qui le rend
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
import { DocumentVersionError, parseDocument, serializeDocument } from '@calque/core'
import type { CalqueDocument, Command } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { useClaudeStatusStore } from '../state/claudeStatusStore'
import type { CalqueApi } from '../../shared/api'
import { translateUnknownError } from '../../shared/errors'
import './ClaudePanel.css'

type Statut = 'idle' | 'loading' | 'done' | 'error' | 'perime'

// Commande generique qui remplace le document entier par celui recu de
// Claude Code (deja patche cote main via la commande composite atomique
// de @calque/ai, voir claudeHandlers.ts) et sait revenir en arriere en un
// seul geste : c'est ce qui garde "un seul Ctrl-Z defait toute la
// demande" vrai, sans que ce fichier ait besoin d'importer @calque/ai
// (interdit dans le renderer).
function commandeRemplacementDocument(label: string, precedent: CalqueDocument, suivant: CalqueDocument): Command {
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

export function ClaudePanel({ api }: { api: CalqueApi }) {
  const [instruction, setInstruction] = useState('')
  // La disponibilite vit dans un magasin partage avec SettingsDialog (voir
  // claudeStatusStore.ts), pas dans un etat local : c'est ce qui permet au
  // panneau de redevenir utilisable des qu'un reglage Claude Code reussit
  // ailleurs dans l'application, sans redemarrer (SettingsDialog et
  // ClaudePanel sont freres, sans prop en commun -- voir Toolbar.tsx).
  const disponible = useClaudeStatusStore((s) => s.available)
  const setStatutClaude = useClaudeStatusStore((s) => s.setStatus)
  const [statut, setStatut] = useState<Statut>('idle')
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
      setErreur(err instanceof Error ? err.message : String(err))
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

  return (
    <section aria-label="Assistant Claude Code" className="claude-panel">
      {!disponible ? (
        <p role="alert">
          Claude Code introuvable : ouvrez les Réglages pour vérifier l'installation ou indiquer l'emplacement du
          binaire 'claude'
        </p>
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

      {statut === 'perime' ? (
        <div role="alert">
          <p>Le document a changé depuis la réponse de Claude Code.</p>
          <button type="button" onClick={() => void demander()}>
            Relancer la demande
          </button>
        </div>
      ) : null}

      {statut === 'error' ? <p role="alert">{erreur}</p> : null}

      {statut === 'done' ? (
        <p>
          Instruction envoyée : {derniereInstruction} — {resume}
        </p>
      ) : null}
    </section>
  )
}
