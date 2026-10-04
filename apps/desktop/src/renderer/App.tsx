// Renderer (Tache 15, mise en page Tache 16, branchement Tache 17 ;
// refonte visuelle et ergonomique) : barre de titre, barre d'outils en
// haut, calques a gauche, canevas au centre, inspecteur et assistant
// Claude Code a droite (decision 1). Seul ce fichier, racine de
// composition du renderer, lit `window.maquio` : tous les autres
// composants recoivent l'API en propriete (voir Toolbar, ClaudePanel,
// FigmaImportDialog, ExportDialog), jamais par acces direct a `window`,
// pour rester testables sans preload. Aucun acces au disque, au reseau ou
// a un sous-processus ici : tout cela passe par le preload (window.maquio).
import { useEffect, useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createDocument, parseDocument, serializeDocument } from '@maquio/core'
import type { MaquioApi } from '../shared/api'
import { messageOfError } from '../shared/errors'
import { useEditorStore } from './state/editorStore'
import { LEFT_MAX, LEFT_MIN, RAIL_WIDTH, RIGHT_MAX, RIGHT_MIN, useUiPrefs } from './state/uiPrefsStore'
import { CollapseButton, ICON_CLAUDE, ICON_INSPECTOR, ICON_LEFT, PanelRail } from './panels/PanelRail'
import { useClaudeStatusStore } from './state/claudeStatusStore'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/LayersPanel'
import { PalettePanel } from './panels/PalettePanel'
import { InspectorPanel } from './panels/InspectorPanel'
import { Toolbar } from './panels/Toolbar'
import { PrototypeView } from './prototype/PrototypeView'
import { ClaudePanel } from './panels/ClaudePanel'
import { SettingsDialog } from './dialogs/SettingsDialog'
import { AboutDialog } from './dialogs/AboutDialog'
import { useThemeStore } from './state/themeStore'
import { isThemePreference } from '../shared/theme'
import './App.css'

// Point de passage unique pour l'absence de passerelle (correction du
// defaut n2 du rapport packaged-app) : `window.maquio` peut reellement
// etre `undefined` a l'execution (preload en erreur de syntaxe, echec de
// chargement, etc. -- voir global.d.ts). Sans ce garde, la premiere
// lecture d'une propriete de `api` plus bas levait une TypeError non
// rattrapee qui tuait tout le rendu React : fenetre blanche, aucun
// message. `App` ne fait que ce test puis delegue a `Editeur`, qui recoit
// `api` deja garanti non nul (type `MaquioApi`, jamais `| undefined`) --
// ce qui evite aussi de disperser un `if (window.maquio)` dans chaque
// composant, et evite tout risque d'appel conditionnel de Hooks (`App`
// lui-meme n'en a aucun ; `Editeur`, qui en a, n'est jamais monte que
// lorsque `api` existe).
// Raccourcis affiches dans les infobulles (Cmd sur macOS, Ctrl ailleurs).
const MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const MOD = MAC ? 'Cmd' : 'Ctrl'
const ALT = MAC ? 'Option' : 'Alt'
const SHORTCUT_LEFT = `${MOD}+${ALT}+1`
const SHORTCUT_INSPECTOR = `${MOD}+${ALT}+2`
const SHORTCUT_CLAUDE = `${MOD}+J`

export function App() {
  const api = window.maquio
  if (!api) {
    return (
      <main className="maquio-gateway-error">
        <p>
          La passerelle avec le processus principal n'a pas pu être chargée : l'application ne
          peut pas fonctionner. Consultez la console pour plus de détails.
        </p>
      </main>
    )
  }
  return <Editeur api={api} />
}

