// Renderer (Tache 15) : monte le canevas d'edition. Le magasin (editorStore)
// demarre deja avec un document vierge (voir editorStore.ts) ; le chargement
// depuis disque via le preload (window.calque.openDocument) et la barre
// d'outils arrivent a la Tache 16, qui cablera setTool/zoom/pan. Aucun acces
// au disque, au reseau ou a un sous-processus ici : tout cela passe par le
// preload (window.calque).
import { useEditorStore } from './state/editorStore'
import { Canvas } from './canvas/Canvas'

export function App() {
  const nomDuDocument = useEditorStore((s) => s.document.name)

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h1>{nomDuDocument}</h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Canvas />
      </div>
    </main>
  )
}
