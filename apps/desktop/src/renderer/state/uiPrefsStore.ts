// Preferences d'interface memorisees entre les sessions (localStorage du
// renderer, dans le profil de l'application) : panneau Claude replie ou non,
// largeur de la colonne de droite. Toute lecture/ecriture est protegee : un
// stockage indisponible ne doit jamais empecher l'application de demarrer.
import { create } from 'zustand'

export const RIGHT_MIN = 260
export const RIGHT_MAX = 560
export const RIGHT_DEFAULT = 300
const KEY = 'maquio.ui.v1'

type Persisted = { claudeCollapsed: boolean; rightWidth: number }

export function clampRightWidth(w: number): number {
  if (!Number.isFinite(w)) return RIGHT_DEFAULT
  return Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, Math.round(w)))
}

function load(): Persisted {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>
      return { claudeCollapsed: p.claudeCollapsed === true, rightWidth: clampRightWidth(p.rightWidth ?? RIGHT_DEFAULT) }
    }
  } catch {
    // stockage illisible : valeurs par defaut
  }
  return { claudeCollapsed: false, rightWidth: RIGHT_DEFAULT }
}

function save(p: Persisted): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p))
  } catch {
    // stockage indisponible : la preference n'est simplement pas memorisee
  }
}

export type UiPrefs = Persisted & {
  setClaudeCollapsed(v: boolean): void
  toggleClaude(): void
  setRightWidth(w: number): void
}

export const useUiPrefs = create<UiPrefs>((set, get) => ({
  ...load(),
  setClaudeCollapsed(v) {
    set({ claudeCollapsed: v })
    save({ claudeCollapsed: v, rightWidth: get().rightWidth })
  },
  toggleClaude() {
    get().setClaudeCollapsed(!get().claudeCollapsed)
  },
  setRightWidth(w) {
    const rightWidth = clampRightWidth(w)
    set({ rightWidth })
    save({ claudeCollapsed: get().claudeCollapsed, rightWidth })
  },
}))
