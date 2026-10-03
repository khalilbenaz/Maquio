// Insertion d'un element de palette dans le document : un seul chemin, que
// l'element soit depose sur le canevas ou ajoute par un clic dans la palette.
// Une seule commande (donc un seul « annuler »), suivie de la selection du
// nouveau noeud.
import { absoluteFrame, createNodeCommand, findNode } from '@calque/core'
import type { PaletteItem } from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { placePaletteItem } from './dropPlacement'
import { pageNodesOf } from './useDragInteraction'

// Type MIME porte par le glisser-deposer : permet au canevas de distinguer un
// element de palette de tout autre depot (fichier, texte).
export const PALETTE_MIME = 'application/x-calque-palette'

// Insere `item` au point de PAGE donne ; rend l'identifiant du noeud cree.
export function insertPaletteItemAt(item: PaletteItem, point: { x: number; y: number }): string {
  const state = useEditorStore.getState()
  const nodes = pageNodesOf(state.document, state.pageId)
  const { parentId, frame } = placePaletteItem(item, point, nodes)
  const node = item.build(frame)
  state.execute(createNodeCommand(state.pageId, parentId, node))
  state.select([node.id])
  state.setTool('select')
  return node.id
}

// Ajout par clic : au centre de l'ecran actif (ou du premier ecran, ou de
// la page quand elle n'en a pas).
export function insertPaletteItemInActiveScreen(item: PaletteItem): string {
  const state = useEditorStore.getState()
  const nodes = pageNodesOf(state.document, state.pageId)
  const active = state.activeScreenId !== null ? findNode(nodes, state.activeScreenId) : null
  const screen = active ?? nodes.find((n) => n.type === 'frame' && n.device !== undefined) ?? null
  if (screen === null) {
    const device = state.document.pages.find((p) => p.id === state.pageId)?.device
    return insertPaletteItemAt(item, { x: (device?.width ?? 0) / 2, y: (device?.height ?? 0) / 2 })
  }
  const abs = absoluteFrame(nodes, screen.id)
  return insertPaletteItemAt(item, { x: abs.x + abs.w / 2, y: abs.y + abs.h / 2 })
}
