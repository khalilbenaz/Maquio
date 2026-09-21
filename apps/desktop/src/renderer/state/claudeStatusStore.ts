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

export type ClaudeStatusState = {
  available: boolean
  path: string | null
  setStatus: (status: { available: boolean; path: string | null }) => void
}

export const useClaudeStatusStore = create<ClaudeStatusState>((set) => ({
  // Optimiste par defaut (comme l'etait `disponible` dans ClaudePanel avant
  // ce changement) : le panneau ne clignote pas en "indisponible" avant que
  // la premiere verification asynchrone n'ait eu le temps de repondre.
  available: true,
  path: null,
  setStatus: (status) => set({ available: status.available, path: status.path }),
}))
