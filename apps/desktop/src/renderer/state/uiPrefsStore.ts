// Preferences d'interface memorisees entre les sessions (localStorage du
// renderer, dans le profil de l'application) : etat (ouvert / reduit) et
// largeur de chaque panneau, mode focus. Toute lecture/ecriture est
// protegee : un stockage indisponible ne doit jamais empecher l'application
// de demarrer.
import { create } from 'zustand'

export const RIGHT_MIN = 260
export const RIGHT_MAX = 560
export const RIGHT_DEFAULT = 300
export const LEFT_MIN = 200
export const LEFT_MAX = 480
export const LEFT_DEFAULT = 248
// Largeur d'un panneau reduit : une fine barre sur son bord.
export const RAIL_WIDTH = 36
const KEY = 'maquio.ui.v1'

export type PanelName = 'left' | 'inspector' | 'claude'

type Persisted = {
  leftCollapsed: boolean
  inspectorCollapsed: boolean
  claudeCollapsed: boolean
  focusMode: boolean
  leftWidth: number
  rightWidth: number
}

const DEFAULTS: Persisted = {
  leftCollapsed: false,
  inspectorCollapsed: false,
  claudeCollapsed: false,
  focusMode: false,
  leftWidth: LEFT_DEFAULT,
  rightWidth: RIGHT_DEFAULT,
}

const clamp = (v: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback

export const clampRightWidth = (w: number): number => clamp(w, RIGHT_MIN, RIGHT_MAX, RIGHT_DEFAULT)
export const clampLeftWidth = (w: number): number => clamp(w, LEFT_MIN, LEFT_MAX, LEFT_DEFAULT)

function load(): Persisted {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>
      return {
        leftCollapsed: p.leftCollapsed === true,
        inspectorCollapsed: p.inspectorCollapsed === true,
        claudeCollapsed: p.claudeCollapsed === true,
        focusMode: p.focusMode === true,
        leftWidth: clampLeftWidth(p.leftWidth ?? LEFT_DEFAULT),
        rightWidth: clampRightWidth(p.rightWidth ?? RIGHT_DEFAULT),
      }
    }
  } catch {
    // stockage illisible : valeurs par defaut
  }
  return { ...DEFAULTS }
}

function save(s: Persisted): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s))
  } catch {
    // stockage indisponible : la preference n'est simplement pas memorisee
  }
}

const persistedOf = (s: Persisted): Persisted => ({
  leftCollapsed: s.leftCollapsed,
  inspectorCollapsed: s.inspectorCollapsed,
  claudeCollapsed: s.claudeCollapsed,
  focusMode: s.focusMode,
  leftWidth: s.leftWidth,
  rightWidth: s.rightWidth,
})

export type UiPrefs = Persisted & {
  setPanelCollapsed(panel: PanelName, collapsed: boolean): void
  togglePanel(panel: PanelName): void
  toggleFocus(): void
  setLeftWidth(w: number): void
  setRightWidth(w: number): void
  resetLeftWidth(): void
  resetRightWidth(): void
  // Compatibilite (panneau Claude).
  setClaudeCollapsed(v: boolean): void
  toggleClaude(): void
}

export const useUiPrefs = create<UiPrefs>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    save(persistedOf({ ...get(), ...patch }))
  }
  const key = (panel: PanelName): 'leftCollapsed' | 'inspectorCollapsed' | 'claudeCollapsed' =>
    panel === 'left' ? 'leftCollapsed' : panel === 'inspector' ? 'inspectorCollapsed' : 'claudeCollapsed'
  return {
    ...load(),
    setPanelCollapsed(panel, collapsed) {
      // Reduire ou rouvrir un panneau a la main sort du mode focus (on
      // agit sur la mise en page : ce que l'on voit doit refleter l'action).
      update({ [key(panel)]: collapsed, focusMode: false })
    },
    togglePanel(panel) {
      const s = get()
      const hidden = s.focusMode || s[key(panel)]
      update({ [key(panel)]: !hidden, focusMode: false })
    },
    // Le mode focus masque tout sans toucher aux etats individuels : le
    // quitter restaure exactement l'etat precedent.
    toggleFocus() {
      update({ focusMode: !get().focusMode })
    },
    setLeftWidth(w) {
      update({ leftWidth: clampLeftWidth(w) })
    },
    setRightWidth(w) {
      update({ rightWidth: clampRightWidth(w) })
    },
    resetLeftWidth() {
      update({ leftWidth: LEFT_DEFAULT })
    },
    resetRightWidth() {
      update({ rightWidth: RIGHT_DEFAULT })
    },
    setClaudeCollapsed(v) {
      get().setPanelCollapsed('claude', v)
    },
    toggleClaude() {
      get().togglePanel('claude')
    },
  }
})

// Un panneau est cache s'il est reduit OU si le mode focus est actif.
export function isPanelHidden(s: Persisted, panel: PanelName): boolean {
  return s.focusMode || s[panel === 'left' ? 'leftCollapsed' : panel === 'inspector' ? 'inspectorCollapsed' : 'claudeCollapsed']
}
