// Renderer (Tache 15, mise en page Tache 16, branchement Tache 17 ;
// refonte visuelle et ergonomique) : barre de titre, barre d'outils en
// haut, calques a gauche, canevas au centre, inspecteur et assistant
// Claude Code a droite (decision 1). Seul ce fichier, racine de
// composition du renderer, lit `window.calque` : tous les autres
// composants recoivent l'API en propriete (voir Toolbar, ClaudePanel,
// FigmaImportDialog, ExportDialog), jamais par acces direct a `window`,
// pour rester testables sans preload. Aucun acces au disque, au reseau ou
// a un sous-processus ici : tout cela passe par le preload (window.calque).
import { useEffect, useState } from 'react'
import { createDocument, parseDocument, serializeDocument } from '@calque/core'
import type { CalqueApi } from '../shared/api'
import { useEditorStore } from './state/editorStore'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/LayersPanel'
import { InspectorPanel } from './panels/InspectorPanel'
import { Toolbar } from './panels/Toolbar'
import { ClaudePanel } from './panels/ClaudePanel'
import { SettingsDialog } from './dialogs/SettingsDialog'
import './App.css'

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
      <main className="calque-gateway-error">
        <p>
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
  const pageId = useEditorStore((s) => s.pageId)
  const page = documentCourant.pages.find((p) => p.id === pageId)

  // Decision 10 du brief : le titre de la fenetre porte le nom du
  // document et un indicateur de modification -- `savedJson` est
  // l'instantane du contenu enregistre (ou charge) le plus recent ;
  // `dirty` compare le document courant a cet instantane.
  //
  // `documentPath` vit desormais dans editorStore (defaut n3, ruling sur
  // le stockage des images) : NodeView (canvas) en a besoin pour resoudre
  // le src RELATIF d'une image deja enregistree, et n'a pas de lien de
  // parente direct avec ce composant -- voir la note dans editorStore.ts.
  // Ecrit ici exactement comme l'etait l'ancien useState local (nouveau ->
  // null, ouvrir -> chemin lu, enregistrer -> chemin ecrit).
  const documentPath = useEditorStore((s) => s.documentPath)
  const setDocumentPath = useEditorStore((s) => s.setDocumentPath)
  const [savedJson, setSavedJson] = useState(() => serializeDocument(documentCourant))
  const dirty = serializeDocument(documentCourant) !== savedJson

  // Defaut n1 (« les reglages ont disparu ») : le dialogue des reglages
  // doit rester joignable depuis DEUX points d'entree independants --
  // le bouton "Reglages" de la barre d'outils (correction round 2,
  // toujours present) ET, desormais, le renvoi du panneau Claude quand la
  // connexion echoue (un vrai bouton cliquable, plus une simple phrase).
  // Toolbar et ClaudePanel sont freres sous ce composant, sans lien de
  // parente direct entre eux : l'etat d'ouverture du dialogue et son rendu
  // remontent donc ici, au plus proche ancetre commun, plutot que d'etre
  // duplique ou pousse dans un magasin partage supplementaire pour un
  // simple booleen d'affichage.
  const [reglagesOuverts, setReglagesOuverts] = useState(false)

  // "Nouveau" (finition v1) : aucun canal main n'est necessaire (voir la
  // note dans preload.ts) -- un document vierge se construit entierement
  // ici avec createDocument(), deja utilise par le magasin lui-meme pour
  // son document initial. Reinitialise aussi le suivi de chemin/etat
  // enregistre, comme ouvrir() : un "Nouveau" ne doit jamais ecraser le
  // fichier ouvert precedemment au prochain "Enregistrer".
  function nouveau() {
    const doc = createDocument('Document sans titre')
    useEditorStore.getState().load(doc)
    setDocumentPath(null)
    setSavedJson(serializeDocument(doc))
  }

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

  // Decision 10 : le menu natif "Fichier" (Nouveau/Ouvrir/Enregistrer/
  // Enregistrer sous) vit cote main et signale son intention via le second
  // pont (window.calqueMenu, distinct de CalqueApi) -- c'est le renderer
  // qui execute reellement l'action, via les canaux openDocument/
  // saveDocument habituels pour les trois derniers, et localement (voir
  // nouveau() ci-dessus) pour le premier.
  useEffect(() => {
    const evenements = window.calqueMenu
    if (!evenements) return
    const detacherNouveau = evenements.onNewRequested(() => nouveau())
    const detacherOuvrir = evenements.onOpenRequested(() => void ouvrir())
    const detacherEnregistrer = evenements.onSaveRequested(() => void enregistrer(false))
    const detacherEnregistrerSous = evenements.onSaveAsRequested(() => void enregistrer(true))
    return () => {
      detacherNouveau()
      detacherOuvrir()
      detacherEnregistrer()
      detacherEnregistrerSous()
    }
  }, [documentPath])

  useEffect(() => {
    globalThis.document.title = `${nomDuDocument}${dirty ? ' • non enregistré' : ''} — Calque`
  }, [nomDuDocument, dirty])

  return (
    <main className="calque-app">
      <div className="calque-titlebar">
        <span className="calque-wordmark">Calque</span>
        <span className="calque-titlebar-separator" aria-hidden="true" />
        <h1 className="calque-titlebar-document">
          {nomDuDocument}
          {dirty ? <span className="calque-titlebar-dirty" title="Modifications non enregistrées">•</span> : null}
        </h1>
        <span className="calque-titlebar-spacer" />
        {page ? (
          <span className="calque-titlebar-device">
            {page.device.label} · {page.device.width} × {page.device.height}
          </span>
        ) : null}
      </div>
      <Toolbar api={api} onOpenSettings={() => setReglagesOuverts(true)} />
      <div className="calque-body">
        <div className="calque-column-layers">
          <LayersPanel />
        </div>
        <div className="calque-column-canvas">
          <Canvas api={api} />
        </div>
        <div className="calque-column-right">
          <InspectorPanel api={api} />
          <ClaudePanel api={api} onOpenSettings={() => setReglagesOuverts(true)} />
        </div>
      </div>
      {reglagesOuverts ? <SettingsDialog api={api} onClose={() => setReglagesOuverts(false)} /> : null}
    </main>
  )
}
