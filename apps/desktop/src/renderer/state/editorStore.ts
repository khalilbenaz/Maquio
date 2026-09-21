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
  // Chemin du fichier .calque courant, null tant que le document n'a
  // jamais ete enregistre (defaut n3, ruling sur le stockage des images) :
  // NodeView (canvas) en a besoin pour resoudre le src RELATIF d'un noeud
  // image (relatif a `<nom-du-document>.ressources/`, voir
  // canvas/imageSource.ts) sans avoir a faire remonter cette information
  // depuis App.tsx a travers Canvas -> NodeView. Auparavant un etat local
  // de App.tsx (Editeur) : deplace ici pour que NodeView, qui n'a pas de
  // lien de parente direct avec App.tsx, puisse le lire par simple
  // souscription au magasin, comme il lit deja `dragPreview`. `load()` ne
  // le touche PAS (contrairement a selection/tool/zoom/pan) : c'est
  // Editeur qui l'ecrit explicitement (nouveau -> null, ouvrir ->
  // chemin du fichier lu, enregistrer -> chemin ecrit), exactement comme
  // le faisait son ancien useState local.
  documentPath: string | null
  // Jeton incremente par requestFitToWindow (finition v1) : le seul signal
  // qui doit recalculer l'ajustement du plan de travail EN DEHORS de
  // l'ouverture d'un document (voir Canvas.tsx, qui observe deja pageId et
  // les dimensions de l'appareil pour ce cas-la). Un redimensionnement de
  // fenetre, lui, ne doit plus jamais ecraser un zoom choisi a la main --
  // c'est le defaut signale : l'ajustement se recalculait a CHAQUE
  // redimensionnement, donc un zoom manuel etait perdu au premier
  // redimensionnement suivant. Le bouton "Ajuster a la fenetre" de la barre
  // d'outils reste le seul moyen de le redeclencher a la demande.
  fitToWindowToken: number

  load(doc: CalqueDocument): void
  select(ids: string[]): void
  execute(cmd: Command): void
  undo(): void
  redo(): void
  setTool(tool: Tool): void
  setZoom(zoom: number): void
  setPan(pan: { x: number; y: number }): void
  setDragPreview(preview: DragPreview): void
  requestFitToWindow(): void
  setDocumentPath(path: string | null): void
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
    documentPath: null,
    fitToWindowToken: 0,

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

    requestFitToWindow() {
      set((s) => ({ fitToWindowToken: s.fitToWindowToken + 1 }))
    },

    setDocumentPath(path) {
      set({ documentPath: path })
    },
  }
})
