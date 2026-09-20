// Magasin d'etat de l'editeur (Tache 15, decision 3). C'est le seul endroit
// du renderer qui detient un History : le canevas, la selection, l'outil
// courant et le zoom/pan y sont centralises pour que Canvas, NodeView,
// SelectionOverlay et useDragInteraction partagent un seul etat coherent.
//
// `document` est toujours DERIVE de `history.document` juste apres chaque
// action qui touche l'historique (load/execute/undo/redo) : il n'existe pas
// de deuxieme source de verite a tenir synchronisee a la main.
import { create } from 'zustand'
import { createDocument, History } from '@calque/core'
import type { CalqueDocument, Command, HandleId, Rect } from '@calque/core'

export type Tool = 'select' | 'frame' | 'rect' | 'ellipse' | 'text' | 'image'

// Etat ephemere d'un geste en cours (glissement de deplacement, de
// redimensionnement ou de creation). Il ne passe JAMAIS par History : seul
// le relachement du geste emet une commande (decision 4). C'est le "champ
// ephemere du magasin clairement nomme" evoque par le brief comme
// alternative a un etat local de composant -- choisi ici plutot qu'un etat
// local pour que NodeView (le noeud deplace) ET SelectionOverlay (les
// guides d'alignement) puissent tous les deux le lire pendant le geste.
export type DragPreview =
  | { kind: 'move'; nodeId: string; dx: number; dy: number; guides: { x: number[]; y: number[] } }
  | { kind: 'resize'; nodeId: string; handle: HandleId; frame: Rect }
  | { kind: 'create'; tool: Tool; frame: Rect }
  | null

export type EditorState = {
  history: History
  document: CalqueDocument
  pageId: string
  selection: string[]
  tool: Tool
  zoom: number
  pan: { x: number; y: number }
  dragPreview: DragPreview

  load(doc: CalqueDocument): void
  select(ids: string[]): void
  execute(cmd: Command): void
  undo(): void
  redo(): void
  setTool(tool: Tool): void
  setZoom(zoom: number): void
  setPan(pan: { x: number; y: number }): void
  setDragPreview(preview: DragPreview): void
}

function initialDocument(): CalqueDocument {
  return createDocument('Document sans titre')
}

export const useEditorStore = create<EditorState>((set, get) => {
  const doc = initialDocument()

  return {
    history: new History(doc),
    document: doc,
    pageId: doc.pages[0]!.id,
    selection: [],
    tool: 'select',
    zoom: 1,
    pan: { x: 0, y: 0 },
    dragPreview: null,

    load(nextDoc) {
      const history = new History(nextDoc)
      set({
        history,
        document: history.document,
        pageId: nextDoc.pages[0]!.id,
        selection: [],
        tool: 'select',
        zoom: 1,
        pan: { x: 0, y: 0 },
        dragPreview: null,
      })
    },

    select(ids) {
      set({ selection: ids })
    },

    execute(cmd) {
      const { history } = get()
      history.execute(cmd)
      set({ document: history.document })
    },

    undo() {
      const { history } = get()
      history.undo()
      set({ document: history.document })
    },

    redo() {
      const { history } = get()
      history.redo()
      set({ document: history.document })
    },

    setTool(tool) {
      set({ tool })
    },

    setZoom(zoom) {
      set({ zoom })
    },

    setPan(pan) {
      set({ pan })
    },

    setDragPreview(preview) {
      set({ dragPreview: preview })
    },
  }
})
