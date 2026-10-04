import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/renderer/App'
import { useClaudeStatusStore } from '../src/renderer/state/claudeStatusStore'
import { clampRightWidth, RIGHT_MAX, RIGHT_MIN, useUiPrefs } from '../src/renderer/state/uiPrefsStore'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => {
  window.maquio = undefined
  localStorage.clear()
  useUiPrefs.setState({ claudeCollapsed: false, rightWidth: 300 })
  useClaudeStatusStore.setState({ available: true, path: null, phase: 'idle' })
})

describe('panneau Claude repliable', () => {
  it('le bouton de l en-tete replie, la bascule de la barre d outils deplie, et la preference est memorisee', () => {
    window.maquio = apiFactice
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(useUiPrefs.getState().claudeCollapsed).toBe(true)
    expect(JSON.parse(localStorage.getItem('maquio.ui.v1')!).claudeCollapsed).toBe(true)
    // rien ne reste du panneau : ni champ, ni bouton de repli
    expect(screen.queryByRole('button', { name: 'Demander à Claude' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Replier le panneau Claude' })).toBeNull()
    const bascule = screen.getByTestId('toggle-claude')
    expect(bascule.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(bascule)
    expect(useUiPrefs.getState().claudeCollapsed).toBe(false)
    expect(screen.getByRole('button', { name: 'Demander à Claude' })).toBeTruthy()
    expect(screen.getByTestId('toggle-claude').getAttribute('aria-pressed')).toBe('true')
  })
  it('replie, la bascule affiche une pastille d activite puis de resultat, effacee a la reouverture', async () => {
    let fin!: (v: { patchJson: string; documentJson: string }) => void
    window.maquio = { ...apiFactice, askClaude: () => new Promise<{ patchJson: string; documentJson: string }>((r) => { fin = r }) }
    render(<App />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'fais quelque chose' } })
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Claude' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(screen.getByTestId('claude-badge').dataset.phase).toBe('loading')
    // le composant reste monte : la reponse arrive meme replie
    const { serializeDocument, createDocument } = await import('@maquio/core')
    const doc = serializeDocument(createDocument('x'))
    await act(async () => { fin({ patchJson: JSON.stringify({ summary: 'ok' }), documentJson: doc }) })
    expect(screen.getByTestId('claude-badge').dataset.phase).toMatch(/done|error/)
    fireEvent.click(screen.getByTestId('toggle-claude'))
    expect(useClaudeStatusStore.getState().phase).toBe('idle')
  })
  it('une erreur donne une pastille d erreur', async () => {
    window.maquio = { ...apiFactice, askClaude: async () => { throw new Error('Claude Code a échoué') } }
    render(<App />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'x' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Demander à Claude' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(screen.getByTestId('claude-badge').dataset.phase).toBe('error')
  })
  it('les trois panneaux se rouvrent par la barre d outils et le bouton de repli n existe que dans un panneau ouvert', () => {
    window.maquio = apiFactice
    useUiPrefs.setState({ leftCollapsed: false, inspectorCollapsed: false, claudeCollapsed: false })
    render(<App />)
    for (const [id, repli] of [['left', 'Replier le panneau de gauche'], ['inspector', "Replier l'inspecteur"], ['claude', 'Replier le panneau Claude']] as const) {
      expect(screen.getAllByRole('button', { name: repli })).toHaveLength(1)
      fireEvent.click(screen.getByTestId(`toggle-${id}`))
      expect(screen.queryByRole('button', { name: repli })).toBeNull()
      expect(screen.getByTestId(`toggle-${id}`).getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(screen.getByTestId(`toggle-${id}`))
      expect(screen.getAllByRole('button', { name: repli })).toHaveLength(1)
    }
  })
})

describe('raccourci et largeur', () => {
  it('Cmd+J replie et deplie', () => {
    window.maquio = apiFactice
    render(<App />)
    fireEvent.keyDown(window, { key: 'j', metaKey: true })
    expect(useUiPrefs.getState().claudeCollapsed).toBe(true)
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(useUiPrefs.getState().claudeCollapsed).toBe(false)
  })
  it('la largeur est bornee et memorisee', () => {
    expect(clampRightWidth(10)).toBe(RIGHT_MIN)
    expect(clampRightWidth(9999)).toBe(RIGHT_MAX)
    expect(clampRightWidth(Number.NaN)).toBe(300)
    window.maquio = apiFactice
    render(<App />)
    const sep = screen.getByTestId('right-resizer')
    fireEvent.pointerDown(sep, { clientX: 1000 })
    fireEvent.pointerMove(window, { clientX: 900 })
    fireEvent.pointerUp(window)
    expect(useUiPrefs.getState().rightWidth).toBe(400)
    expect(JSON.parse(localStorage.getItem('maquio.ui.v1')!).rightWidth).toBe(400)
  })
})
