// Client REST de l'API Figma (Tache 11).
//
// Ce client ne fait qu'une chose : recuperer un fichier Figma brut
// (GET /v1/files/:key) et le rendre typiquement comme `FigmaFileResponse`.
// Il ne traduit pas (voir translate.ts), ne met rien en cache et ne
// reessaie jamais une requete echouee : cette composition appartient a
// l'application de bureau (Tache 17), qui sait aussi ou stocker le jeton
// (trousseau du systeme). Le client, lui, ne lit aucune variable
// d'environnement et n'ecrit jamais rien sur disque : le jeton lui est
// toujours passe explicitement au constructeur.
//
// `fetch` est injecte plutot qu'importe (jamais `node:https`, jamais le
// `fetch` global) : c'est ce qui rend ce fichier testable sans reseau, et
// ce qui garde la frontiere avec le reste de l'application lisible.
//
// Attention au jeton : il ne doit jamais apparaitre dans un message
// d'erreur, une propriete d'erreur ou une trace de pile, quel que soit le
// code de statut renvoye par Figma ou l'echec du `fetch` injecte
// lui-meme. Les messages ci-dessous sont donc construits sans jamais
// interpoler `token`, et les erreurs d'origine (corps de reponse, erreur
// de fetch) ne sont jamais reattachees telles quelles a l'erreur rendue.

import type { FigmaFileResponse } from './figma-types'

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

// 401 : jeton absent ou malforme. 403 : jeton valide mais refuse (acces au
// fichier interdit, ou jeton revoque). Les deux sont un probleme de
// jeton du point de vue de l'utilisateur, d'ou une seule erreur nommee.
export class FigmaAuthError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Jeton refuse par Figma, verifiez-le dans les reglages')
    this.name = 'FigmaAuthError'
    this.status = status
  }
}

export class FigmaNotFoundError extends Error {
  readonly status: number

  constructor(status: number) {
    super("Fichier Figma introuvable, verifiez le lien ou la cle du fichier")
    this.name = 'FigmaNotFoundError'
    this.status = status
  }
}

// Tout autre statut non `ok` (429, 500, ...). Message generique car la
// cause reelle (quota, panne cote Figma) n'est pas actionnable par
// l'utilisateur au-dela de "reessayer plus tard".
export class FigmaHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Figma a renvoye une erreur (statut ${status}), reessayez plus tard`)
    this.name = 'FigmaHttpError'
    this.status = status
  }
}

// Reponse `ok: true` mais dont le corps JSON n'a pas la forme minimale
// attendue (pas de `document`, ou `document` qui n'est pas un objet). Ne
// revalide pas tout le fichier Figma : le traducteur et sanitize.ts s'en
// chargent deja. Sert seulement a ne jamais rendre une valeur qui ferait
// planter le traducteur plus loin, avec un message clair a la place. Le
// `status` est attache (toujours 2xx ici) car il est disponible et peut
// interesser l'appelant (journalisation, telemetrie).
export class FigmaResponseError extends Error {
  readonly status: number

  constructor(status: number) {
    super('Reponse Figma inattendue : le fichier recu est incomplet ou malforme')
    this.name = 'FigmaResponseError'
    this.status = status
  }
}

// Echec du `fetch` injecte lui-meme (pas de reseau, DNS qui ne repond
// pas, ...), distinct d'une reponse HTTP d'erreur. L'erreur d'origine
// n'est jamais attachee (ni en `cause`, ni en propriete) : elle peut
// contenir l'URL complete, et potentiellement le jeton si un jour
// l'implementation change. Pas de `status` ici, contrairement aux autres
// erreurs de ce fichier : par definition aucune reponse HTTP n'a ete
// recue, il n'y a donc rien a porter (choix delibere, pas un oubli).
export class FigmaNetworkError extends Error {
  constructor() {
    super('Impossible de contacter Figma, verifiez votre connexion reseau')
    this.name = 'FigmaNetworkError'
  }
}

// Un segment de chemin `/design/<cle>/...` ou `/file/<cle>/...` : au moins
// un caractere non-slash suivi optionnellement d'un slash et d'un reste
// de chemin/requete quelconque. `http` et `https` sont acceptes tous les
// deux : une vieille URL collee en `http://` est une intention d'import
// tout aussi claire.
const FIGMA_URL_PATTERN = /^https?:\/\/(?:www\.)?figma\.com\/(?:design|file)\/([^/?]+)(?:\/.*)?$/

// Accepte une cle nue ou une URL Figma (`/design/<cle>/...` ou
// `/file/<cle>/...`, en http ou https, avec ou sans parametres de
// requete) et rend la cle seule. Elague les espaces superflus (un
// utilisateur colle souvent avec un espace de trop) et leve si l'entree
// est vide. Toute chaine qui ressemble a une URL (contient "://") et
// dont la cle ne peut pas en etre extraite leve egalement : elle ne doit
// jamais ressortir intacte comme si c'etait une cle valide.
export function parseFigmaFileKey(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '') {
    throw new Error('Cle ou lien Figma vide')
  }

  if (trimmed.includes('://')) {
    const match = FIGMA_URL_PATTERN.exec(trimmed)
    if (!match?.[1]) {
      throw new Error("Lien Figma invalide : impossible d'en extraire la cle du fichier")
    }
    return match[1]
  }

  return trimmed
}

export class FigmaClient {
  private readonly token: string
  private readonly fetch: FetchLike

  constructor(opts: { token: string; fetch: FetchLike }) {
    this.token = opts.token
    this.fetch = opts.fetch
  }

  async getFile(key: string): Promise<FigmaFileResponse> {
    let response: Awaited<ReturnType<FetchLike>>
    try {
      // La cle est encodee avant d'etre inseree dans l'URL : sans cela,
      // une cle non validee en amont contenant '/', '?', '#' ou une
      // sequence '../' changerait reellement la requete envoyee (avec
      // le jeton attache), au lieu d'etre traitee comme une simple
      // valeur d'identifiant.
      response = await this.fetch(`https://api.figma.com/v1/files/${encodeURIComponent(key)}`, {
        headers: { 'X-Figma-Token': this.token },
      })
    } catch {
      // L'erreur d'origine n'est jamais propagee (ni message, ni cause) :
      // elle pourrait contenir l'URL ou, selon l'implementation de
      // `fetch` fournie par l'appelant, le jeton lui-meme.
      throw new FigmaNetworkError()
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new FigmaAuthError(response.status)
      }
      if (response.status === 404) {
        throw new FigmaNotFoundError(response.status)
      }
      throw new FigmaHttpError(response.status)
    }

    const body = await response.json()
    if (!isFigmaFileResponse(body)) {
      throw new FigmaResponseError(response.status)
    }

    return body
  }
}

function isFigmaFileResponse(body: unknown): body is FigmaFileResponse {
  if (typeof body !== 'object' || body === null) {
    return false
  }
  const document = (body as Record<string, unknown>).document
  return typeof document === 'object' && document !== null
}
