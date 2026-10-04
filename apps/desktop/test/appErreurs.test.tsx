// Parcours reel : ouvrir un fichier invalide ou enregistrer un document
// refuse levait une promesse rejetee dans le vide (menu Fichier -> void
// ouvrir()) : aucun message, l'utilisateur croyait a un gel.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/renderer/App'
import { apiFactice } from './helpers/apiFactice'

type Rappels = { open?: () => void; save?: () => void; chemin?: (p: string) => void }

function monter(api: Partial<typeof apiFactice>): Rappels {
  const rappels: Rappels = {}
  const noop = () => () => {}
  window.maquio = { ...apiFactice, ...api }
  window.maquioMenu = {
    onNewRequested: noop,
    onOpenRequested: (cb: () => void) => { rappels.open = cb; return () => {} },
    onSaveRequested: (cb: () => void) => { rappels.save = cb; return () => {} },
    onSaveAsRequested: noop,
    onOpenPathRequested: (cb: (p: string) => void) => { rappels.chemin = cb; return () => {} },
    pathForFile: () => '/d/depose.maquio',
  } as never
  render(<App />)
  return rappels
}

afterEach(() => {
  delete (window as { maquio?: unknown }).maquio
  delete (window as { maquioMenu?: unknown }).maquioMenu
})

describe('App : erreurs de fichier', () => {
  it('affiche le message quand le fichier a ouvrir est invalide', async () => {
    const rappels = monter({
      openDocument: vi.fn(async () => {
        throw new Error("Error invoking remote method 'openDocument': Error: Fichier .maquio invalide : version 99")
      }),
    })
    await act(async () => rappels.open!())
    const alerte = await screen.findByRole('alert')
    expect(alerte.textContent).toContain('Fichier .maquio invalide : version 99')
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

  it('glisser-deposer d un fichier .maquio l ouvre ; ouverture demandee par le systeme aussi', async () => {
    const { createDocument, serializeDocument } = await import('@maquio/core')
    const json = serializeDocument(createDocument('Depose'))
    const openDocumentAt = vi.fn(async (path: string) => ({ path, json }))
    const rappels = monter({ openDocumentAt })
    const main = document.querySelector('main.maquio-app')!
    await act(async () => {
      fireEvent.drop(main, { dataTransfer: { files: [new File(['x'], 'depose.maquio')], types: ['Files'] } })
    })
    expect(openDocumentAt).toHaveBeenCalledWith('/d/depose.maquio')
    await act(async () => rappels.chemin!('/Users/x/double-clic.calque'))
    expect(openDocumentAt).toHaveBeenLastCalledWith('/Users/x/double-clic.calque')
    expect(document.title).toContain('Depose')
  })

  it('un fichier refuse par le main (mauvaise extension) affiche son message', async () => {
    monter({ openDocumentAt: vi.fn(async () => { throw new Error('Seuls les fichiers .maquio (ou .calque, ancien format) peuvent être ouverts.') }) })
    const main = document.querySelector('main.maquio-app')!
    await act(async () => {
      fireEvent.drop(main, { dataTransfer: { files: [new File(['x'], 'x.txt')], types: ['Files'] } })
    })
    expect((await screen.findByRole('alert')).textContent).toContain('.maquio')
  })
})
