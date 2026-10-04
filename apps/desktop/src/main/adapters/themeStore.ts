// Preference de theme, memorisee dans un petit fichier JSON du profil
// utilisateur (le main doit la connaitre AVANT de creer la fenetre : fond de
// fenetre et nativeTheme). Lecture tolerante : fichier absent, illisible ou
// valeur inconnue -> « systeme ».
import { isThemePreference } from '../../shared/theme'
import type { ThemePreference } from '../../shared/theme'

export type ThemeStore = {
  get(): Promise<ThemePreference>
  set(preference: ThemePreference): Promise<void>
}

export function createThemeStore(opts: {
  filePath: string
  fs: { readFile: (path: string) => Promise<string>; writeFile: (path: string, data: string) => Promise<void> }
}): ThemeStore {
  return {
    async get() {
      try {
        const parsed = JSON.parse(await opts.fs.readFile(opts.filePath)) as { theme?: unknown }
        return isThemePreference(parsed.theme) ? parsed.theme : 'system'
      } catch {
        return 'system'
      }
    },
    async set(preference) {
      if (!isThemePreference(preference)) throw new Error('Thème inconnu')
      await opts.fs.writeFile(opts.filePath, JSON.stringify({ theme: preference }))
    },
  }
}
