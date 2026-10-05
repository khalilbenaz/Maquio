// Point d'entree du renderer (Tache 14) : monte l'application React dans
// l'element racine de index.html.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RenderHarness } from './render/RenderHarness'
import '@fontsource/bricolage-grotesque/800.css'
import '@fontsource/geist/400.css'
import '@fontsource/geist/500.css'
import '@fontsource/geist/600.css'
import '@fontsource/geist/700.css'
import '@fontsource/geist/800.css'
import './theme.css'

const racine = document.getElementById('root')
if (racine === null) {
  throw new Error("Element racine '#root' introuvable dans index.html")
}

// #render : fenetre cachee du main qui dessine un ecran pour la critique
// visuelle (voir render/RenderHarness.tsx), sans l'editeur autour.
const rendu = window.location.hash === '#render'
if (rendu) document.body.style.margin = '0'

createRoot(racine).render(<StrictMode>{rendu ? <RenderHarness /> : <App />}</StrictMode>)
