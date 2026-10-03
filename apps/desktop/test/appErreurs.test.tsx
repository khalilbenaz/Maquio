// Parcours reel : ouvrir un fichier invalide ou enregistrer un document
// refuse levait une promesse rejetee dans le vide (menu Fichier -> void
// ouvrir()) : aucun message, l'utilisateur croyait a un gel.
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import { apiFactice } from './helpers/apiFactice'

type Rappels = { open?: () => void; save?: () => void }

function monter(api: Partial<typeof apiFactice>): Rappels {
  const rappels: Rappels = {}
  const noop = () => () => {}
  window.calque = { ...apiFactice, ...api }
  window.calqueMenu = {
    onNewRequested: noop,
    onOpenRequested: (cb: () => void) => { rappels.open = cb; return () => {} },
    onSaveRequested: (cb: () => void) => { rappels.save = cb; return () => {} },
    onSaveAsRequested: noop,
  } as never
  render(<App />)
  return rappels
}

afterEach(() => {
  delete (window as { calque?: unknown }).calque
  delete (window as { calqueMenu?: unknown }).calqueMenu
})

describe('App : erreurs de fichier', () => {
  it('affiche le message quand le fichier a ouvrir est invalide', async () => {
    const rappels = monter({
      openDocument: vi.fn(async () => {
        throw new Error("Error invoking remote method 'openDocument': Error: Fichier .calque invalide : version 99")
      }),
    })
    await act(async () => rappels.open!())
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Fichier .calque invalide : version 99')
    expect(alerte.textContent).not.toContain('Error invoking remote method')
  })

  it('affiche le message quand l enregistrement est refuse', async () => {
    const rappels = monter({
      saveDocument: vi.fn(async () => {
        throw new Error('Enregistrement refusé : image')
      }),
    })
    await act(async () => rappels.save!())
    expect((await screen.findByRole('alert')).textContent).toContain('Enregistrement refusé')
  })
})
