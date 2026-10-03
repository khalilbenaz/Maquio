// Magasin d'etat de l'editeur (Tache 15, decision 3). C'est le seul endroit
// du renderer qui detient un History : le canevas, la selection, l'outil
// courant et le zoom/pan y sont centralises pour que Canvas, NodeView,
// SelectionOverlay et useDragInteraction partagent un seul etat coherent.
//
// `document` est toujours DERIVE de `history.document` juste apres chaque
// action qui touche l'historique (load/execute/undo/redo) : il n'existe pas
// de deuxieme source de verite a tenir synchronisee a la main.
import { create } from 'zustand'
import { createDocument, History, screenContaining, withAutoLayout } from '@calque/core'
import type { CalqueDocument, Command, HandleId, Rect } from '@calque/core'

export type Tool = 'select' | 'frame' | 'rect' | 'ellipse' | 'text' | 'image'

// Etat ephemere d'un geste en cours (glissement de deplacement, de
// redimensionnement ou de creation). Il ne passe JAMAIS par History : seul
// le relachement du geste emet une commande (decision 4). C'est le "champ
// ephemere du magasin clairement nomme" evoque par le brief comme
// alternative a un etat local de composant -- choisi ici plutot qu'un etat
// local pour que NodeView (le noeud deplace) ET SelectionOverlay (les
// guides d'alignement) puissent tous les deux le lire pendant le geste.
// v2 (addendum navigation §5) : 'link' est le geste de la poignee de lien
// (SelectionOverlay) -- au meme titre que 'move'/'resize', il ne passe
// JAMAIS par History pendant le geste (seul le relachement, s'il retombe
// sur un ecran cible valide, emet une seule setLinkCommand). `point` est en
// coordonnees de PAGE (pas ecran) : c'est ce que useLinkInteraction calcule
// via screenToPage a chaque pointermove, et ce que SelectionOverlay affiche
// (ligne du noeud source jusqu'au curseur) sans avoir a refaire cette
// conversion elle-meme.
export type DragPreview =
  // Correctif parentage : `targetScreenId` est l'ecran a signaler par un
  // liseré (§3) pendant CE deplacement -- non null uniquement quand le
  // noeud deplace survole un ecran DIFFERENT de son ecran englobant actuel,
  // null tout le reste du temps (y compris pour un deplacement a l'interieur
  // du meme ecran, ou pour un ecran lui-meme, qui n'est jamais reparente).
  | {
      kind: 'move'
      nodeId: string
      // Deplacement de groupe : tous les noeuds a apercevoir deplaces.
      nodeIds?: string[]
      dx: number
      dy: number
      guides: { x: number[]; y: number[] }
      targetScreenId: string | null
    }
  | { kind: 'resize'; nodeId: string; handle: HandleId; frame: Rect }
  | { kind: 'create'; tool: Tool; frame: Rect }
  | { kind: 'link'; nodeId: string; point: { x: number; y: number } }
  // Selection par rectangle : cadre en coordonnees de PAGE.
  | { kind: 'marquee'; frame: Rect }
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
  // v2 (addendum navigation §4) : « l'écran actif est celui de la
  // sélection, ou le dernier touché ». Derive de la selection a chaque
  // select() (voir plus bas) quand elle touche un ecran ou un de ses
  // descendants ; une SELECTION VIDE (Echap, clic dans le vide) laisse
  // cette valeur INCHANGEE -- c'est precisement ce qui fait du dernier
  // ecran touche un souvenir qui survit a une deselection, pas seulement
  // un synonyme de "l'ecran de la selection courante". null tant qu'aucun
  // ecran n'a jamais ete touche (page sans ecran, document v1 non migre).
  activeScreenId: string | null
  // v2 (addendum navigation §4) : bascule d'affichage du calque de
  // connecteurs (liens existants), commandee par un bouton de la barre
  // d'outils. Ephemere comme zoom/pan (pas persiste dans le document ; une
  // simple preference d'affichage courante).
  linksVisible: boolean
  // Noeud dont le texte est en cours d'edition sur le canevas (double-clic).
  editingTextId: string | null

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
  setActiveScreenId(id: string | null): void
  toggleLinksVisible(): void
  setEditingTextId(id: string | null): void
}

// L'ecran (au sens screenContaining de @calque/core) du premier noeud d'une
// selection, ou l'ecran de premier niveau lui-meme s'il n'a pas de parent
// direct connu -- partage par select() et load() ci-dessous. Rend `null` si
// la selection est vide ou si le premier noeud selectionne n'appartient a
// aucun ecran (page sans ecran, ou noeud de premier niveau qui n'en est pas
// un).
function screenOfFirstSelected(doc: CalqueDocument, pageId: string, ids: string[]): string | null {
  const firstId = ids[0]
  if (firstId === undefined) return null
  const nodes = doc.pages.find((p) => p.id === pageId)?.nodes ?? []
  return screenContaining(nodes, firstId)
}

// Le premier ecran de la page, ou `null` si elle n'en contient aucun --
// utilise par load() pour initialiser activeScreenId a l'ouverture d'un
// document (avant toute selection ou tout geste).
function firstScreenOf(doc: CalqueDocument, pageId: string): string | null {
  const nodes = doc.pages.find((p) => p.id === pageId)?.nodes ?? []
  const first = nodes.find((n) => n.type === 'frame' && n.device !== undefined)
  return first ? first.id : null
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
    activeScreenId: firstScreenOf(doc, doc.pages[0]!.id),
    linksVisible: false,
    editingTextId: null,

    load(nextDoc) {
      const history = new History(nextDoc)
      const pageId = nextDoc.pages[0]!.id
      set({
        history,
        document: history.document,
        pageId,
        selection: [],
        tool: 'select',
        zoom: 1,
        pan: { x: 0, y: 0 },
        dragPreview: null,
        activeScreenId: firstScreenOf(nextDoc, pageId),
        editingTextId: null,
      })
    },

    select(ids) {
      set((s) => {
        // v2 (addendum navigation §4) : une selection vide (Echap, clic
        // dans le vide) NE TOUCHE PAS activeScreenId -- c'est ce qui rend
        // "le dernier ecran touche" persistant a travers une deselection.
        if (ids.length === 0) return { selection: ids }
        const screenId = screenOfFirstSelected(s.document, s.pageId, ids)
        return screenId === null ? { selection: ids } : { selection: ids, activeScreenId: screenId }
      })
    },

    execute(cmd) {
      const { history } = get()
      // v3 (composants mobiles) : toute commande est suivie, dans la MEME
      // entree d'historique, de la mise en page automatique -- le canevas
      // montre ainsi les positions que les exportateurs generent
      // (Row/Column/Grille), et un seul « annuler » defait les deux.
      history.execute(withAutoLayout(cmd))
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

    setActiveScreenId(id) {
      set({ activeScreenId: id })
    },

    setEditingTextId(id) {
      set({ editingTextId: id })
    },

    toggleLinksVisible() {
      set((s) => ({ linksVisible: !s.linksVisible }))
    },
  }
})
