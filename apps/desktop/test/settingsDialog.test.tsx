// Correction round 2 (Critical) : sans ce dialogue, aucun composant du
// renderer n'appelait jamais setFigmaToken/getSettings -- l'import Figma
// par l'API etait inatteignable pour un utilisateur (le jeton restait
// toujours absent, voir figmaHandlers.ts / FigmaTokenMissingError).
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../src/renderer/dialogs/SettingsDialog'
import { useClaudeStatusStore } from '../src/renderer/state/claudeStatusStore'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => useClaudeStatusStore.getState().setStatus({ available: true, path: null }))

describe('SettingsDialog', () => {
  it('le champ du jeton est de type password', () => {
    render(<SettingsDialog api={apiFactice} onClose={() => {}} />)
    const champ = screen.getByLabelText('Jeton personnel Figma')
    expect(champ.getAttribute('type')).toBe('password')
  })

  it('enregistrer appelle setFigmaToken avec la valeur saisie', async () => {
    const setFigmaToken = vi.fn(async () => {})
    render(<SettingsDialog api={{ ...apiFactice, setFigmaToken }} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Jeton personnel Figma'), { target: { value: 'mon-jeton-secret' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le jeton Figma'))

    await screen.findByText(/un jeton figma est enregistre/i)
    expect(setFigmaToken).toHaveBeenCalledWith('mon-jeton-secret')
  })

  it('apres un enregistrement reussi, le champ est vide et l etat passe a "un jeton est enregistre"', async () => {
    render(<SettingsDialog api={{ ...apiFactice, setFigmaToken: async () => {} }} onClose={() => {}} />)

    const champ = screen.getByLabelText('Jeton personnel Figma') as HTMLInputElement
    fireEvent.change(champ, { target: { value: 'mon-jeton-secret' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le jeton Figma'))

    await screen.findByText(/un jeton figma est enregistre/i)
    expect(champ.value).toBe('')
  })

  it('un refus de stockage (safeStorage indisponible) affiche la raison et ne vide pas le champ', async () => {
    const api = {
      ...apiFactice,
      setFigmaToken: async () => {
        throw new Error(
          "Le stockage securise du systeme n'est pas disponible sur cette machine : le jeton Figma ne peut pas etre enregistre en toute securite, il n'a pas ete sauvegarde",
        )
      },
    }
    render(<SettingsDialog api={api} onClose={() => {}} />)

    const champ = screen.getByLabelText('Jeton personnel Figma') as HTMLInputElement
    fireEvent.change(champ, { target: { value: 'mon-jeton-secret' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le jeton Figma'))

    await screen.findByText(/stockage securise/i)
    expect(champ.value).toBe('mon-jeton-secret')
    expect(screen.getByText(/aucun jeton figma enregistre/i)).toBeTruthy()
  })

  it('le jeton saisi n apparait dans aucun message affiche, succes ou echec', async () => {
    const { unmount } = render(
      <SettingsDialog api={{ ...apiFactice, setFigmaToken: async () => {} }} onClose={() => {}} />,
    )
    fireEvent.change(screen.getByLabelText('Jeton personnel Figma'), { target: { value: 'jeton-tres-secret' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le jeton Figma'))
    await screen.findByText(/un jeton figma est enregistre/i)
    expect(document.body.textContent).not.toContain('jeton-tres-secret')
    unmount()

    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          setFigmaToken: async () => {
            throw new Error('refuse')
          },
        }}
        onClose={() => {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('Jeton personnel Figma'), { target: { value: 'autre-jeton-secret' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le jeton Figma'))
    await screen.findByRole('alert')
    // Le champ contient bien la valeur (non videe), mais un champ de
    // formulaire n'est jamais un "message affiche" -- on verifie que le
    // texte du reste de la page (hors valeur du champ) ne l'expose pas.
    const messages = screen.getAllByText((_, el) => el?.tagName === 'P').map((el) => el.textContent)
    for (const message of messages) {
      expect(message).not.toContain('autre-jeton-secret')
    }
  })

  it('lit l etat courant via getSettings a l ouverture', async () => {
    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          getSettings: async () => ({
            hasFigmaToken: true,
            claudeAvailable: true,
            claudePath: '/usr/local/bin/claude',
            claudeCustomPath: null,
          }),
        }}
        onClose={() => {}}
      />,
    )
    expect(await screen.findByText(/un jeton figma est enregistre/i)).toBeTruthy()
  })

  it('affiche l adresse ou obtenir un jeton, en texte non cliquable', () => {
    render(<SettingsDialog api={apiFactice} onClose={() => {}} />)
    expect(screen.getByText(/figma\.com\/developers\/api/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

// La connexion a Claude Code se regle desormais dans les reglages, au meme
// titre que le jeton Figma (jusqu'ici, un binaire `claude` absent du PATH
// desactivait le panneau Claude en silence, sans que l'utilisateur puisse
// rien y faire).
describe('SettingsDialog — Claude Code', () => {
  it('affiche l etat trouve avec le chemin reellement resolu', async () => {
    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          getSettings: async () => ({
            hasFigmaToken: false,
            claudeAvailable: true,
            claudePath: '/opt/homebrew/bin/claude',
            claudeCustomPath: null,
          }),
        }}
        onClose={() => {}}
      />,
    )
    const etat = await screen.findByText(/\/opt\/homebrew\/bin\/claude/)
    expect(etat.textContent).toMatch(/trouve/i)
  })

  it('affiche l etat introuvable quand le binaire n est pas detecte', async () => {
    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          getSettings: async () => ({
            hasFigmaToken: false,
            claudeAvailable: false,
            claudePath: null,
            claudeCustomPath: null,
          }),
        }}
        onClose={() => {}}
      />,
    )
    expect(await screen.findByText(/introuvable/i)).toBeTruthy()
  })

  it('explique que Calque lance le binaire deja installe et n utilise aucune cle d API', () => {
    render(<SettingsDialog api={apiFactice} onClose={() => {}} />)
    expect(screen.getByText(/aucune cle d.api/i)).toBeTruthy()
  })

  it('enregistre un chemin personnalise valide via setClaudeCustomPath', async () => {
    const setClaudeCustomPath = vi.fn(async (p: string) => ({ claudeAvailable: true, claudePath: p }))
    render(<SettingsDialog api={{ ...apiFactice, setClaudeCustomPath }} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Chemin personnalise vers le binaire claude'), {
      target: { value: '/opt/homebrew/bin/claude' },
    })
    fireEvent.click(screen.getByLabelText('Enregistrer le chemin de Claude Code'))

    await screen.findByText(/\/opt\/homebrew\/bin\/claude/)
    expect(setClaudeCustomPath).toHaveBeenCalledWith('/opt/homebrew/bin/claude')
  })

  it('refuse un chemin invalide avec sa raison, sans vider le champ ni ecraser l etat affiche', async () => {
    const setClaudeCustomPath = vi.fn(async () => {
      throw new Error('Fichier introuvable : /mauvais/chemin')
    })
    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          getSettings: async () => ({
            hasFigmaToken: false,
            claudeAvailable: true,
            claudePath: '/usr/local/bin/claude',
            claudeCustomPath: null,
          }),
          setClaudeCustomPath,
        }}
        onClose={() => {}}
      />,
    )
    await screen.findByText(/\/usr\/local\/bin\/claude/)

    const champ = screen.getByLabelText('Chemin personnalise vers le binaire claude') as HTMLInputElement
    fireEvent.change(champ, { target: { value: '/mauvais/chemin' } })
    fireEvent.click(screen.getByLabelText('Enregistrer le chemin de Claude Code'))

    await screen.findByText(/Fichier introuvable/)
    expect(champ.value).toBe('/mauvais/chemin')
    // L'etat affiche (l'ancien reglage) n'a pas bouge : le refus n'a rien
    // ecrase cote main (voir claudeSettingsHandlers.test.ts).
    expect(screen.getByText(/\/usr\/local\/bin\/claude/)).toBeTruthy()
  })

  it('le bouton Verifier relance la detection et affiche le nouveau resultat', async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValueOnce({ hasFigmaToken: false, claudeAvailable: false, claudePath: null, claudeCustomPath: null })
      .mockResolvedValueOnce({
        hasFigmaToken: false,
        claudeAvailable: true,
        claudePath: '/usr/local/bin/claude',
        claudeCustomPath: null,
      })

    render(<SettingsDialog api={{ ...apiFactice, getSettings }} onClose={() => {}} />)
    await screen.findByText(/introuvable/i)

    fireEvent.click(screen.getByLabelText('Verifier la connexion Claude Code'))

    await screen.findByText(/\/usr\/local\/bin\/claude/)
    expect(getSettings).toHaveBeenCalledTimes(2)
  })

  it('ecrit le nouvel etat dans le magasin partage avec ClaudePanel apres un enregistrement reussi', async () => {
    const setClaudeCustomPath = vi.fn(async () => ({ claudeAvailable: true, claudePath: '/opt/homebrew/bin/claude' }))
    render(
      <SettingsDialog
        api={{
          ...apiFactice,
          getSettings: async () => ({
            hasFigmaToken: false,
            claudeAvailable: false,
            claudePath: null,
            claudeCustomPath: null,
          }),
          setClaudeCustomPath,
        }}
        onClose={() => {}}
      />,
    )
    await screen.findByText(/introuvable/i)
    expect(useClaudeStatusStore.getState().available).toBe(false)

    fireEvent.change(screen.getByLabelText('Chemin personnalise vers le binaire claude'), {
      target: { value: '/opt/homebrew/bin/claude' },
    })
    fireEvent.click(screen.getByLabelText('Enregistrer le chemin de Claude Code'))

    await screen.findByText(/\/opt\/homebrew\/bin\/claude/)
    expect(useClaudeStatusStore.getState().available).toBe(true)
    expect(useClaudeStatusStore.getState().path).toBe('/opt/homebrew/bin/claude')
  })
})
