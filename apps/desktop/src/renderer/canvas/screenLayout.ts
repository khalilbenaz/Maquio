// Placement des ecrans sur le plan de travail (v2, addendum navigation §4).
// Fonction pure, testee directement sans rendu, dans le meme esprit que
// screenToPage/snapThreshold de useDragInteraction.ts.
import type { FrameNode } from '@maquio/core'

// Gouttiere fixe entre deux ecrans (§4 : « un bouton "Nouvel écran" [...]
// le place à droite du dernier, gouttière fixe »). Unite : points de page
// (les memes que frame.x/y/w/h), pas des pixels ecran -- reste constante
// quel que soit le zoom courant.
export const SCREEN_GUTTER = 120

// La position (x, y) du PROCHAIN ecran a creer : a droite de l'ecran le
// plus a droite parmi ceux qui existent deja (son bord droit + la
// gouttiere), aligne sur son bord superieur. « Le dernier » se lit donc
// comme « le plus a droite », pas « le dernier de l'ordre du tableau » --
// un ecran a pu etre deplace depuis sa creation. Origine (0,0) s'il
// n'existe encore aucun ecran sur la page.
export function nextScreenPosition(screens: FrameNode[]): { x: number; y: number } {
  if (screens.length === 0) return { x: 0, y: 0 }
  const rightmost = screens.reduce((best, s) => (s.frame.x + s.frame.w > best.frame.x + best.frame.w ? s : best))
  return { x: rightmost.frame.x + rightmost.frame.w + SCREEN_GUTTER, y: rightmost.frame.y }
}
