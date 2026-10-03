// Primitives de l'inspecteur partagees par InspectorPanel (champs communs) et
// ComponentSection (proprietes des composants) : champ numerique, texte, choix,
// case a cocher, couleur, et les deux utilitaires de selection groupee. Regle
// commune a tous les champs a frappe : un etat local (« draft ») pendant la
// saisie, une commande UNIQUE au blur ou a Entree, jamais a chaque frappe.
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { compositeCommand, updateNodeCommand } from '@calque/core'
import type { Color, Command, Node as CalqueNode, NodePatch } from '@calque/core'

// --- Utilitaires generiques (valeur commune, execution groupee) ---

export function commonOf<N, T>(nodes: N[], get: (n: N) => T): T | null {
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
export function commitToSelection<T>(
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
export function formatNumber(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return ''
  const trimmed = v.toFixed(2).replace(/\.?0+$/, '')
  return trimmed === '-0' ? '0' : trimmed
}

export function NumberField({ label, value, min, max, onCommit }: NumberFieldProps) {
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

export function TextField({ label, value, onCommit }: TextFieldProps) {
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

export function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
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

export function CheckboxField({
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

export function colorToHex(c: Color): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`
}

export function hexToColor(hex: string, alpha: number): Color {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return { r, g, b, a: alpha }
}

export function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (hex: string) => void }) {
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


// --- Zone de texte (plusieurs lignes) : meme regle de commit, Entree = saut de ligne ---

export function TextAreaField({
  label,
  value,
  rows = 3,
  onCommit,
}: {
  label: string
  value: string | null
  rows?: number
  onCommit: (value: string) => void
}) {
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
      <textarea
        aria-label={label}
        className="inspector-input inspector-textarea"
        rows={rows}
        value={draft}
        onChange={(e) => {
          dirtyRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={commit}
      />
    </label>
  )
}
