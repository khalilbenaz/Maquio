// Petits accesseurs partages par les quatre exportateurs (Flutter,
// React Native, SwiftUI, Compose) : la meme regle de "premier
// remplissage plein" / "premiere bordure" / "URL distante contre chemin
// relatif" doit s'appliquer identiquement aux quatre cibles pour un meme
// document — copier ces trois lignes dans chaque generateur est
// precisement le genre de derive que ce fichier existe pour empecher
// (round de correction 1, Important 1 du coordinateur).
import type { Color, Fill, FrameNode, Page, Stroke } from '@calque/core'

// Premiere couleur de remplissage plein d'une liste de Fill (ignore les
// fills `type: 'none'`) : null si aucun remplissage plein n'est present.
export function firstSolidFillColor(fills: Fill[]): Color | null {
  const found = fills.find((f) => f.type === 'solid')
  return found && found.type === 'solid' ? found.color : null
}

// Premiere bordure d'une liste de Stroke (le modele n'en garde qu'une a
// l'usage aujourd'hui, mais le type autorise plusieurs entrees) : null si
// la liste est vide.
export function firstStroke(strokes: Stroke[]): Stroke | null {
  return strokes[0] ?? null
}

// Une source d'image est une URL distante (http/https) plutot qu'un
// chemin de ressource locale (relatif ou nom d'asset).
export function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//.test(src)
}

// Ecart connu fermé (voir le README, section « Écarts connus ») : un
// noeud image dont `src` est vide (systématique pour tout espace réservé
// `image` importé de Figma, ou tracé dans l'éditeur avant tout choix de
// fichier) ne doit plus jamais produire `Image.asset('')`, `require('')`
// ou `Image("")` EN SILENCE — chaque generateur doit avertir et n'émettre
// AUCUNE référence à la ressource vide pour ce noeud. Message partagé par
// les quatre exportateurs, au même titre que unsupportedNodeWarning /
// unsupportedPropertyWarning : seul l'id de l'exportateur et celui du
// noeud changent.
export function emptyImageSourceWarning(nodeId: string, exporterId: string): string {
  return `image ignoree (src vide) par l export ${exporterId} : aucun fichier n'a ete choisi pour ce noeud (noeud ${nodeId})`
}

// v2 (addendum navigation, §3.1 et §7) : une page peut desormais contenir
// plusieurs ECRANS (frames de premier niveau + `device`). Le cablage de la
// navigation elle-meme (§6/§7 de l'addendum -- mode Parcours, routes
// Flutter/React Native) reste HORS PERIMETRE de cette tache : elle fait
// l'objet d'une seconde tache. En attendant, les quatre generateurs ne
// doivent surtout pas produire de code INCORRECT pour un document a
// plusieurs ecrans -- ce que ferait le comportement v1 (empiler tous les
// ecrans dans un seul Stack, a leurs positions absolues sur le plan de
// travail, superposes les uns sur les autres). Chaque generateur exporte
// donc uniquement l'ECRAN ACTIF (opts.activeScreenId, ou le premier ecran
// de la page a defaut) et avertit, sans rien exporter, pour chacun des
// autres -- rien n'est jamais perdu en silence (meme principe que
// ImportReport.warnings cote import Figma).
//
// Une page qui ne contient AUCUN ecran (document v1 non migre, ou page de
// mise en page libre construite a la main) est rendue TELLE QUELLE --
// comportement inchange depuis la v1 : c'est ce qui garde les fichiers
// temoins (golden files) existants, tous construits sur ce format, valides
// sans aucune modification.
export function selectActiveScreen(
  page: Page,
  activeScreenId: string | undefined,
  exporterId: string,
): { page: Page; warnings: string[] } {
  const screens = page.nodes.filter((n): n is FrameNode => n.type === 'frame' && n.device !== undefined)
  if (screens.length === 0) return { page, warnings: [] }

  const active = screens.find((s) => s.id === activeScreenId) ?? screens[0]!
  const others = screens.filter((s) => s.id !== active.id)
  const warnings = others.map(
    (s) =>
      `écran "${s.name}" non exporté par ${exporterId} : la navigation entre écrans n'est pas encore prise en charge par cet exportateur`,
  )

  // L'ecran reste la RACINE du rendu (et non la liste de ses enfants) : c'est
  // lui qui porte la taille de l'appareil, le fond et la mise en page, donc
  // la position absolue de chaque enfant. Rendre seulement les enfants les
  // empilait tous en haut a gauche, sans taille d'ecran ni fond.
  return { page: { ...page, name: active.name, nodes: [{ ...active, frame: { ...active.frame, x: 0, y: 0 } }] }, warnings }
}
