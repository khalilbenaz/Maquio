// Declaration globale du pont expose par le preload (Tache 17). Seul
// App.tsx (racine de composition du renderer) lit `window.calque` : tous
// les autres composants recoivent l'API en propriete (voir ClaudePanel,
// FigmaImportDialog, ExportDialog, Toolbar), jamais par acces direct a
// `window`, pour rester testables sans preload.
import type { CalqueApi } from '../shared/api'

declare global {
  interface Window {
    calque: CalqueApi
    // Second pont, optionnel (absent en environnement de test) : signaux
    // du menu natif "Fichier" (Tache 17, decision 10 du brief). Distinct
    // de CalqueApi/API_CHANNELS -- voir preload.ts.
    calqueMenu?: {
      onOpenRequested: (callback: () => void) => () => void
      onSaveRequested: (callback: () => void) => () => void
      onSaveAsRequested: (callback: () => void) => () => void
    }
  }
}

export {}
