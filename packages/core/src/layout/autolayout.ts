// Mise en page automatique des frames en mode `row` / `column` (Tache 6).
//
// Fonctions pures et recursives : aucune mutation, et partage structurel —
// une branche dont aucune position ne change est renvoyee par reference
// identique, jamais reconstruite. C'est ce qui permettra a la tache 15
// (canvas React) d'eviter des rendus inutiles.
//
// Choix assume (decision 8) : la mise en page ne modifie jamais la taille
// (w/h) de la frame elle-meme, seulement la position (et, pour `stretch`,
// la taille sur l'axe transverse) de ses enfants. Pas de "hug contents" en
// v1 : la taille des frames reste un choix explicite de l'utilisateur.

import type { FrameNode, Node, Page, Rect } from '../model/types'

function isFrame(node: Node): node is FrameNode {
  return node.type === 'frame'
}

// Calcule les nouvelles positions (et, pour `stretch`, la taille sur l'axe
// transverse) des enfants d'une frame en `row` ou `column`. `children` doit
// deja avoir ete mis en page en profondeur (ordre "enfants d'abord").
function layoutRowOrColumn(frame: FrameNode, children: Node[]): { children: Node[]; changed: boolean } {
  const isRow = frame.layout.mode === 'row'
  const { gap, padding, alignMain, alignCross } = frame.layout

  const mainPadStart = isRow ? padding.left : padding.top
  const mainPadEnd = isRow ? padding.right : padding.bottom
  const crossPadStart = isRow ? padding.top : padding.left
  const crossPadEnd = isRow ? padding.bottom : padding.right
  const frameMainSize = isRow ? frame.frame.w : frame.frame.h
  const frameCrossSize = isRow ? frame.frame.h : frame.frame.w

  const mainSizeOf = (n: Node): number => (isRow ? n.frame.w : n.frame.h)
  const crossSizeOf = (n: Node): number => (isRow ? n.frame.h : n.frame.w)

  const count = children.length
  const totalChildrenMain = children.reduce((sum, c) => sum + mainSizeOf(c), 0)
  const totalWithGap = totalChildrenMain + gap * Math.max(count - 1, 0)
  const availableCross = frameCrossSize - crossPadStart - crossPadEnd

  // Position de depart sur l'axe principal et espacement entre enfants.
  // Cas limite (decision 4) : `space-between` avec un seul enfant se
  // comporte comme `start` (pas de centrage, pas d'etirement de l'espace).
  let startMain: number
  let spacing = gap
  if (alignMain === 'space-between' && count > 1) {
    const available = frameMainSize - mainPadStart - mainPadEnd - totalChildrenMain
    // Jamais negatif : si le contenu deborde deja, les enfants se
    // chevauchent en debordant vers la droite plutot que de reculer.
    spacing = Math.max(available / (count - 1), 0)
    startMain = mainPadStart
  } else if (alignMain === 'end') {
    startMain = frameMainSize - mainPadEnd - totalWithGap
  } else if (alignMain === 'center') {
    startMain = mainPadStart + (frameMainSize - mainPadStart - mainPadEnd - totalWithGap) / 2
  } else {
    startMain = mainPadStart
  }

  let cursor = startMain
  let changed = false
  const positioned = children.map((c) => {
    const mainPos = cursor
    cursor += mainSizeOf(c) + spacing

    let crossPos: number
    let crossSize = crossSizeOf(c)
    if (alignCross === 'stretch') {
      // Cas limite (decision 4) : jamais negatif, le schema interdit une
      // dimension < 0.
      crossSize = Math.max(availableCross, 0)
      crossPos = crossPadStart
    } else if (alignCross === 'end') {
      crossPos = frameCrossSize - crossPadEnd - crossSizeOf(c)
    } else if (alignCross === 'center') {
      crossPos = crossPadStart + (availableCross - crossSizeOf(c)) / 2
    } else {
      crossPos = crossPadStart
    }

    const newFrame: Rect = isRow
      ? { x: mainPos, y: crossPos, w: c.frame.w, h: crossSize }
      : { x: crossPos, y: mainPos, w: crossSize, h: c.frame.h }

    if (
      newFrame.x === c.frame.x &&
      newFrame.y === c.frame.y &&
      newFrame.w === c.frame.w &&
      newFrame.h === c.frame.h
    ) {
      return c
    }
    changed = true
    return { ...c, frame: newFrame }
  })

  return { children: positioned, changed }
}

// Met en page recursivement les enfants d'une frame selon `layout`.
//
// L'ordre de calcul est "enfants d'abord" : chaque enfant qui est lui-meme
// une frame est mis en page (donc connait sa taille et la position finale
// de SES propres enfants) avant que la frame courante ne se serve de sa
// taille pour le positionner.
//
// En mode `absolute`, la frame ne repositionne pas ses propres enfants,
// mais descend quand meme dans les enfants qui sont des frames en
// `row`/`column` : eux doivent etre mis en page normalement.
export function applyAutoLayout(frame: FrameNode): FrameNode {
  let descendantsChanged = false
  const descendantsProcessed = frame.children.map((c) => {
    if (!isFrame(c)) return c
    const laidOut = applyAutoLayout(c)
    if (laidOut !== c) descendantsChanged = true
    return laidOut
  })

  if (frame.layout.mode === 'absolute') {
    return descendantsChanged ? { ...frame, children: descendantsProcessed } : frame
  }

  // Frame sans enfant : rendue telle quelle, meme reference (decision 4).
  if (descendantsProcessed.length === 0) return frame

  const { children: positioned, changed: positionsChanged } = layoutRowOrColumn(frame, descendantsProcessed)

  if (!descendantsChanged && !positionsChanged) return frame
  return { ...frame, children: positioned }
}

// Applique applyAutoLayout a chaque noeud de premier niveau qui est une
// frame ; les autres noeuds sont laisses intacts. Meme logique de partage
// structurel que applyAutoLayout.
export function layoutPage(page: Page): Page {
  let changed = false
  const nodes = page.nodes.map((n) => {
    if (!isFrame(n)) return n
    const laidOut = applyAutoLayout(n)
    if (laidOut !== n) changed = true
    return laidOut
  })
  return changed ? { ...page, nodes } : page
}
