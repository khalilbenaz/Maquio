import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveNodeCommand, serializeDocument } from '@maquio/core'
import { ClaudePanel } from '../src/renderer/panels/ClaudePanel'
import { useEditorStore } from '../src/renderer/state/editorStore'
import { useClaudeStatusStore } from '../src/renderer/state/claudeStatusStore'
import { documentDeTest } from './helpers/documentDeTest'
import { apiFactice } from './helpers/apiFactice'
import { documentJsonDeFormeInvalide } from './helpers/documentJsonInvalide'

beforeEach(() => {
  useEditorStore.getState().load(documentDeTest())
  // Reinitialise le magasin partage avec SettingsDialog (voir
  // claudeStatusStore.ts) : un test qui le laisse a `false` ferait
  // demarrer le suivant desactive, independamment de son propre double
  // d'API.
  useClaudeStatusStore.getState().setStatus({ available: true, path: null })
})

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
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false }} onOpenSettings={() => {}} />)
    expect(await screen.findByText(/Claude Code introuvable/)).toBeTruthy()
    expect(screen.getByLabelText('Demander à Claude').hasAttribute('disabled')).toBe(true)
  })

  it('« Réessayer la détection » relance la détection et réactive le panneau', async () => {
    const redetectClaude = vi.fn(async () => ({ claudeAvailable: true, claudePath: '/opt/homebrew/bin/claude' }))
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false, redetectClaude }} onOpenSettings={() => {}} />)
    fireEvent.click(await screen.findByText('Réessayer la détection'))
    await act(async () => {})
    expect(redetectClaude).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Claude Code introuvable/)).toBeNull()
    expect(screen.getByLabelText('Demander à Claude').hasAttribute('disabled')).toBe(false)
  })

  it('applique le patch renvoye comme une action annulable', async () => {
    render(<ClaudePanel api={apiFactice} onOpenSettings={() => {}} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'ajoute un bouton' } })
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
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
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
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
    render(<ClaudePanel api={{ ...apiFactice, askClaude }} onOpenSettings={() => {}} />)

    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'ajoute un bouton' } })
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
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

    await screen.findByText(/document a changé/i)
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
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Demander à Claude'))

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
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('Demander à Claude'))

    const alerte = await screen.findByRole('alert')
    verifieMessagePropre(alerte.textContent ?? '')
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  // Point 2 de la reparation du pont : un etat d'attente visible et un
  // bouton "Annuler" qui interrompt REELLEMENT l'appel en cours (via
  // api.cancelClaude(), cote main -- voir claudeHandlers.test.ts pour la
  // preuve que ce canal interrompt bien le sous-processus). Ce test verifie
  // le contrat cote panneau : le bouton appelle cancelClaude(), et le
  // rejet consequent d'askClaude() (comme le ferait
  // ClaudeCancelledError traduite par claudeHandlers.ts) est affiche
  // comme n'importe quelle autre erreur, sans statut dedie.
  it('affiche un etat d attente avec un bouton Annuler qui interrompt reellement la demande en cours', async () => {
    let rejeter: (err: Error) => void = () => {}
    const askClaude = vi.fn(
      () =>
        new Promise<{ patchJson: string; documentJson: string }>((_resolve, reject) => {
          rejeter = reject
        }),
    )
    const cancelClaude = vi.fn(async () => {
      rejeter(new Error("Demande interrompue par l'utilisateur (réponse brute : )"))
    })
    render(<ClaudePanel api={{ ...apiFactice, askClaude, cancelClaude }} onOpenSettings={() => {}} />)

    fireEvent.click(screen.getByLabelText('Demander à Claude'))
    await screen.findByText(/En attente de la réponse de Claude Code/)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(cancelClaude).toHaveBeenCalledTimes(1)
    await screen.findByText(/interrompue par l'utilisateur/)
    expect(useEditorStore.getState().history.canUndo).toBe(false)
  })

  // La detection de Claude Code se regle desormais dans les reglages (au
  // meme titre que le jeton Figma) : le message de desactivation ne doit
  // plus laisser l'utilisateur sans issue, il doit l'orienter vers l'ecran
  // ou il peut agir.
  it('le message de desactivation renvoie vers les reglages', async () => {
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false }} onOpenSettings={() => {}} />)
    const message = await screen.findByText(/Claude Code introuvable/)
    expect(message.textContent).toMatch(/Réglages/)
  })

  // Defaut n1 (« les reglages ont disparu ») : ce renvoi doit etre un VRAI
  // bouton cliquable qui ouvre le dialogue -- avant cette correction,
  // c'etait une simple phrase, sans aucun moyen d'agir depuis ce panneau.
  it('le renvoi vers les reglages est un bouton qui ouvre le dialogue', async () => {
    const onOpenSettings = vi.fn()
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false }} onOpenSettings={onOpenSettings} />)
    await screen.findByText(/Claude Code introuvable/)

    const bouton = screen.getByRole('button', { name: /Réglages/ })
    expect(onOpenSettings).not.toHaveBeenCalled()
    fireEvent.click(bouton)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  // SettingsDialog et ClaudePanel sont freres (tous deux sous Toolbar/App,
  // voir Toolbar.tsx) : ils n'ont aucune prop en commun. C'est le magasin
  // partage claudeStatusStore qui fait que le panneau redevient utilisable
  // des qu'un reglage reussit, sans redemarrer l'application -- ce test
  // verifie ce contrat directement (SettingsDialog ecrit dans ce meme
  // magasin, voir settingsDialog.test.tsx).
  it('redevient actif quand le magasin partage de statut Claude passe a disponible, sans redemarrer', async () => {
    render(<ClaudePanel api={{ ...apiFactice, claudeAvailable: async () => false }} onOpenSettings={() => {}} />)
    expect(await screen.findByText(/Claude Code introuvable/)).toBeTruthy()
    expect(screen.getByLabelText('Demander à Claude').hasAttribute('disabled')).toBe(true)

    act(() => {
      useClaudeStatusStore.getState().setStatus({ available: true, path: '/usr/local/bin/claude' })
    })

    expect(screen.queryByText(/Claude Code introuvable/)).toBeNull()
    expect(screen.getByLabelText('Demander à Claude').hasAttribute('disabled')).toBe(false)
  })
})

