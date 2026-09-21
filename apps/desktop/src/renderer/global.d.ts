// Declaration globale du pont expose par le preload (Tache 17). Seul
// App.tsx (racine de composition du renderer) lit `window.calque` : tous
// les autres composants recoivent l'API en propriete (voir ClaudePanel,
// FigmaImportDialog, ExportDialog, Toolbar), jamais par acces direct a
// `window`, pour rester testables sans preload.
//
// Optionnel (correction du defaut n2 du rapport packaged-app) : le
// contextBridge peut echouer a s'enregistrer (preload absent, en erreur
// de syntaxe, etc.), auquel cas `window.calque` vaut reellement
// `undefined` a l'execution -- le typer en non-optionnel masquait ce cas
// et laissait App.tsx lire une propriete de `undefined` sans le savoir.
// App.tsx est le seul endroit qui doit gerer cette absence (voir le garde
// au debut de App()).
import type { CalqueApi } from '../shared/api'

declare global {
  interface Window {
    calque?: CalqueApi
    // Second pont, optionnel (absent en environnement de test) : signaux
    // du menu natif "Fichier" (Tache 17, decision 10 du brief). Distinct
    // de CalqueApi/API_CHANNELS -- voir preload.ts.
    calqueMenu?: {
      onNewRequested: (callback: () => void) => () => void
      onOpenRequested: (callback: () => void) => () => void
      onSaveRequested: (callback: () => void) => () => void
      onSaveAsRequested: (callback: () => void) => () => void
    }
  }
}

export {}