function Editeur({ api }: { api: MaquioApi }) {
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
  const [aProposOuvert, setAProposOuvert] = useState(false)

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
      setErreurFichier(messageOfError(err))
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

  // Ouverture d'un chemin precis (glisser-deposer, double-clic dans le Finder).
  async function ouvrirChemin(path: string) {
    const result = await api.openDocumentAt(path)
    useEditorStore.getState().load(parseDocument(result.json))
    setDocumentPath(result.path)
    setSavedJson(result.json)
  }

  function surDepot(e: ReactDragEvent) {
    const fichier = e.dataTransfer?.files?.[0]
    if (!fichier) return
    e.preventDefault()
    const chemin = window.maquioMenu?.pathForFile(fichier)
    if (chemin === undefined || chemin === '') return
    void signaler(() => ouvrirChemin(chemin))
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
  // pont (window.maquioMenu, distinct de MaquioApi) -- c'est le renderer
  // qui execute reellement l'action, via les canaux openDocument/
  // saveDocument habituels pour les trois derniers, et localement (voir
  // nouveau() ci-dessus) pour le premier.
  useEffect(() => {
    const evenements = window.maquioMenu
    if (!evenements) return
    const detacherNouveau = evenements.onNewRequested(() => nouveau())
    const detacherOuvrir = evenements.onOpenRequested(() => void signaler(ouvrir))
    const detacherEnregistrer = evenements.onSaveRequested(() => void signaler(() => enregistrer(false)))
    const detacherEnregistrerSous = evenements.onSaveAsRequested(() => void signaler(() => enregistrer(true)))
    const detacherChemin = evenements.onOpenPathRequested((chemin) => void signaler(() => ouvrirChemin(chemin)))
    const detacherAffichage = evenements.onViewRequested((action) => commandeAffichage(action))
    const detacherTheme = evenements.onThemeChanged((p) => {
      if (isThemePreference(p)) useThemeStore.getState().setPreference(p)
    })
    return () => {
      detacherNouveau()
      detacherOuvrir()
      detacherEnregistrer()
      detacherEnregistrerSous()
      detacherChemin()
      detacherAffichage()
      detacherTheme()
    }
    // Les actions lues ici ne dependent que de documentPath (reabonnement a chaque changement).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath])

  useEffect(() => {
    globalThis.document.title = `${nomDuDocument}${dirty ? ' • non enregistré' : ''} — Maquio`
  }, [nomDuDocument, dirty])

  const rightWidth = useUiPrefs((s) => s.rightWidth)
  const leftWidth = useUiPrefs((s) => s.leftWidth)
  const focus = useUiPrefs((s) => s.focusMode)
  const leftCollapsed = useUiPrefs((s) => s.leftCollapsed)
  const inspectorCollapsed = useUiPrefs((s) => s.inspectorCollapsed)
  const claudeCollapsed = useUiPrefs((s) => s.claudeCollapsed)
  const phaseClaude = useClaudeStatusStore((s) => s.phase)
  const leftHidden = focus || leftCollapsed
  const inspHidden = focus || inspectorCollapsed
  const claudeHidden = focus || claudeCollapsed
  // La colonne de droite se reduit en fine barre quand ses deux panneaux le sont.
  const colonneDroiteReduite = inspHidden && claudeHidden
  const prototypeOpen = useEditorStore((s) => s.prototypeOpen)

  // Redimensionnement au glisser : le panneau de gauche grandit vers la droite,
  // celui de droite vers la gauche. Sans transition pendant le geste.
  const [resizing, setResizing] = useState(false)
  function commencerRedimensionnement(e: ReactPointerEvent, cote: 'left' | 'right') {
    e.preventDefault()
    const startX = e.clientX
    const prefs = useUiPrefs.getState()
    const startW = cote === 'left' ? prefs.leftWidth : prefs.rightWidth
    setResizing(true)
    const move = (ev: PointerEvent) => {
      if (cote === 'left') useUiPrefs.getState().setLeftWidth(startW + (ev.clientX - startX))
      else useUiPrefs.getState().setRightWidth(startW + (startX - ev.clientX))
    }
    const up = () => {
      setResizing(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Clavier sur un separateur : fleches (+/- 16 px), Entree / Home = largeur par defaut.
  function clavierRedimensionnement(e: ReactKeyboardEvent, cote: 'left' | 'right') {
    const prefs = useUiPrefs.getState()
    const dir = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0
    if (dir !== 0) {
      e.preventDefault()
      if (cote === 'left') prefs.setLeftWidth(prefs.leftWidth + dir)
      else prefs.setRightWidth(prefs.rightWidth - dir)
    } else if (e.key === 'Enter' || e.key === 'Home') {
      e.preventDefault()
      if (cote === 'left') prefs.resetLeftWidth()
      else prefs.resetRightWidth()
    }
  }

  // Preference de theme memorisee cote main (affichee dans les Reglages).
  useEffect(() => {
    void api
      .getThemePreference()
      .then((p) => useThemeStore.getState().setPreference(p))
      .catch(() => undefined)
  }, [api])

  // Commandes du menu Affichage (memes actions que les raccourcis clavier).
  function commandeAffichage(action: string) {
    const prefs = useUiPrefs.getState()
    if (action === 'left' || action === 'inspector' || action === 'claude') {
      const etaitCache = prefs.focusMode || (action === 'claude' && prefs.claudeCollapsed)
      prefs.togglePanel(action)
      if (action === 'claude' && etaitCache) {
        const st = useClaudeStatusStore.getState()
        if (st.phase === 'done' || st.phase === 'error') st.setPhase('idle')
      }
    } else if (action === 'focus') prefs.toggleFocus()
    else if (action === 'prototype') useEditorStore.getState().setPrototypeOpen(true)
  }

  // Cmd/Ctrl+J : replie ou deplie le panneau Claude (meme dans un champ de saisie).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault()
        useEditorStore.getState().setPrototypeOpen(true)
        return
      }
      const mod = e.metaKey || e.ctrlKey
      // Panneaux : Cmd/Ctrl+Alt+1 (gauche), +2 (inspecteur), Cmd/Ctrl+J (Claude),
      // Cmd/Ctrl+. (mode focus). `code` et non `key` : Option change la lettre sur macOS.
      if (mod && e.altKey && !e.shiftKey && e.code === 'Digit1') {
        e.preventDefault()
        useUiPrefs.getState().togglePanel('left')
      } else if (mod && e.altKey && !e.shiftKey && e.code === 'Digit2') {
        e.preventDefault()
        useUiPrefs.getState().togglePanel('inspector')
      } else if (mod && !e.shiftKey && !e.altKey && e.code === 'Period') {
        e.preventDefault()
        useUiPrefs.getState().toggleFocus()
      } else if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        const prefs = useUiPrefs.getState()
        const etaitCache = prefs.focusMode || prefs.claudeCollapsed
        prefs.toggleClaude()
        if (etaitCache) {
          const st = useClaudeStatusStore.getState()
          if (st.phase === 'done' || st.phase === 'error') st.setPhase('idle')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main
      className="maquio-app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={surDepot}
    >
      <div className="maquio-titlebar">
        <button type="button" className="maquio-brand" aria-label="À propos de Maquio" title="À propos de Maquio" onClick={() => setAProposOuvert(true)}>
          <img className="maquio-brand-icon" src="./icon.png" alt="" />
          <span className="maquio-wordmark">maquio</span>
        </button>
        <span className="maquio-titlebar-separator" aria-hidden="true" />
        <h1 className="maquio-titlebar-document">
          {nomDuDocument}
          {dirty ? <span className="maquio-titlebar-dirty" title="Modifications non enregistrées">•</span> : null}
        </h1>
        <span className="maquio-titlebar-spacer" />
        {page ? (
          <span className="maquio-titlebar-device">
            {page.device.label} · {page.device.width} × {page.device.height}
          </span>
        ) : null}
      </div>
      {erreurFichier !== null ? (
        <div role="alert" className="maquio-error-banner">
          <span>{erreurFichier}</span>
          <button type="button" aria-label="Fermer le message" onClick={() => setErreurFichier(null)}>
            ×
          </button>
        </div>
      ) : null}
      <div className={focus ? 'maquio-chrome maquio-chrome-hidden' : 'maquio-chrome'} inert={focus} aria-hidden={focus}>
        <Toolbar api={api} onOpenSettings={() => setReglagesOuverts(true)} />
      </div>
      {focus ? (
        <button type="button" className="maquio-focus-exit" aria-label="Quitter le mode focus" title="Quitter le mode focus (Cmd/Ctrl+.)" onClick={() => useUiPrefs.getState().toggleFocus()}>
          Quitter le mode focus
        </button>
      ) : null}
      <div className={resizing ? 'maquio-body maquio-resizing' : 'maquio-body'} data-focus={focus ? 'true' : 'false'}>
        <div
          className="maquio-column-layers"
          data-testid="left-column"
          data-collapsed={leftHidden ? 'true' : 'false'}
          style={{ width: focus ? 0 : leftCollapsed ? RAIL_WIDTH : leftWidth }}
        >
          {leftCollapsed && !focus ? (
            <PanelRail side="left" testId="left-rail" items={[{ id: 'left', label: 'Déplier le panneau de gauche', shortcut: SHORTCUT_LEFT, icon: ICON_LEFT, onClick: () => useUiPrefs.getState().togglePanel('left') }]} />
          ) : null}
          <div className="panel-content" inert={leftHidden} aria-hidden={leftHidden} data-testid="left-panel">
            <div className="maquio-left-tabs" role="tablist" aria-label="Panneau de gauche">
              {(['calques', 'composants'] as const).map((onglet) => (
                <button
                  key={onglet}
                  type="button"
                  role="tab"
                  aria-selected={ongletGauche === onglet}
                  className={ongletGauche === onglet ? 'maquio-left-tab maquio-left-tab-active' : 'maquio-left-tab'}
                  onClick={() => setOngletGauche(onglet)}
                >
                  {onglet === 'calques' ? 'Calques' : 'Composants'}
                </button>
              ))}
              <CollapseButton label="Replier le panneau de gauche" shortcut={SHORTCUT_LEFT} direction="left" onClick={() => useUiPrefs.getState().togglePanel('left')} />
            </div>
            <div className="maquio-left-body">{ongletGauche === 'calques' ? <LayersPanel /> : <PalettePanel />}</div>
          </div>
          {!leftHidden ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionner le panneau de gauche"
              aria-valuenow={leftWidth}
              aria-valuemin={LEFT_MIN}
              aria-valuemax={LEFT_MAX}
              tabIndex={0}
              data-testid="left-resizer"
              className="maquio-left-resizer"
              title="Glisser pour redimensionner, double-clic pour la largeur par défaut"
              onPointerDown={(e) => commencerRedimensionnement(e, 'left')}
              onDoubleClick={() => useUiPrefs.getState().resetLeftWidth()}
              onKeyDown={(e) => clavierRedimensionnement(e, 'left')}
            />
          ) : null}
        </div>
        <div className="maquio-column-canvas">
          <Canvas api={api} />
        </div>
        <div
          className="maquio-column-right"
          data-testid="right-column"
          data-collapsed={colonneDroiteReduite ? 'true' : 'false'}
          style={{ width: focus ? 0 : colonneDroiteReduite ? RAIL_WIDTH : rightWidth }}
        >
          {colonneDroiteReduite && !focus ? (
            <PanelRail
              side="right"
              testId="right-rail"
              items={[
                { id: 'inspector', label: "Déplier l'inspecteur", shortcut: SHORTCUT_INSPECTOR, icon: ICON_INSPECTOR, onClick: () => useUiPrefs.getState().togglePanel('inspector') },
                {
                  id: 'claude',
                  label: 'Déplier le panneau Claude',
                  shortcut: SHORTCUT_CLAUDE,
                  icon: ICON_CLAUDE,
                  onClick: () => {
                    useUiPrefs.getState().togglePanel('claude')
                    const st = useClaudeStatusStore.getState()
                    if (st.phase === 'done' || st.phase === 'error') st.setPhase('idle')
                  },
                  badge: phaseClaude !== 'idle' ? <span data-testid="claude-badge" data-phase={phaseClaude} role="status" aria-label={phaseClaude === 'loading' ? 'Claude travaille' : phaseClaude === 'done' ? 'Claude a terminé' : 'Claude a échoué'} className={`claude-badge claude-badge-${phaseClaude}`} /> : undefined,
                },
              ]}
            />
          ) : null}
          <div className={colonneDroiteReduite ? 'panel-content panel-content-hidden' : 'panel-content'} inert={colonneDroiteReduite} aria-hidden={colonneDroiteReduite}>
            {!colonneDroiteReduite ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionner le panneau de droite"
                aria-valuenow={rightWidth}
                aria-valuemin={RIGHT_MIN}
                aria-valuemax={RIGHT_MAX}
                tabIndex={0}
                data-testid="right-resizer"
                className="maquio-right-resizer"
                title="Glisser pour redimensionner, double-clic pour la largeur par défaut"
                onPointerDown={(e) => commencerRedimensionnement(e, 'right')}
                onDoubleClick={() => useUiPrefs.getState().resetRightWidth()}
                onKeyDown={(e) => clavierRedimensionnement(e, 'right')}
              />
            ) : null}
            <div className={inspHidden ? 'inspector-shell inspector-shell-collapsed' : 'inspector-shell'}>
              <div className="panel-header">
                <span className="panel-header-title">Inspecteur</span>
                <span className="panel-header-spacer" />
                {inspHidden ? (
                  <button type="button" className="panel-collapse" aria-label="Déplier l'inspecteur" title={`Déplier l'inspecteur (${SHORTCUT_INSPECTOR})`} onClick={() => useUiPrefs.getState().togglePanel('inspector')}>
                    ▾
                  </button>
                ) : (
                  <CollapseButton label="Replier l'inspecteur" shortcut={SHORTCUT_INSPECTOR} direction="right" onClick={() => useUiPrefs.getState().togglePanel('inspector')} />
                )}
              </div>
              <div className="panel-content" inert={inspHidden} aria-hidden={inspHidden} hidden={inspHidden} data-testid="inspector-panel">
                <InspectorPanel api={api} />
              </div>
            </div>
            <ClaudePanel api={api} onOpenSettings={() => setReglagesOuverts(true)} />
          </div>
        </div>
      </div>
      {prototypeOpen ? <PrototypeView onClose={() => useEditorStore.getState().setPrototypeOpen(false)} /> : null}
      {aProposOuvert ? <AboutDialog onClose={() => setAProposOuvert(false)} /> : null}
      {reglagesOuverts ? <SettingsDialog api={api} onClose={() => setReglagesOuverts(false)} /> : null}
    </main>
  )
}
