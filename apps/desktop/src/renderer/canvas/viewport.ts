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

// Calcule le zoom et le panoramique qui centrent un appareil de
// `device.width` x `device.height` (coordonnees de monde, origine (0,0) en
// haut-gauche de l'appareil) dans un conteneur de `container.width` x
// `container.height` (coordonnees ecran), avec `PADDING` de marge sur
// chaque bord et `LABEL_RESERVE` de reserve verticale pour l'etiquette.
// Ne grossit jamais au-dela de 100 % (un petit appareil dans une grande
// fenetre reste a sa taille naturelle plutot que d'etre demesurement
// agrandi) : seul le retrecissement est automatique.
//
// Rend le zoom/pan INCHANGES (valeur neutre 1 / {0,0}) si le conteneur ou
// l'appareil n'a pas de taille exploitable -- c'est le cas sous jsdom
// (aucune mise en page reelle, getBoundingClientRect() rend toujours des
// dimensions nulles), ce qui laisse les tests qui rendent <Canvas /> sans
// dimensions reelles se comporter comme avant cette refonte.
export function computeFitTransform(
  container: { width: number; height: number },
  device: { width: number; height: number },
): { zoom: number; pan: { x: number; y: number } } {
  if (container.width <= 0 || container.height <= 0 || device.width <= 0 || device.height <= 0) {
    return { zoom: 1, pan: { x: 0, y: 0 } }
  }

  const availableWidth = Math.max(1, container.width - PADDING * 2)
  const availableHeight = Math.max(1, container.height - PADDING * 2 - LABEL_RESERVE)

  const zoom = clampZoom(Math.min(availableWidth / device.width, availableHeight / device.height, 1))

  const deviceScreenWidth = device.width * zoom
  const deviceScreenHeight = device.height * zoom

  const pan = {
    x: (container.width - deviceScreenWidth) / 2,
    y: (container.height - deviceScreenHeight) / 2 + LABEL_RESERVE / 2,
  }

  return { zoom, pan }
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
