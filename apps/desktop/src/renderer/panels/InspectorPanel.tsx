// Inspecteur (Tache 16, decision 1). Affiche les champs communs a tout
// noeud (x/y/w/h, opacite, rotation), puis les champs specifiques au(x)
// type(s) selectionne(s) : rayon d'angle / remplissage / contour pour
// frame, rect, ellipse ; police pour text ; disposition pour frame. Un
// champ n'est affiche que si TOUS les noeuds selectionnes le portent
// (decision 4) -- sur une selection mixte (ex. un rect et un texte), seuls
// les champs communs (x/y/w/h/opacite/rotation) restent visibles.
//
// Regle centrale (decision 2, testee verbatim) : chaque champ numerique ou
// texte emet updateNodeCommand au blur ou a Entree, JAMAIS a chaque frappe.
// Une frappe ne met a jour qu'un etat local ("draft") ; la commande n'est
// construite qu'a la validation, et seulement si la valeur a reellement
// change (sinon l'historique se remplirait d'entrees vides). Une saisie
// invalide (non numerique, ou hors bornes du modele) ne produit aucune
// commande : le champ revient a la valeur courante du document avec
// aria-invalid="true" comme seul retour visuel (discret, decision 3).
//
// Sur une selection multiple, un champ dont les valeurs different entre les
// noeuds selectionnes s'affiche vide ; le valider applique le nouveau
// contenu a tous les noeuds concernes via une seule compositeCommand
// (decision 4), pour qu'un seul "annuler" desfasse toute l'edition.
import { clearLinkCommand, compositeCommand, findNode, isScreenNode, screenContaining, setLinkCommand, setTextCommand, updateNodeCommand } from '@calque/core'
import type {
  Command,
  ComponentNode,
  EllipseNode,
  Fill,
  FrameNode,
  ImageNode,
  LayoutMode,
  Node as CalqueNode,
  RectNode,
  Stroke,
  TextNode,
} from '@calque/core'
import { CheckboxField, ColorField, NumberField, SelectField, TextField, colorToHex, commitToSelection, commonOf, hexToColor } from './inspectorFields'
import { ComponentSection, ContainerSection } from './ComponentSection'
import { ArrangeSection } from './ArrangeSection'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf } from '../canvas/useDragInteraction'
import type { CalqueApi } from '../../shared/api'
import './InspectorPanel.css'


// --- Predicats de type (decident quels champs s'affichent, decision 4) ---

type FillableNode = FrameNode | RectNode | EllipseNode

function hasCornerRadius(n: CalqueNode): n is FrameNode | RectNode {
  return n.type === 'frame' || n.type === 'rect'
}

function isFillable(n: CalqueNode): n is FillableNode {
  return n.type === 'frame' || n.type === 'rect' || n.type === 'ellipse'
}

function isTextNode(n: CalqueNode): n is TextNode {
  return n.type === 'text'
}

function isFrameNode(n: CalqueNode): n is FrameNode {
  return n.type === 'frame'
}

function isImageNode(n: CalqueNode): n is ImageNode {
  return n.type === 'image'
}

// --- Sections specifiques ---

