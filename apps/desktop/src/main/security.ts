// Durcissement de la navigation (audit P1) : la fenetre ne doit jamais
// afficher autre chose que l'application, ni en ouvrir de nouvelle. Un lien
// ou un window.open venant d'un contenu hostile (texte importe de Figma,
// document tiers) serait sinon charge dans un renderer qui dispose du pont
// `window.maquio` (lecture/ecriture de fichiers, sous-processus claude).
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

// Controle de l'appelant IPC (audit P2) : un canal ne repond qu'a la FENETRE
// de l'application -- cadre principal, charge depuis l'origine autorisee --
// jamais a un sous-cadre, ni a une page quelconque qui aurait reussi a
// charger le pont.
export type IpcSender = { senderFrame?: { url: string } | null; sender?: { mainFrame?: unknown } }

export function isTrustedSender(event: { senderFrame?: unknown; sender?: { mainFrame?: unknown } }, devServerUrl: string | null): boolean {
  const frame = event.senderFrame as { url: string } | null | undefined
  if (frame === null || frame === undefined || typeof frame.url !== 'string') return false
  if (event.sender?.mainFrame !== undefined && event.sender.mainFrame !== frame) return false
  return isAllowedNavigation(frame.url, devServerUrl)
}

export class UntrustedSenderError extends Error {
  constructor(channel: string) {
    super(`Appel refusé sur le canal « ${channel} » : origine non autorisée`)
    this.name = 'UntrustedSenderError'
  }
}
