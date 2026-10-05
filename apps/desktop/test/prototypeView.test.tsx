// « ↺ Départ » du prototype : rejoue depuis le DEBUT du parcours (le premier
// ecran de la page), meme quand le prototype a ete lance depuis un autre
// ecran (celui qui etait selectionne dans l'editeur).
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, createDocument, createScreenCommand, createScreenNode } from '@maquio/core'
import { PrototypeView } from '../src/renderer/prototype/PrototypeView'
import { useEditorStore } from '../src/renderer/state/editorStore'

describe('PrototypeView — Départ', () => {
  let premier: string
  let second: string

  beforeEach(() => {
    useEditorStore.getState().load(createDocument('Proto'))
    const a = createScreenNode('Connexion', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 })
    const b = createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 })
    const { pageId, execute } = useEditorStore.getState()
    execute(createScreenCommand(pageId, a))
    execute(createScreenCommand(pageId, b))
    premier = a.id
    second = b.id
  })

  it('lance sur l ecran selectionne, mais Départ revient au premier ecran du parcours', () => {
    useEditorStore.getState().setActiveScreenId(second)
    render(<PrototypeView onClose={() => {}} />)
    expect(screen.getByTestId('proto-current').textContent).toBe('Accueil')
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au départ' }))
    expect(screen.getByTestId('proto-current').textContent).toBe('Connexion')
    expect(screen.getByTestId('proto-stage').getAttribute('data-current')).toBe(premier)
  })
})
