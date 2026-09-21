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
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { compositeCommand, findNode, updateNodeCommand } from '@calque/core'
import type {
  Color,
  Command,
  EllipseNode,
  Fill,
  FrameNode,
  LayoutMode,
  Node as CalqueNode,
  NodePatch,
  RectNode,
  Stroke,
  TextNode,
} from '@calque/core'
import { useEditorStore } from '../state/editorStore'
import { pageNodesOf } from '../canvas/useDragInteraction'
import './InspectorPanel.css'

// --- Utilitaires generiques (valeur commune, execution groupee) ---

function commonOf<N, T>(nodes: N[], get: (n: N) => T): T | null {
  const first = nodes[0]
  if (first === undefined) return null
  const firstValue = get(first)
  return nodes.every((n) => get(n) === firstValue) ? firstValue : null
}

// Construit et execute, pour chaque noeud dont la valeur courante differe
// de `value`, la commande updateNodeCommand correspondante -- regroupees en
// une seule compositeCommand des qu'il y en a plus d'une (decision 4). Si
// aucun noeud ne differe (valeur inchangee, y compris sur une selection
// multiple deja homogene), aucune commande n'est executee (decision 2).
function commitToSelection<T>(
  nodes: CalqueNode[],
  pageId: string,
  execute: (c: Command) => void,
  label: string,
  get: (n: CalqueNode) => T,
  patch: (n: CalqueNode, value: T) => NodePatch,
  value: T,
): void {
  const commands = nodes.filter((n) => get(n) !== value).map((n) => updateNodeCommand(pageId, n.id, patch(n, value)))
  if (commands.length === 0) return
  execute(commands.length === 1 ? commands[0]! : compositeCommand(label, commands))
}

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

// --- Champ numerique : draft local, commit au blur/Entree, invalide/borne ---

type NumberFieldProps = {
  label: string
  value: number | null
  min?: number
  max?: number
  onCommit: (value: number) => void
}

// Affichage propre (finition v1) : au plus deux decimales, et jamais de
// decimale inutile (233, pas 233.00 ; 12.5, pas 12.50). Un arrondi
// D'AFFICHAGE uniquement -- il ne s'applique qu'au moment ou `draft` est
// (re)initialise depuis la valeur du document (ici et dans l'effet ci-
// dessous), jamais a ce que l'utilisateur tape : une frappe met a jour
// `draft` directement depuis l'evenement (handleChange), et onCommit ne
// lit jamais formatNumber -- une saisie clavier comme "12.5" est donc
// conservee telle quelle, non arrondie.
function formatNumber(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return ''
  const trimmed = v.toFixed(2).replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

function NumberField({ label, value, min, max, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatNumber(value))
  const [invalid, setInvalid] = useState(false)
  const dirtyRef = useRef(false)

  useEffect(() => {
    setDraft(formatNumber(value))
    setInvalid(false)
    dirtyRef.current = false
  }, [value])

  function commit() {
    if (!dirtyRef.current) return
    dirtyRef.current = false

    const trimmed = draft.trim()
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed)
    const horsBornes =
      !Number.isFinite(parsed) || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)

    if (horsBornes) {
      setInvalid(true)
      setDraft(formatNumber(value))
      return
    }

    setInvalid(false)
    if (value !== null && parsed === value) return
    onCommit(parsed)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    dirtyRef.current = true
    setInvalid(false)
    setDraft(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <input
        aria-label={label}
        aria-invalid={invalid ? 'true' : undefined}
        className={invalid ? 'inspector-input inspector-input-invalid' : 'inspector-input'}
        value={draft}
        onChange={handleChange}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}

// --- Champ texte : meme regle de commit, sans bornes (toute chaine valide) ---

type TextFieldProps = {
  label: string
  value: string | null
  onCommit: (value: string) => void
}

function TextField({ label, value, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(() => value ?? '')
  const dirtyRef = useRef(false)

  useEffect(() => {
    setDraft(value ?? '')
    dirtyRef.current = false
  }, [value])

  function commit() {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    if (value !== null && draft === value) return
    onCommit(draft)
  }

  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <input
        aria-label={label}
        className="inspector-input"
        value={draft}
        onChange={(e) => {
          dirtyRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

// --- Champ a choix (select) : commit immediat, pas de frappe a debattre ---

type SelectFieldProps<T extends string> = {
  label: string
  value: T | null
  options: readonly { value: T; label: string }[]
  onCommit: (value: T) => void
}

function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <select
        aria-label={label}
        className="inspector-input"
        value={value ?? ''}
        onChange={(e) => onCommit(e.target.value as T)}
      >
        {value === null ? <option value="">(mixte)</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// --- Champ case a cocher : commit immediat (pas de notion de frappe) ---

function CheckboxField({
  label,
  checked,
  onCommit,
}: {
  label: string
  checked: boolean
  onCommit: (value: boolean) => void
}) {
  return (
    <label className="inspector-field inspector-field-checkbox">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onCommit(e.target.checked)}
      />
      <span className="inspector-field-label">{label}</span>
    </label>
  )
}

// --- Champ couleur : commit immediat sur le choix (pas de frappe clavier) ---

function colorToHex(c: Color): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`
}

function hexToColor(hex: string, alpha: number): Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return { r, g, b, a: alpha }
}

function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (hex: string) => void }) {
  return (
    <label className="inspector-field">
      <span className="inspector-field-label">{label}</span>
      <input
        type="color"
        aria-label={label}
        className="inspector-color"
        value={value}
        onChange={(e) => onCommit(e.target.value)}
      />
    </label>
  )
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

// --- Composant principal ---

export function InspectorPanel() {
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

  return (
    <aside className="inspector-panel" aria-label="Inspecteur">
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

      {showFillAndStroke ? <FillSection nodes={fillableNodes} pageId={pageId} execute={execute} /> : null}
      {showFillAndStroke ? <StrokeSection nodes={fillableNodes} pageId={pageId} execute={execute} /> : null}
      {showText ? <TextSection nodes={textNodes} pageId={pageId} execute={execute} /> : null}
      {showLayout ? <LayoutSection nodes={frameNodes} pageId={pageId} execute={execute} /> : null}
    </aside>
  )
}
