// Pictogrammes du jeu d'icones commun (voir ICON_NAMES dans @maquio/core),
// dessines en traits sur une grille 24x24. Ils servent UNIQUEMENT a
// l'affichage du canevas : l'export emet l'icone native de la cible
// (Icons.* Flutter, SF Symbol, Icons.Default.* Compose, MaterialIcons RN).
import type { IconName } from '@maquio/core'

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search: 'M10 16a6 6 0 100-12 6 6 0 000 12zM21 21l-6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  add: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 13l4 4L19 7',
  arrowBack: 'M19 12H5M12 5l-7 7 7 7',
  arrowForward: 'M5 12h14M12 5l7 7-7 7',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  favorite: 'M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  delete: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3',
  share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  moreVert: 'M12 6.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 13.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM12 20.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5',
  notifications: 'M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 21h4',
  email: 'M3 6h18v12H3zM3 7l9 7 9-7',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 018 0v3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  cart: 'M3 4h3l2.5 11h9L20 8H7M9 20.5a.5.5 0 100-1 .5.5 0 000 1zM17 20.5a.5.5 0 100-1 .5.5 0 000 1z',
  send: 'M21 3L3 11l7 3 3 7z',
  refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  location: 'M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  face: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3M9 9v1M15 9v1M12 9v4h-1M9 16c2 1.5 4 1.5 6 0',
  backspace: 'M21 5H9l-6 7 6 7h12zM16 10l-4 4M12 10l4 4',
  swap: 'M7 7h13l-3-3M17 17H4l3 3',
  moreHoriz: 'M5 12h.01M12 12h.01M19 12h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  vault: 'M5 4h14v16H5zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9V7M5 8H3M5 16H3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1a3 3 0 0 1 0 6h-1M8 3v3M12 3v3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  shieldCheck: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  snowflake: 'M12 2v20M4 6l16 12M20 6L4 18',
  sliders: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  plane: 'M2 16l20-7-9 13-2-6zM11 16l-3 5',
  bike: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 14l4-7h6l4 7M9 7l3 7',
  document: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18',
  contrast: 'M12 3a9 9 0 1 0 0 18V3z',
  smartphone: 'M7 3h10v18H7zM11 18h2',
  logout: 'M15 3h4v18h-4M10 17l-5-5 5-5M5 12h11',
  chevronLeft: 'M15 6l-6 6 6 6',
  upload: 'M12 3v13M7 8l5-5 5 5M5 14v6h14v-6',
}

export function IconGlyph({ name, size = 24, color = 'currentColor' }: { name: IconName; size?: number; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
