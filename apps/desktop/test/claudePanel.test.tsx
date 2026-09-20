import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveNodeCommand, serializeDocument } from '@calque/core'
import { ClaudePanel } from '../src/renderer/panels/ClaudePanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'
import { documentJsonDeFormeInvalide } from './helpers/documentJsonInvalide'

beforeEach(() => useEditorStore.getState().load(documentDeTest()))

// Round de correction 1 (Critical) : un SyntaxError (JSON tronque) ou un
// ZodError (document de forme invalide), leves localement par
// JSON.parse/parseDocument sur la reponse d'askClaude, ne doivent jamais
// s'afficher comme un dump technique dans le panneau.
function verifieMessagePropre(message: string): void {
  expect(message).not.toContain('{')
  expect(message).not.toContain('"code"')
  expect(message).not.toContain('invalid_type')
}

describe('ClaudePanel', () => {
  it('desactive le panneau quand le binaire claude est absent, des l ouverture', async () => {
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false }} />)
    expect(await screen.findByText(/Claude Code introuvable/)).toBeTruthy()
    expect(screen.getByLabelText('Demander a Claude').hasAttribute('disabled')).toBe(true)
  })

  it('applique le patch renvoye comme une action annulable', async () => {
    render(<ClaudePanel api={apiFactice} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'ajoute un bouton' } })
    fireEvent.click(screen.getByLabelText('Demander a Claude'))
    await screen.findByText(/ajoute/)
    expect(useEditorStore.getState().history.canUndo).toBe(true)
  })

  it('laisse le document intact et montre la reponse brute quand le patch est invalide', async () => {
    const api = {
      ...apiFactice,
      askClaude: async () => {
        throw new Error('patch invalide: desole')
      },
    }
    render(<ClaudePanel api={api} />)
    fireEvent.click(screen.getByLabelText('Demander a Claude'))
    await screen.findByText(/patch invalide/)
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  // Decision 8 du brief : le patch a ete calcule a partir d'un instantane
  // du document pris au moment de la demande. Si le document a change
  // pendant l'attente de la reponse, l'appliquer ecraserait ces
  // changements sans avertissement : on doit le signaler explicitement
  // et ne rien executer automatiquement.
  it('signale un document perime plutot que d appliquer un patch obsolete, et permet de relancer', async () => {
    let resoudre: (v: { patchJson: string; documentJson: string }) => void = () => {}
    const askClaude = vi.fn(
      () =>
        new Promise<{ patchJson: string; documentJson: string }>((resolve) => {
          resoudre = resolve
        }),
    )
    render(<ClaudePanel api={{ ...apiFactice, askClaude }} />)

    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'ajoute un bouton' } })
    fireEvent.click(screen.getByLabelText('Demander a Claude'))
    expect(askClaude).toHaveBeenCalledTimes(1)

    const nombreEntreesAvant = useEditorStore.getState().history.undoLabels.length

    // Le document change pendant que la reponse est en attente.
    act(() => {
      useEditorStore.getState().execute(moveNodeCommand(useEditorStore.getState().pageId, 'rect1', 5, 5))
    })

    act(() => {
      resoudre({
        patchJson: JSON.stringify({ summary: 'ajoute un bouton', ops: [] }),
        documentJson: serializeDocument(useEditorStore.getState().document),
      })
    })

    await screen.findByText(/document a change/i)
    // Le patch perime n'a pas ete applique : seule l'edition manuelle
    // ci-dessus a alimente l'historique.
    expect(useEditorStore.getState().history.undoLabels.length).toBe(nombreEntreesAvant + 1)

    fireEvent.click(screen.getByText(/Relancer/))
    expect(askClaude).toHaveBeenCalledTimes(2)
  })

  it('affiche un message francais propre (sans dump) quand documentJson est un JSON tronque', async () => {
    const api = {
      ...apiFactice,
      askClaude: async () => ({
        patchJson: JSON.stringify({ summary: 'x', ops: [] }),
        documentJson: '{"version":1,"id":"d1","name":"X","pages":[',
      }),
    }
    render(<ClaudePanel api={api} />)
    fireEvent.click(screen.getByLabelText('Demander a Claude'))

    const alerte = await screen.findByRole('alert')
    verifieMessagePropre(alerte.textContent ?? '')
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  it('affiche un message francais propre (sans dump) quand documentJson est de forme invalide', async () => {
    const api = {
      ...apiFactice,
      askClaude: async () => ({
        patchJson: JSON.stringify({ summary: 'x', ops: [] }),
        documentJson: documentJsonDeFormeInvalide(),
      }),
    }
    render(<ClaudePanel api={api} />)
    fireEvent.click(screen.getByLabelText('Demander a Claude'))

    const alerte = await screen.findByRole('alert')
    verifieMessagePropre(alerte.textContent ?? '')
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })
})