function FillSection({
  nodes,
  pageId,
  execute,
}: {
  nodes: FillableNode[]
  pageId: string
  execute: (c: Command) => void
}) {
  const isSolid = (n: FillableNode) => n.fills[0]?.type === 'solid'
  const enabled = nodes.every(isSolid)
  const first = nodes[0]
  const firstFill = first?.fills[0]
  const hex = firstFill && firstFill.type === 'solid' ? colorToHex(firstFill.color) : '#000000'

  // Round de correction 1 (Critical) : chaque noeud construit SA PROPRE
  // nouvelle valeur de `fills` a partir de SON tableau courant -- jamais un
  // tableau unique partage applique tel quel a toute la selection. C'est ce
  // qui garantit que l'alpha courant du premier remplissage et les
  // remplissages suivants (fills[1:]) restent intacts : une simple edition
  // de couleur ne doit jamais silencieusement figer l'alpha a 1 ni tronquer
  // le tableau a un seul element (perte de donnees constatee a l'usage, y
  // compris sur un document importe depuis Figma en tache 17).
  function applyFills(build: (n: FillableNode) => Fill[]) {
    const commands = nodes
      .map((n) => {
        const newFills = build(n)
        if (JSON.stringify(n.fills) === JSON.stringify(newFills)) return null
        return updateNodeCommand(pageId, n.id, { fills: newFills })
      })
      .filter((c): c is Command => c !== null)
    if (commands.length === 0) return
    execute(commands.length === 1 ? commands[0]! : compositeCommand('Modifier le remplissage', commands))
  }

  return (
    <section className="inspector-section">
      <h2>Remplissage</h2>
      <CheckboxField
        label="Remplissage actif"
        checked={enabled}
        onCommit={(v) =>
          applyFills((n) => {
            const currentFirst = n.fills[0]
            const rest = n.fills.slice(1)
            if (!v) return [{ type: 'none' }, ...rest]
            const color = currentFirst && currentFirst.type === 'solid' ? currentFirst.color : hexToColor(hex, 1)
            return [{ type: 'solid', color }, ...rest]
          })
        }
      />
      {enabled ? (
        <ColorField
          label="Couleur de remplissage"
          value={hex}
          onCommit={(newHex) =>
            applyFills((n) => {
              const currentFirst = n.fills[0]
              const alpha = currentFirst && currentFirst.type === 'solid' ? currentFirst.color.a : 1
              const rest = n.fills.slice(1)
              return [{ type: 'solid', color: hexToColor(newHex, alpha) }, ...rest]
            })
          }
        />
      ) : null}
    </section>
  )
}

function StrokeSection({
  nodes,
  pageId,
  execute,
}: {
  nodes: FillableNode[]
  pageId: string
  execute: (c: Command) => void
}) {
  const hasStroke = (n: FillableNode) => n.strokes.length > 0
  const enabled = nodes.every(hasStroke)
  const first = nodes[0]
  const firstStroke = first?.strokes[0]
  const hex = firstStroke ? colorToHex(firstStroke.color) : '#000000'
  const width = commonOf(nodes, (n) => (n as FillableNode).strokes[0]?.width ?? 0)

  // Round de correction 1 (Critical) : meme principe que FillSection.
  // applyFills ci-dessus -- chaque noeud reconstruit SON PROPRE tableau
  // `strokes` a partir de son etat courant, pour ne jamais figer l'alpha ni
  // tronquer les contours suivants (strokes[1:]) d'une edition de couleur
  // ou d'epaisseur. Desactiver le contour (checkbox) reste volontairement
  // un vidage complet du tableau : c'est une action explicite et
  // intentionnelle de l'utilisateur, pas une perte accidentelle.
  function applyStrokes(build: (n: FillableNode) => Stroke[]) {
    const commands = nodes
      .map((n) => {
        const newStrokes = build(n)
        if (JSON.stringify(n.strokes) === JSON.stringify(newStrokes)) return null
        return updateNodeCommand(pageId, n.id, { strokes: newStrokes })
      })
      .filter((c): c is Command => c !== null)
    if (commands.length === 0) return
    execute(commands.length === 1 ? commands[0]! : compositeCommand('Modifier le contour', commands))
  }

  return (
    <section className="inspector-section">
      <h2>Contour</h2>
      <CheckboxField
        label="Contour actif"
        checked={enabled}
        onCommit={(v) =>
          applyStrokes((n) => {
            if (!v) return []
            const currentFirst = n.strokes[0]
            const rest = n.strokes.slice(1)
            const color = currentFirst ? currentFirst.color : hexToColor(hex, 1)
            const strokeWidth = currentFirst ? currentFirst.width : 1
            return [{ color, width: strokeWidth }, ...rest]
          })
        }
      />
      {enabled ? (
        <>
          <ColorField
            label="Couleur du contour"
            value={hex}
            onCommit={(newHex) =>
              applyStrokes((n) => {
                const currentFirst = n.strokes[0]
                const alpha = currentFirst ? currentFirst.color.a : 1
                const strokeWidth = currentFirst ? currentFirst.width : 1
                const rest = n.strokes.slice(1)
                return [{ color: hexToColor(newHex, alpha), width: strokeWidth }, ...rest]
              })
            }
          />
          <NumberField
            label="Épaisseur du contour"
            value={width}
            min={0}
            onCommit={(v) =>
              applyStrokes((n) => {
                const currentFirst = n.strokes[0]
                const color = currentFirst ? currentFirst.color : hexToColor(hex, 1)
                const rest = n.strokes.slice(1)
                return [{ color, width: v }, ...rest]
              })
            }
          />
        </>
      ) : null}
    </section>
  )
}

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' },
] as const

