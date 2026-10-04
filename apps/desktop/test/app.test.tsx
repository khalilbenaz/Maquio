// Garde-fou statique (rapport packaged-app, defaut n2 : TypeError non
// rattrapee tuant tout le rendu quand `window.maquio` est absent -- ce
// qui transformait une panne de preload explicable, en journal, en
// fenetre blanche muette pour l'utilisateur). Monte l'application SANS
// passerelle (aucun test ne definit jamais `window.maquio` sur `window`
// dans cet environnement jsdom -- voir apiFactice.ts, toujours passe en
// propriete aux composants, jamais sur `window`) et verifie que le garde
// unique de App.tsx (voir src/renderer/App.tsx) affiche un message clair
// plutot que de laisser une exception remonter.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/renderer/App'

describe('App sans passerelle preload (garde-fou defaut n2)', () => {
  it('affiche un message clair et ne leve aucune exception quand window.maquio est absent', () => {
    expect(window.maquio).toBeUndefined()

    expect(() => render(<App />)).not.toThrow()

    expect(screen.getByText(/passerelle avec le processus principal/i)).toBeInTheDocument()
  })
})
