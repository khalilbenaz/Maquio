// Point d'entree du renderer (Tache 14) : monte l'application React dans
// l'element racine de index.html.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const racine = document.getElementById('root')
if (racine === null) {
  throw new Error("Element racine '#root' introuvable dans index.html")
}

createRoot(racine).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