function TextSection({ nodes, pageId, execute }: { nodes: TextNode[]; pageId: string; execute: (c: Command) => void }) {
  function commitStyle<T>(get: (n: TextNode) => T, key: keyof TextNode['style'], value: T, label: string) {
    const commands = nodes
      .filter((n) => get(n) !== value)
      .map((n) => updateNodeCommand(pageId, n.id, { style: { ...n.style, [key]: value } }))
    if (commands.length === 0) return
    execute(commands.length === 1 ? commands[0]! : compositeCommand(label, commands))
  }

  return (
    <section className="inspector-section">
      <h2>Texte</h2>
      <TextField
        label="Contenu"
        value={commonOf(nodes, (n) => n.characters)}
        onCommit={(v) => {
          const commands = nodes.filter((n) => n.characters !== v).map((n) => setTextCommand(pageId, n.id, v))
          if (commands.length === 0) return
          execute(commands.length === 1 ? commands[0]! : compositeCommand('Modifier le texte', commands))
        }}
      />
      <TextField
        label="Famille de police"
        value={commonOf(nodes, (n) => n.style.fontFamily)}
        onCommit={(v) => commitStyle((n) => n.style.fontFamily, 'fontFamily', v, 'Modifier la police')}
      />
      <NumberField
        label="Taille de police"
        value={commonOf(nodes, (n) => n.style.fontSize)}
        min={0}
        onCommit={(v) => commitStyle((n) => n.style.fontSize, 'fontSize', v, 'Modifier la taille de police')}
      />
      <NumberField
        label="Graisse"
        value={commonOf(nodes, (n) => n.style.fontWeight)}
        onCommit={(v) => commitStyle((n) => n.style.fontWeight, 'fontWeight', v, 'Modifier la graisse')}
      />
      <NumberField
        label="Interligne"
        value={commonOf(nodes, (n) => n.style.lineHeight)}
        min={0}
        onCommit={(v) => commitStyle((n) => n.style.lineHeight, 'lineHeight', v, "Modifier l'interligne")}
      />
      <NumberField
        label="Interlettrage"
        value={commonOf(nodes, (n) => n.style.letterSpacing)}
        onCommit={(v) => commitStyle((n) => n.style.letterSpacing, 'letterSpacing', v, "Modifier l'interlettrage")}
      />
      <SelectField
        label="Alignement du texte"
        value={commonOf(nodes, (n) => n.style.align)}
        options={TEXT_ALIGN_OPTIONS}
        onCommit={(v) => commitStyle((n) => n.style.align, 'align', v, "Modifier l'alignement du texte")}
      />
    </section>
  )
}

const LAYOUT_MODE_OPTIONS = [
  { value: 'absolute', label: 'Absolue' },
  { value: 'row', label: 'Ligne' },
  { value: 'column', label: 'Colonne' },
] as const

const ALIGN_MAIN_OPTIONS = [
  { value: 'start', label: 'Début' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'Fin' },
  { value: 'space-between', label: 'Espace entre' },
] as const

const ALIGN_CROSS_OPTIONS = [
  { value: 'start', label: 'Début' },
  { value: 'center', label: 'Centre' },
  { value: 'end', label: 'Fin' },
  { value: 'stretch', label: 'Étirer' },
] as const

