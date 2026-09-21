// Fonctions pures du cadrage du canevas (refonte visuelle). Separees de
// Canvas.tsx pour rester testables sans rendu, dans le meme esprit que
// screenToPage/snapThreshold de useDragInteraction.ts.
//
// Avant cette refonte, le plan de travail s'affichait a 100 % de zoom au
// point (0, 0) du monde, quelle que soit la taille de la fenetre : sur un
// appareil de 852 px de haut, une partie du plan de travail sortait
// systematiquement de la zone visible, et rien ne le distinguait du fond.
// computeFitTransform calcule desormais le zoom et le decalage qui
// centrent le plan de travail et le font tenir entierement dans le
// conteneur, avec une marge de respiration et une reserve pour l'etiquette
// affichee au-dessus (voir Canvas.tsx).

const PADDING = 48
const LABEL_RESERVE = 32
const ZOOM_MIN = 0.1
const ZOOM_MAX = 8

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

// v2 (addendum navigation §4 : « l'ajustement à la fenêtre cadre tous les
// écrans »). Generalisation de computeFitTransform (ci-dessous, qui delegue
// desormais ici) a un cadre englobant QUELCONQUE (`bounds`, en coordonnees
// de monde -- pas necessairement a l'origine, ce qui differe d'un simple
// `device` toujours suppose en (0,0)) : le meme calcul zoom/centrage
// s'applique, mais le panoramique doit en plus COMPENSER le decalage de
// `bounds.x`/`bounds.y` par rapport a l'origine du monde, sans quoi un
// cadre englobant qui ne commence pas en (0,0) (ex. l'union de plusieurs
// ecrans poses cote a cote) serait cadre par rapport au mauvais point.
//
// Rend le zoom/pan INCHANGES (valeur neutre 1 / {0,0}) si le conteneur ou
// le cadre n'a pas de taille exploitable -- meme raison que
// computeFitTransform (jsdom, tests sans mise en page reelle).
export function computeFitTransformToBounds(
  container: { width: number; height: number },
  bounds: { x: number; y: number; w: number; h: number },
): { zoom: number; pan: { x: number; y: number } } {
  if (container.width <= 0 || container.height <= 0 || bounds.w <= 0 || bounds.h <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  const availableWidth = Math.max(1, container.width - PADDING * 2)
  const availableHeight = Math.max(1, container.height - PADDING * 2 - LABEL_RESERVE)

  const zoom = clampZoom(Math.min(availableWidth / bounds.w, availableHeight / bounds.h, 1))

  const boundsScreenWidth = bounds.w * zoom
  const boundsScreenHeight = bounds.h * zoom

  const pan = {
    x: (container.width - boundsScreenWidth) / 2 - bounds.x * zoom,
    y: (container.height - boundsScreenHeight) / 2 + LABEL_RESERVE / 2 - bounds.y * zoom,
  }

  return { zoom, pan }
}

// Calcule le zoom et le panoramique qui centrent un appareil de
// `device.width` x `device.height` (coordonnees de monde, origine (0,0) en
// haut-gauche de l'appareil) dans un conteneur de `container.width` x
// `container.height` (coordonnees ecran), avec `PADDING` de marge sur
// chaque bord et `LABEL_RESERVE` de reserve verticale pour l'etiquette.
// Ne grossit jamais au-dela de 100 % (un petit appareil dans une grande
// fenetre reste a sa taille naturelle plutot que d'etre demesurement
// agrandi) : seul le retrecissement est automatique.
//
// Cas particulier de computeFitTransformToBounds ci-dessus (un appareil
// suppose toujours en (0,0)) : conserve pour la compatibilite de l'appel
// existant (page sans ecran, voir Canvas.tsx) et pour canvasViewport.test.ts,
// qui le teste directement.
export function computeFitTransform(
  container: { width: number; height: number },
  device: { width: number; height: number },
): { zoom: number; pan: { x: number; y: number } } {
  return computeFitTransformToBounds(container, { x: 0, y: 0, w: device.width, h: device.height })
}

// Zoom a la molette (Ctrl/Cmd), centre sur le curseur : le point du monde
// actuellement sous le curseur reste sous le curseur apres le changement de
// zoom, au lieu de deriver depuis le coin (0,0) comme le ferait un zoom
// centre sur l'origine.
export function computeWheelZoom(
  currentZoom: number,
  currentPan: { x: number; y: number },
  cursor: { x: number; y: number },
  deltaY: number,
): { zoom: number; pan: { x: number; y: number } } {
  // deltaY > 0 (molette vers le bas / pincement vers soi) diminue le zoom.
  const factor = Math.exp(-deltaY * 0.01)
  const zoom = clampZoom(currentZoom * factor)
  const ratio = zoom / currentZoom

  const pan = {
    x: cursor.x - (cursor.x - currentPan.x) * ratio,
    y: cursor.y - (cursor.y - currentPan.y) * ratio,
  }

  return { zoom, pan }
}
