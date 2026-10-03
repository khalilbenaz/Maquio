// Etat partage (au sens de editorStore.ts) de la detection de Claude Code,
// entre SettingsDialog (qui l'ecrit, apres getSettings()/setClaudeCustomPath
// reussis) et ClaudePanel (qui le lit pour s'activer/se desactiver).
//
// Sans ce magasin partage, ClaudePanel ne saurait jamais qu'un reglage vient
// de reussir dans SettingsDialog -- les deux composants sont freres sous
// Toolbar/App (voir Toolbar.tsx), pas parent/enfant, et ne partagent aucune
// prop. C'est ce qui fait que le panneau redevient utilisable des qu'un
// chemin personnalise valide est enregistre, sans redemarrer l'application
// (une simple ecriture ici, lue reactivement par ClaudePanel via le hook).
import { create } from 'zustand'

// Phase de la demande en cours / derniere : sert de pastille quand le panneau
// est replie (activite, puis resultat succes ou erreur jusqu'a ce qu'on le deplie).
export type ClaudePhase = 'idle' | 'loading' | 'done' | 'error'

export type ClaudeStatusState = {
  available: boolean
  path: string | null
  phase: ClaudePhase
  setStatus: (status: { available: boolean; path: string | null }) => void
  setPhase: (phase: ClaudePhase) => void
}

export const useClaudeStatusStore = create<ClaudeStatusState>((set) => ({
  // Optimiste par defaut (comme l'etait `disponible` dans ClaudePanel avant
  // ce changement) : le panneau ne clignote pas en "indisponible" avant que
  // la premiere verification asynchrone n'ait eu le temps de repondre.
  available: true,
  path: null,
  phase: 'idle',
  setStatus: (status) => set({ available: status.available, path: status.path }),
  setPhase: (phase) => set({ phase }),
}))
