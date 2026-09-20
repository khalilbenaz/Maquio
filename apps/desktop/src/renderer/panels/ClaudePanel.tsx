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
import { parseDocument, serializeDocument } from '@calque/core'
import type { CalqueDocument, Command } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import type { CalqueApi } from '../../shared/api'

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
  const [disponible, setDisponible] = useState(true)
  const [statut, setStatut] = useState<Statut>('idle')
  const [derniereInstruction, setDerniereInstruction] = useState('')
  const [resume, setResume] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    let annule = false
    api
      .claudeAvailable()
      .then((ok) => {
        if (!annule) setDisponible(ok)
      })
      .catch(() => {
        if (!annule) setDisponible(false)
      })
    return () => {
      annule = true
    }
  }, [api])

  async function demander() {
    const documentAvantEnvoi = useEditorStore.getState().document
    const pageId = useEditorStore.getState().pageId
    const selection = useEditorStore.getState().selection
    const instructionEnvoyee = instruction

    setStatut('loading')
    setErreur('')
    setDerniereInstruction(instructionEnvoyee)

    try {
      const resultat = await api.askClaude({
        instruction: instructionEnvoyee,
        json: serializeDocument(documentAvantEnvoi),
        selectionIds: selection,
        pageId,
      })

      // Decision 8 : le document a-t-il change pendant l'attente ?
      // editorStore remplace toujours `document` par une nouvelle
      // reference a chaque mutation (execute/undo/redo/load), une simple
      // comparaison de reference suffit donc a detecter tout ecart.
      if (useEditorStore.getState().document !== documentAvantEnvoi) {
        setStatut('perime')
        return
      }

      const patch = JSON.parse(resultat.patchJson) as { summary: string }
      const documentSuivant = parseDocument(resultat.documentJson)
      const commande = commandeRemplacementDocument(patch.summary, documentAvantEnvoi, documentSuivant)
      useEditorStore.getState().execute(commande)
      setResume(patch.summary)
      setStatut('done')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setStatut('error')
    }
  }

  const desactive = !disponible

  return (
    <section aria-label="Assistant Claude Code" className="claude-panel">
      {!disponible ? (
        <p role="alert">
          Claude Code introuvable : verifiez que le binaire 'claude' est installe et accessible dans le PATH
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
        aria-label="Demander a Claude"
        disabled={desactive || statut === 'loading'}
        onClick={() => void demander()}
      >
        Demander a Claude
      </button>

      {statut === 'perime' ? (
        <div role="alert">
          <p>Le document a change depuis la reponse de Claude Code.</p>
          <button type="button" onClick={() => void demander()}>
            Relancer la demande
          </button>
        </div>
      ) : null}

      {statut === 'error' ? <p role="alert">{erreur}</p> : null}

      {statut === 'done' ? (
        <p>
          Instruction envoyee : {derniereInstruction} — {resume}
        </p>
      ) : null}
    </section>
  )
}
