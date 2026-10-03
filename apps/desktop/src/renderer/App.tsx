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
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createDocument, parseDocument, serializeDocument } from '@calque/core'
import type { CalqueApi } from '../shared/api'
import { useEditorStore } from './state/editorStore'
import { useUiPrefs } from './state/uiPrefsStore'
import { useClaudeStatusStore } from './state/claudeStatusStore'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/LayersPanel'
import { PalettePanel } from './panels/PalettePanel'
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

  // Colonne de gauche : calques ou palette de composants (onglets).
  const [ongletGauche, setOngletGauche] = useState<'calques' | 'composants'>('calques')

  // Erreurs de fichier (ouvrir un document invalide, enregistrement refuse) :
  // sans ce garde, la promesse rejetee partait dans le vide et l'utilisateur
  // ne voyait rien. Electron prefixe les erreurs IPC (« Error invoking
  // remote method 'x': Error: ») : on ne garde que le message utile.
  const [erreurFichier, setErreurFichier] = useState<string | null>(null)
  async function signaler(action: () => Promise<void>) {
    try {
      setErreurFichier(null)
      await action()
    } catch (err) {
      const brut = err instanceof Error ? err.message : String(err)
      setErreurFichier(brut.replace(/^Error invoking remote method '[^']*': (Error: )?/, ''))
    }
  }

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
    const detacherOuvrir = evenements.onOpenRequested(() => void signaler(ouvrir))
    const detacherEnregistrer = evenements.onSaveRequested(() => void signaler(() => enregistrer(false)))
    const detacherEnregistrerSous = evenements.onSaveAsRequested(() => void signaler(() => enregistrer(true)))
    return () => {
      detacherNouveau()
      detacherOuvrir()
      detacherEnregistrer()
      detacherEnregistrerSous()
    }
    // Les actions lues ici ne dependent que de documentPath (reabonnement a chaque changement).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath])

  useEffect(() => {
    globalThis.document.title = `${nomDuDocument}${dirty ? ' • non enregistré' : ''} — Calque`
  }, [nomDuDocument, dirty])

  const rightWidth = useUiPrefs((s) => s.rightWidth)

  function commencerRedimensionnement(e: ReactPointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = useUiPrefs.getState().rightWidth
    const move = (ev: PointerEvent) => useUiPrefs.getState().setRightWidth(startW + (startX - ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Cmd/Ctrl+J : replie ou deplie le panneau Claude (meme dans un champ de saisie).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        const prefs = useUiPrefs.getState()
        prefs.toggleClaude()
        if (prefs.claudeCollapsed) {
          const st = useClaudeStatusStore.getState()
          if (st.phase === 'done' || st.phase === 'error') st.setPhase('idle')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      {erreurFichier !== null ? (
        <div role="alert" className="calque-error-banner">
          <span>{erreurFichier}</span>
          <button type="button" aria-label="Fermer le message" onClick={() => setErreurFichier(null)}>
            ×
          </button>
        </div>
      ) : null}
      <Toolbar api={api} onOpenSettings={() => setReglagesOuverts(true)} />
      <div className="calque-body">
        <div className="calque-column-layers">
          <div className="calque-left-tabs" role="tablist" aria-label="Panneau de gauche">
            {(['calques', 'composants'] as const).map((onglet) => (
              <button
                key={onglet}
                type="button"
                role="tab"
                aria-selected={ongletGauche === onglet}
                className={ongletGauche === onglet ? 'calque-left-tab calque-left-tab-active' : 'calque-left-tab'}
                onClick={() => setOngletGauche(onglet)}
              >
                {onglet === 'calques' ? 'Calques' : 'Composants'}
              </button>
            ))}
          </div>
          <div className="calque-left-body">{ongletGauche === 'calques' ? <LayersPanel /> : <PalettePanel />}</div>
        </div>
        <div className="calque-column-canvas">
          <Canvas api={api} />
        </div>
        <div className="calque-column-right" style={{ width: rightWidth }}>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionner le panneau de droite"
            data-testid="right-resizer"
            className="calque-right-resizer"
            onPointerDown={commencerRedimensionnement}
          />
          <InspectorPanel api={api} />
          <ClaudePanel api={api} onOpenSettings={() => setReglagesOuverts(true)} />
        </div>
      </div>
      {reglagesOuverts ? <SettingsDialog api={api} onClose={() => setReglagesOuverts(false)} /> : null}
    </main>
  )
}
