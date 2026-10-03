// Durcissement de la navigation (audit P1) : la fenetre ne doit jamais
// afficher autre chose que l'application, ni en ouvrir de nouvelle. Un lien
// ou un window.open venant d'un contenu hostile (texte importe de Figma,
// document tiers) serait sinon charge dans un renderer qui dispose du pont
// `window.calque` (lecture/ecriture de fichiers, sous-processus claude).
import type { WebContents } from 'electron'

export function isAllowedNavigation(url: string, devServerUrl: string | null): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (devServerUrl !== null && parsed.origin === new URL(devServerUrl).origin) return true
  return parsed.protocol === 'file:' && parsed.pathname.endsWith('/renderer/index.html')
}

export function installNavigationGuards(contents: WebContents, devServerUrl: string | null): void {
  // Aucune nouvelle fenetre, quelle que soit l'URL.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devServerUrl)) event.preventDefault()
  })
}
