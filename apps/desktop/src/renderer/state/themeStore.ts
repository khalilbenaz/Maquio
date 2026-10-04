// Preference de theme cote renderer : miroir de ce que le main memorise.
// Le chrome suit `prefers-color-scheme` (pilote par nativeTheme) : ce magasin
// ne sert qu'a afficher / changer le choix (Reglages, menu Affichage).
import { create } from 'zustand'
import type { ThemePreference } from '../../shared/theme'

export type ThemeState = {
  preference: ThemePreference
  setPreference(p: ThemePreference): void
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  setPreference: (preference) => set({ preference }),
}))
