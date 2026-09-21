// Renderer (Tache 15, mise en page Tache 16, branchement Tache 17) :
// barre d'outils en haut, calques a gauche, canevas au centre, inspecteur
// et assistant Claude Code a droite (decision 1). Seul ce fichier, racine
// de composition du renderer, lit `window.calque` : tous les autres
// composants recoivent l'API en propriete (voir Toolbar, ClaudePanel,
// FigmaImportDialog, ExportDialog), jamais par acces direct a `window`,
// pour rester testables sans preload. Aucun acces au disque, au reseau ou
// a un sous-processus ici : tout cela passe par le preload (window.calque).
import { useEffect, useState } from 'react'
import { parseDocument, serializeDocument } from '@calque/core'
import type { CalqueApi } from '../shared/api'
import { useEditorStore } from './state/editorStore'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/LayersPanel'
import { InspectorPanel } from './panels/InspectorPanel'
import { Toolbar } from './panels/Toolbar'
import { ClaudePanel } from './panels/ClaudePanel'

// Point de passage unique pour l'absence de passerelle (correction du
// defaut n2 du rapport packaged-app) : `window.calque` peut reellement
// etre `undefined` a l'execution (preload en erreur de syntaxe, echec de
// chargement, etc. -- voir global.d.ts). Sans ce garde, la premiere
// lecture d'une propriete de `api` plus bas levait une TypeError non
// rattrapee qui tuait tout le rendu React : fenetre blanche, aucun
// message. `App` ne fait que ce test puis delegue a `Editeur`, qui recoit
// `api` deja garanti non nul (type `CalqueApi`, jamais `| undefined`) --
// ce qui evite aussi de disperser un `if (window.calque)` dans chaque
// composant, et evite tout risque d'appel conditionnel de Hooks (`App`
// lui-meme n'en a aucun ; `Editeur`, qui en a, n'est jamais monte que
// lorsque `api` existe).
export function App() {
  const api = window.calque
  if (!api) {
    return (
      <main
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 24,
          background: '#17181a',
          color: '#e2e2e6',
          fontFamily: 'sans-serif',
        }}
      >
        <p style={{ maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
          La passerelle avec le processus principal n'a pas pu être chargée : l'application ne
          peut pas fonctionner. Consultez la console pour plus de détails.
        </p>
      </main>
    )
  }
  return <Editeur api={api} />
}

function Editeur({ api }: { api: CalqueApi }) {
  const nomDuDocument = useEditorStore((s) => s.document.name)
  const documentCourant = useEditorStore((s) => s.document)

  // Decision 10 du brief : le titre de la fenetre porte le nom du
  // document et un indicateur de modification -- `savedJson` est
  // l'instantane du contenu enregistre (ou charge) le plus recent ;
  // `dirty` compare le document courant a cet instantane.
  const [documentPath, setDocumentPath] = useState<string | null>(null)
  const [savedJson, setSavedJson] = useState(() => serializeDocument(documentCourant))
  const dirty = serializeDocument(documentCourant) !== savedJson

  async function ouvrir() {
    const result = await api.openDocument()
    if (result === null) return
    useEditorStore.getState().load(parseDocument(result.json))
    setDocumentPath(result.path)
    setSavedJson(result.json)
  }

  async function enregistrer(forceEnregistrerSous: boolean) {
    const json = serializeDocument(useEditorStore.getState().document)
    const result = await api.saveDocument({ path: forceEnregistrerSous ? null : documentPath, json })
    if (result === null) return
    setDocumentPath(result.path)
    setSavedJson(json)
  }

  // Decision 10 : le menu natif "Fichier" (Ouvrir/Enregistrer/Enregistrer
  // sous) vit cote main et signale son intention via le second pont
  // (window.calqueMenu, distinct de CalqueApi) -- c'est le renderer qui
  // execute reellement l'action, via les canaux openDocument/saveDocument
  // habituels.
  useEffect(() => {
    const evenements = window.calqueMenu
    if (!evenements) return
    const detacherOuvrir = evenements.onOpenRequested(() => void ouvrir())
    const detacherEnregistrer = evenements.onSaveRequested(() => void enregistrer(false))
    const detacherEnregistrerSous = evenements.onSaveAsRequested(() => void enregistrer(true))
    return () => {
      detacherOuvrir()
      detacherEnregistrer()
      detacherEnregistrerSous()
    }
  }, [documentPath])

  useEffect(() => {
    globalThis.document.title = `${nomDuDocument}${dirty ? ' • non enregistré' : ''} — Calque`
  }, [nomDuDocument, dirty])

  return (
    <main style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <h1 style={{ margin: 0, padding: '4px 10px', fontSize: 12, fontWeight: 400, color: '#9a9aa2', background: '#17181a' }}>
        {nomDuDocument}
        {dirty ? ' •' : ''}
      </h1>
      <Toolbar api={api} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <LayersPanel />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Canvas />
        </div>
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <InspectorPanel />
          <ClaudePanel api={api} />
        </div>
      </div>
    </main>
  )
}
