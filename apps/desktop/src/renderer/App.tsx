// Renderer (Tache 15, mise en page Tache 16) : barre d'outils en haut,
// calques a gauche, canevas au centre, inspecteur a droite (decision 1).
// Le magasin (editorStore) demarre deja avec un document vierge (voir
// editorStore.ts) ; le chargement depuis disque via le preload
// (window.calque.openDocument) arrive a la Tache 17. Aucun acces au
// disque, au reseau ou a un sous-processus ici : tout cela passe par le
// preload (window.calque).
import { useEditorStore } from './state/editorStore'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/LayersPanel'
import { InspectorPanel } from './panels/InspectorPanel'
import { Toolbar } from './panels/Toolbar'

export function App() {
  const nomDuDocument = useEditorStore((s) => s.document.name)

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h1 style={{ margin: 0, padding: '4px 10px', fontSize: 12, fontWeight: 400, color: '#9a9aa2', background: '#17181a' }}>
        {nomDuDocument}
      </h1>
      <Toolbar />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <LayersPanel />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Canvas />
        </div>
        <div style={{ width: 260, flexShrink: 0 }}>
          <InspectorPanel />
        </div>
      </div>
    </main>
  )
}