// Creation d'une application : plusieurs minutes d'attente, le panneau dit
// ou en est la generation (plan, dessin des ecrans, revue visuelle).
describe('ClaudePanel — progression', () => {
  it('affiche l etape en cours pendant la demande, et l oublie a la suivante', async () => {
    let emettre: (p: { step: string; done: number; total: number }) => void = () => {}
    window.maquioMenu = {
      ...(window.maquioMenu ?? ({} as NonNullable<Window['maquioMenu']>)),
      onClaudeProgress: (cb) => {
        emettre = cb
        return () => {}
      },
    }
    let terminer: () => void = () => {}
    const api = {
      ...apiFactice,
      askClaude: ({ json }: { json: string }) =>
        new Promise<{ patchJson: string; documentJson: string }>((resolve) => {
          terminer = () => resolve({ patchJson: JSON.stringify({ summary: 'ok', ops: [] }), documentJson: json })
        }),
    }
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Crée une app' } })
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
    act(() => emettre({ step: 'plan', done: 0, total: 1 }))
    expect(screen.getByRole('status').textContent).toMatch(/Direction artistique/)
    act(() => emettre({ step: 'screens', done: 3, total: 8 }))
    expect(screen.getByRole('status').textContent).toMatch(/Dessin des écrans : 3\/8/)
    act(() => emettre({ step: 'critique', done: 5, total: 8 }))
    expect(screen.getByRole('status').textContent).toMatch(/Revue visuelle des écrans : 5\/8/)
    act(() => emettre({ step: 'critique', done: 5, total: 8, detail: 'Écran Accueil\n• Titre trop petit' } as { step: string; done: number; total: number }))
    expect(screen.getByTestId('claude-progress-detail').textContent).toBe('Écran Accueil\n• Titre trop petit')
    await act(async () => terminer())
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
    expect(screen.getByRole('status').textContent).not.toMatch(/Revue visuelle/)
    delete window.maquioMenu
  })
})

describe('ClaudePanel — dessin en direct', () => {
  it('transmet au canevas les ecrans en cours de dessin, puis les efface a la fin', async () => {
    let emettre: (json: string) => void = () => {}
    window.maquioMenu = {
      ...(window.maquioMenu ?? ({} as NonNullable<Window['maquioMenu']>)),
      onClaudePreview: (cb) => {
        emettre = cb
        return () => {}
      },
    }
    let terminer: () => void = () => {}
    const api = {
      ...apiFactice,
      askClaude: ({ json }: { json: string }) =>
        new Promise<{ patchJson: string; documentJson: string }>((resolve) => {
          terminer = () => resolve({ patchJson: JSON.stringify({ summary: 'ok', ops: [] }), documentJson: json })
        }),
    }
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'Crée une app' } })
    fireEvent.click(screen.getByLabelText('Demander à Claude'))
    act(() => emettre(JSON.stringify({ screens: [{ id: 'accueil' }], currentId: 'accueil' })))
    expect(useEditorStore.getState().claudePreview).toEqual({ screens: [{ id: 'accueil' }], currentId: 'accueil' })
    await act(async () => terminer())
    expect(useEditorStore.getState().claudePreview).toBeNull()
    delete window.maquioMenu
  })
})
