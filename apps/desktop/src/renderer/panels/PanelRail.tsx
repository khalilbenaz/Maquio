// Icones des panneaux, raccourcis et bouton de repli de l'en-tete d'un panneau
// OUVERT. Un panneau replie ne laisse rien sur le bord de la fenetre : on le
// rouvre depuis le groupe d'icones de la barre d'outils (PanelToggles) ou au
// clavier.

const MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const MOD = MAC ? 'Cmd' : 'Ctrl'
const ALT = MAC ? 'Option' : 'Alt'
export const SHORTCUT_LEFT = `${MOD}+${ALT}+1`
export const SHORTCUT_INSPECTOR = `${MOD}+${ALT}+2`
export const SHORTCUT_CLAUDE = `${MOD}+J`

const svg = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const ICON_LEFT = (
  <svg {...svg} aria-hidden="true">
    <rect x="2.5" y="3" width="13" height="12" rx="2" />
    <path d="M7 3v12" />
  </svg>
)
export const ICON_INSPECTOR = (
  <svg {...svg} aria-hidden="true">
    <rect x="2.5" y="3" width="13" height="12" rx="2" />
    <path d="M11 3v12" />
  </svg>
)
export const ICON_CLAUDE = (
  <svg {...svg} aria-hidden="true">
    <path d="M9 2.5v13M2.5 9h13M4.4 4.4l9.2 9.2M13.6 4.4l-9.2 9.2" />
  </svg>
)

// Bouton de repli dans l'en-tete d'un panneau.
export function CollapseButton({ label, shortcut, onClick, direction }: { label: string; shortcut: string; onClick: () => void; direction: 'left' | 'right' }) {
  return (
    <button type="button" className="panel-collapse" aria-label={label} title={`${label} (${shortcut})`} onClick={onClick}>
      <svg {...svg} width={14} height={14} aria-hidden="true">
        <path d={direction === 'left' ? 'M11 4L6 9l5 5' : 'M7 4l5 5-5 5'} />
      </svg>
    </button>
  )
}