function LayoutSection({
  nodes,
  pageId,
  execute,
}: {
  nodes: FrameNode[]
  pageId: string
  execute: (c: Command) => void
}) {
  function commitLayout<T>(get: (n: FrameNode) => T, build: (n: FrameNode, v: T) => FrameNode['layout'], value: T, label: string) {
    const commands = nodes
      .filter((n) => get(n) !== value)
      .map((n) => updateNodeCommand(pageId, n.id, { layout: build(n, value) }))
    if (commands.length === 0) return
    execute(commands.length === 1 ? commands[0]! : compositeCommand(label, commands))
  }

  return (
    <section className="inspector-section">
      <h2>Disposition</h2>
      <SelectField<LayoutMode>
        label="Mode de disposition"
        value={commonOf(nodes, (n) => n.layout.mode)}
        options={LAYOUT_MODE_OPTIONS}
        onCommit={(v) =>
          commitLayout((n) => n.layout.mode, (n, val) => ({ ...n.layout, mode: val }), v, 'Modifier la disposition')
        }
      />
      <NumberField
        label="Espacement"
        value={commonOf(nodes, (n) => n.layout.gap)}
        min={0}
        onCommit={(v) => commitLayout((n) => n.layout.gap, (n, val) => ({ ...n.layout, gap: val }), v, "Modifier l'espacement")}
      />
      <NumberField
        label="Marge haut"
        value={commonOf(nodes, (n) => n.layout.padding.top)}
        min={0}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.padding.top,
            (n, val) => ({ ...n.layout, padding: { ...n.layout.padding, top: val } }),
            v,
            'Modifier la marge haute',
          )
        }
      />
      <NumberField
        label="Marge droite"
        value={commonOf(nodes, (n) => n.layout.padding.right)}
        min={0}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.padding.right,
            (n, val) => ({ ...n.layout, padding: { ...n.layout.padding, right: val } }),
            v,
            'Modifier la marge droite',
          )
        }
      />
      <NumberField
        label="Marge bas"
        value={commonOf(nodes, (n) => n.layout.padding.bottom)}
        min={0}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.padding.bottom,
            (n, val) => ({ ...n.layout, padding: { ...n.layout.padding, bottom: val } }),
            v,
            'Modifier la marge basse',
          )
        }
      />
      <NumberField
        label="Marge gauche"
        value={commonOf(nodes, (n) => n.layout.padding.left)}
        min={0}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.padding.left,
            (n, val) => ({ ...n.layout, padding: { ...n.layout.padding, left: val } }),
            v,
            'Modifier la marge gauche',
          )
        }
      />
      <SelectField
        label="Alignement principal"
        value={commonOf(nodes, (n) => n.layout.alignMain)}
        options={ALIGN_MAIN_OPTIONS}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.alignMain,
            (n, val) => ({ ...n.layout, alignMain: val }),
            v,
            "Modifier l'alignement principal",
          )
        }
      />
      <SelectField
        label="Alignement secondaire"
        value={commonOf(nodes, (n) => n.layout.alignCross)}
        options={ALIGN_CROSS_OPTIONS}
        onCommit={(v) =>
          commitLayout(
            (n) => n.layout.alignCross,
            (n, val) => ({ ...n.layout, alignCross: val }),
            v,
            "Modifier l'alignement secondaire",
          )
        }
      />
    </section>
  )
}

const IMAGE_FIT_OPTIONS = [
  { value: 'cover', label: 'Couvrir' },
  { value: 'contain', label: 'Contenir' },
  { value: 'fill', label: 'Étirer' },
] as const

// Defaut n3 (« comment mettre l'image ? ») : l'inspecteur d'un noeud
// image n'exposait jusqu'ici RIEN pour renseigner ou remplacer `src` --
// seul le tracé initial (useDragInteraction.ts) en avait la charge, sans
// aucun moyen de revenir dessus ensuite. `choisirImage` reutilise le meme
// canal (api.chooseImage()) que le tracé ; sur une selection de plusieurs
// images, le nouveau fichier s'applique aux noeuds dont le src differe
// deja (meme regle de commit groupe que les autres sections).
function ImageSection({
  nodes,
  pageId,
  execute,
  api,
}: {
  nodes: ImageNode[]
  pageId: string
  execute: (c: Command) => void
  api: CalqueApi
}) {
  async function choisirImage() {
    const chosenPath = await api.chooseImage()
    if (chosenPath === null) return
    const commands = nodes
      .filter((n) => n.src !== chosenPath)
      .map((n) => updateNodeCommand(pageId, n.id, { src: chosenPath }))
    if (commands.length === 0) return
    execute(commands.length === 1 ? commands[0]! : compositeCommand("Changer l'image", commands))
  }

  return (
    <section className="inspector-section">
      <h2>Image</h2>
      <button type="button" className="inspector-image-choose" onClick={() => void choisirImage()}>
        Choisir une image…
      </button>
      <SelectField
        label="Mode d'ajustement"
        value={commonOf(nodes, (n) => n.fit)}
        options={IMAGE_FIT_OPTIONS}
        onCommit={(v) => {
          const commands = nodes.filter((n) => n.fit !== v).map((n) => updateNodeCommand(pageId, n.id, { fit: v }))
          if (commands.length === 0) return
          execute(commands.length === 1 ? commands[0]! : compositeCommand("Modifier l'ajustement de l'image", commands))
        }}
      />
    </section>
  )
}

