// Adresse de l'API Figma. Par defaut l'API publique ; la variable
// MAQUIO_FIGMA_API_BASE permet de la remplacer par un serveur LOCAL (tests de
// bout en bout), et SEULEMENT local : le jeton est envoye a cette adresse, un
// hote distant le ferait fuiter.
export const FIGMA_API_DEFAULT = 'https://api.figma.com'

export function figmaApiBase(env: Record<string, string | undefined>): string {
  const raw = env['MAQUIO_FIGMA_API_BASE']
  if (raw === undefined || raw === '') return FIGMA_API_DEFAULT
  try {
    const url = new URL(raw)
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
    if ((url.protocol === 'http:' || url.protocol === 'https:') && local) return url.origin
  } catch {
    // adresse invalide : retombe sur l'API publique
  }
  return FIGMA_API_DEFAULT
}
