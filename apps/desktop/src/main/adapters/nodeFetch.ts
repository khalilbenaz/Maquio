// Adaptateur reel de requete HTTP (Tache 17, decision 2 du brief) :
// enveloppe le `fetch` global de Node dans FetchLike (@maquio/figma), pour
// que FigmaClient puisse reellement contacter l'API Figma sans jamais
// importer `fetch` (ni node:https) lui-meme (voir packages/figma/src/client.ts).
import type { FetchLike } from '@maquio/figma'

export const nodeFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init)
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
    text: () => response.text(),
  }
}