// v2 (addendum navigation §5, chemin 1 : « un nœud sélectionné expose « Au
// clic → » avec la liste des écrans de la page »). Seul chemin qui marche
// meme quand l'ecran cible est hors de vue (contrairement a la poignee de
// lien du cadre de selection, qui suppose l'ecran cible visible pour y
// glisser-deposer). Reserve a une selection d'UN SEUL noeud (comme les
// poignees de redimensionnement, decision 8 de la v1) : la cible choisie
// n'aurait pas necessairement de sens pour plusieurs noeuds a la fois
// (chacun a son propre ecran englobant, donc sa propre regle de refus).
function LinkSection({
  node,
  pageId,
  execute,
  screens,
  containingScreenId,
}: {
  node: CalqueNode
  pageId: string
  execute: (c: Command) => void
  screens: FrameNode[]
  containingScreenId: string | null
}) {
  // L'ecran qui contient deja ce noeud est exclu de la liste : le proposer
  // reviendrait a offrir un choix que setLinkCommand refuserait de toute
  // facon (§3.2 : « un lien vers l'écran qui contient le nœud est refusé »).
  const options = screens.filter((s) => s.id !== containingScreenId)
  const value = node.link?.target ?? ''

  return (
    <section className="inspector-section">
      <h2>Navigation</h2>
      <label className="inspector-field">
        <span className="inspector-field-label">Au clic →</span>
        <select
          aria-label="Au clic →"
          className="inspector-input"
          value={value}
          onChange={(e) => {
            const target = e.target.value
            execute(target === '' ? clearLinkCommand(pageId, node.id) : setLinkCommand(pageId, node.id, target))
          }}
        >
          <option value="">(aucun)</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

// --- Composant principal ---

export function InspectorPanel({ api }: { api: CalqueApi }) {
  const document_ = useEditorStore((s) => s.document)
  const pageId = useEditorStore((s) => s.pageId)
  const selection = useEditorStore((s) => s.selection)
  const execute = useEditorStore((s) => s.execute)

  const allNodes = pageNodesOf(document_, pageId)
  const selectedNodes = selection
    .map((id) => findNode(allNodes, id))
    .filter((n): n is CalqueNode => n !== null)

  if (selectedNodes.length === 0) {
    return (
      <aside className="inspector-panel" aria-label="Inspecteur">
        <p className="inspector-empty">Aucune sélection</p>
      </aside>
    )
  }

  const cornerRadiusNodes = selectedNodes.filter(hasCornerRadius)
  const showCornerRadius = cornerRadiusNodes.length === selectedNodes.length

  const fillableNodes = selectedNodes.filter(isFillable)
  const showFillAndStroke = fillableNodes.length === selectedNodes.length

  const textNodes = selectedNodes.filter(isTextNode)
  const showText = textNodes.length === selectedNodes.length

  const frameNodes = selectedNodes.filter(isFrameNode)
  const showLayout = frameNodes.length === selectedNodes.length

  // v3 (composants mobiles) : la section d'un composant n'apparait que si
  // TOUTE la selection est de meme kind (ses champs ne s'appliqueraient
  // sinon pas a tous) ; celle d'un conteneur, pour toute selection de frames.
  const componentNodes = selectedNodes.filter((n): n is ComponentNode => n.type === 'component')
  const showComponent =
    componentNodes.length === selectedNodes.length && componentNodes.every((n) => n.kind === componentNodes[0]!.kind)

  const imageNodes = selectedNodes.filter(isImageNode)
  const showImage = imageNodes.length === selectedNodes.length

  // v2 (addendum navigation §5, chemin 1) : reserve a une selection d'UN
  // SEUL noeud (voir la note de LinkSection ci-dessus).
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0]! : null
  const screens = allNodes.filter(isScreenNode)
  const containingScreenId = singleSelectedNode ? screenContaining(allNodes, singleSelectedNode.id) : null

  return (
    <aside className="inspector-panel" aria-label="Inspecteur">
      {singleSelectedNode ? (
        <section className="inspector-section">
          <h2>Nom</h2>
          <TextField
            label="Nom du calque"
            value={singleSelectedNode.name}
            onCommit={(v) => {
              const name = v.trim()
              if (name !== '' && name !== singleSelectedNode.name) execute(updateNodeCommand(pageId, singleSelectedNode.id, { name }))
            }}
          />
        </section>
      ) : null}
      <ArrangeSection count={selectedNodes.length} />
      <section className="inspector-section">
        <h2>Position et taille</h2>
        <div className="inspector-grid">
          <NumberField
            label="X"
            value={commonOf(selectedNodes, (n) => n.frame.x)}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                'Modifier X',
                (n) => n.frame.x,
                (n, val) => ({ frame: { ...n.frame, x: val } }),
                v,
              )
            }
          />
          <NumberField
            label="Y"
            value={commonOf(selectedNodes, (n) => n.frame.y)}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                'Modifier Y',
                (n) => n.frame.y,
                (n, val) => ({ frame: { ...n.frame, y: val } }),
                v,
              )
            }
          />
          <NumberField
            label="Largeur"
            value={commonOf(selectedNodes, (n) => n.frame.w)}
            min={0}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                'Modifier la largeur',
                (n) => n.frame.w,
                (n, val) => ({ frame: { ...n.frame, w: val } }),
                v,
              )
            }
          />
          <NumberField
            label="Hauteur"
            value={commonOf(selectedNodes, (n) => n.frame.h)}
            min={0}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                'Modifier la hauteur',
                (n) => n.frame.h,
                (n, val) => ({ frame: { ...n.frame, h: val } }),
                v,
              )
            }
          />
          <NumberField
            label="Opacité"
            value={commonOf(selectedNodes, (n) => n.opacity)}
            min={0}
            max={1}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                "Modifier l'opacité",
                (n) => n.opacity,
                () => ({ opacity: v }),
                v,
              )
            }
          />
          <NumberField
            label="Rotation"
            value={commonOf(selectedNodes, (n) => n.rotation)}
            onCommit={(v) =>
              commitToSelection(
                selectedNodes,
                pageId,
                execute,
                'Modifier la rotation',
                (n) => n.rotation,
                () => ({ rotation: v }),
                v,
              )
            }
          />
        </div>
      </section>

      {showCornerRadius ? (
        <section className="inspector-section">
          <h2>Angles</h2>
          <NumberField
            label="Rayon d'angle"
            value={commonOf(cornerRadiusNodes, (n) => (n as FrameNode | RectNode).cornerRadius)}
            min={0}
            onCommit={(v) =>
              commitToSelection(
                cornerRadiusNodes,
                pageId,
                execute,
                "Modifier le rayon d'angle",
                (n) => (n as FrameNode | RectNode).cornerRadius,
                () => ({ cornerRadius: v }),
                v,
              )
            }
          />
        </section>
      ) : null}

      {showComponent ? (
        <ComponentSection
          nodes={componentNodes}
          pageId={pageId}
          execute={execute}
          screens={allNodes.filter(isScreenNode).map((s) => ({ id: s.id, name: s.name }))}
        />
      ) : null}
      {showLayout ? <ContainerSection nodes={frameNodes} pageId={pageId} execute={execute} /> : null}
      {showFillAndStroke ? <FillSection nodes={fillableNodes} pageId={pageId} execute={execute} /> : null}
      {showFillAndStroke ? <StrokeSection nodes={fillableNodes} pageId={pageId} execute={execute} /> : null}
      {showText ? <TextSection nodes={textNodes} pageId={pageId} execute={execute} /> : null}
      {showLayout ? <LayoutSection nodes={frameNodes} pageId={pageId} execute={execute} /> : null}
      {showImage ? <ImageSection nodes={imageNodes} pageId={pageId} execute={execute} api={api} /> : null}
      {singleSelectedNode ? (
        <LinkSection
          node={singleSelectedNode}
          pageId={pageId}
          execute={execute}
          screens={screens}
          containingScreenId={containingScreenId}
        />
      ) : null}
    </aside>
  )
}
