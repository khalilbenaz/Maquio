// Preference de theme de l'editeur : suivre le systeme (defaut), clair ou
// sombre. Sans aucune dependance (main ET renderer).
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const THEME_LABELS: Record<ThemePreference, string> = { system: 'Système', light: 'Clair', dark: 'Sombre' }

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === 'string' && (THEME_PREFERENCES as readonly string[]).includes(v)
}

// Fond de la fenetre au lancement, aligne sur les jetons de theme.css
// (--maquio-chrome-bg) : pas de flash blanc ni noir avant le premier rendu.
export const WINDOW_BACKGROUND = { dark: '#16131F', light: '#F4EFE6' } as const

export function windowBackground(systemIsDark: boolean, preference: ThemePreference): string {
  const dark = preference === 'system' ? systemIsDark : preference === 'dark'
  return dark ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light
}
