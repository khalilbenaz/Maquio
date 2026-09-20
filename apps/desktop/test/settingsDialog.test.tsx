// Correction round 2 (Critical) : sans ce dialogue, aucun composant du
// renderer n'appelait jamais setFigmaToken/getSettings -- l'import Figma
// par l'API etait inatteignable pour un utilisateur (le jeton restait
// toujours absent, voir figmaHandlers.ts / FigmaTokenMissingError).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../src/renderer/dialogs/SettingsDialog'
import { apiFactice } from './helpers/apiFactice'

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
    render(<SettingsDialog api={{ ...apiFactice, getSettings: async () => ({ hasFigmaToken: true }) }} onClose={() => {}} />)
    expect(await screen.findByText(/un jeton figma est enregistre/i)).toBeTruthy()
  })

  it('affiche l adresse ou obtenir un jeton, en texte non cliquable', () => {
    render(<SettingsDialog api={apiFactice} onClose={() => {}} />)
    expect(screen.getByText(/figma\.com\/developers\/api/)).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
