import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/renderer/App'
import { ClaudePanel } from '../src/renderer/panels/ClaudePanel'
import { useClaudeStatusStore } from '../src/renderer/state/claudeStatusStore'
import { clampRightWidth, RIGHT_MAX, RIGHT_MIN, useUiPrefs } from '../src/renderer/state/uiPrefsStore'
import { apiFactice } from './helpers/apiFactice'

beforeEach(() => {
  window.calque = undefined
  localStorage.clear()
  useUiPrefs.setState({ claudeCollapsed: false, rightWidth: 300 })
  useClaudeStatusStore.setState({ available: true, path: null, phase: 'idle' })
})

describe('panneau Claude repliable', () => {
  it('le bouton replie puis deplie, et la preference est memorisee', () => {
    render(<ClaudePanel api={apiFactice} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(useUiPrefs.getState().claudeCollapsed).toBe(true)
    expect(JSON.parse(localStorage.getItem('calque.ui.v1')!).claudeCollapsed).toBe(true)
    expect(screen.queryByRole('button', { name: 'Demander à Claude' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Déplier le panneau Claude' }))
    expect(useUiPrefs.getState().claudeCollapsed).toBe(false)
    expect(screen.getByRole('button', { name: 'Demander à Claude' })).toBeTruthy()
  })
  it('replie, le panneau affiche une pastille d activite puis de resultat, effacee au depliage', async () => {
    let fin!: (v: { patchJson: string; documentJson: string }) => void
    const api = { ...apiFactice, askClaude: () => new Promise<{ patchJson: string; documentJson: string }>((r) => { fin = r }) }
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'fais quelque chose' } })
    fireEvent.click(screen.getByRole('button', { name: 'Demander à Claude' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(screen.getByTestId('claude-badge').dataset.phase).toBe('loading')
    // le composant reste monte : la reponse arrive meme replie
    const { serializeDocument, createDocument } = await import('@calque/core')
    const doc = serializeDocument(createDocument('x'))
    await act(async () => { fin({ patchJson: JSON.stringify({ summary: 'ok' }), documentJson: doc }) })
    expect(screen.getByTestId('claude-badge').dataset.phase).toMatch(/done|error/)
    fireEvent.click(screen.getByRole('button', { name: 'Déplier le panneau Claude' }))
    expect(useClaudeStatusStore.getState().phase).toBe('idle')
  })
  it('une erreur donne une pastille d erreur', async () => {
    const api = { ...apiFactice, askClaude: async () => { throw new Error('Claude Code a échoué') } }
    render(<ClaudePanel api={api} onOpenSettings={() => {}} />)
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'x' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Demander à Claude' })) })
    fireEvent.click(screen.getByRole('button', { name: 'Replier le panneau Claude' }))
    expect(screen.getByTestId('claude-badge').dataset.phase).toBe('error')
  })
})

describe('raccourci et largeur', () => {
  it('Cmd+J replie et deplie', () => {
    window.calque = apiFactice
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
    window.calque = apiFactice
    render(<App />)
    const sep = screen.getByTestId('right-resizer')
    fireEvent.pointerDown(sep, { clientX: 1000 })
    fireEvent.pointerMove(window, { clientX: 900 })
    fireEvent.pointerUp(window)
    expect(useUiPrefs.getState().rightWidth).toBe(400)
    expect(JSON.parse(localStorage.getItem('calque.ui.v1')!).rightWidth).toBe(400)
  })
})
