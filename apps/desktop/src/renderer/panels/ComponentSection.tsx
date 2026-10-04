// Proprietes d'un composant mobile et de son conteneur dans l'inspecteur.
// Les champs sont DERIVES du catalogue de @maquio/core (FieldDef) : ajouter
// une propriete au catalogue la rend editable ici sans code supplementaire.
// Toute edition passe par updateNodeCommand / setContainerCommand -- donc
// annulable et groupee en un seul geste sur une selection multiple. Une
// valeur que le modele refuse (nodeSchema leve) est signalee en dessous du
// champ ; le document n'est alors jamais modifie.
import { useState } from 'react'
import {
  CONTAINER_DEFINITIONS,
  COMPONENT_DEFINITIONS,
  CONTAINER_KINDS,
  ICONS,
  ICON_NAMES,
  compositeCommand,
  setContainerCommand,
  updateNodeCommand,
} from '@maquio/core'
import type { Command, ComponentKind, ComponentNode, ContainerKind, ContainerSpec, FieldDef, FrameNode, IconName } from '@maquio/core'
import { CheckboxField, ColorField, NumberField, SelectField, TextAreaField, TextField, colorToHex, hexToColor } from './inspectorFields'
import { M3 } from '../canvas/ComponentView'

type Props = Record<string, unknown>

const ICON_OPTIONS = ICON_NAMES.map((name) => ({ value: name, label: ICONS[name].label }))

// Message lisible d'une erreur de validation du modele (ZodError : la
// premiere cause ; autre erreur : son message).
function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    const issues = (error as { issues: { message: string }[] }).issues
    if (issues[0] !== undefined) return issues[0].message
  }
  return error instanceof Error ? error.message : String(error)
}

function withKey(props: Props, key: string, value: unknown): Props {
  const next = { ...props }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

// Valeur d'une cle commune a toute la selection (egalite structurelle), ou
// `undefined` quand les valeurs different ET `mixed` quand c'est le cas.
const MIXED = Symbol('mixte')
function commonValue(allProps: Props[], key: string): unknown {
  const first = allProps[0]?.[key]
  const firstJson = JSON.stringify(first)
  return allProps.every((p) => JSON.stringify(p[key]) === firstJson) ? first : MIXED
}

export type ScreenOption = { id: string; name: string }

function ErrorLine({ message }: { message: string | null }) {
  return message === null ? null : (
    <p role="alert" className="inspector-error">
      {message}
    </p>
  )
}

type FieldContext = {
  def: FieldDef
  values: Props[]
  screens: ScreenOption[]
  // Remplace la valeur de `key` (undefined : retire la cle).
  set: (key: string, value: unknown, label: string) => void
}

function Field({ def, values, screens, set }: FieldContext) {
  const value = commonValue(values, def.key)
  const mixed = value === MIXED
  const label = def.label

  switch (def.type) {
    case 'text':
      return def.multiline ? (
        <TextAreaField label={label} value={mixed ? null : (value as string)} onCommit={(v) => set(def.key, v, `Modifier ${label.toLowerCase()}`)} />
      ) : (
        <TextField label={label} value={mixed ? null : (value as string)} onCommit={(v) => set(def.key, v, `Modifier ${label.toLowerCase()}`)} />
      )
    case 'number':
      return (
        <NumberField
          label={label}
          value={mixed ? null : (value as number)}
          min={def.min}
          max={def.max}
          onCommit={(v) => set(def.key, def.integer === true ? Math.round(v) : v, `Modifier ${label.toLowerCase()}`)}
        />
      )
    case 'boolean':
      return <CheckboxField label={label} checked={mixed ? false : (value as boolean)} onCommit={(v) => set(def.key, v, `Modifier ${label.toLowerCase()}`)} />
    case 'select':
      return (
        <SelectField
          label={label}
          value={mixed ? null : (value as string)}
          options={def.options}
          onCommit={(v) => set(def.key, v, `Modifier ${label.toLowerCase()}`)}
        />
      )
    case 'icon': {
      const current = mixed ? null : value === undefined ? '' : (value as string)
      const options = def.optional === true ? [{ value: '', label: '(aucune)' }, ...ICON_OPTIONS] : ICON_OPTIONS
      return (
        <SelectField
          label={label}
          value={current}
          options={options}
          onCommit={(v) => set(def.key, v === '' ? undefined : v, `Modifier ${label.toLowerCase()}`)}
        />
      )
    }
    case 'color': {
      const color = mixed ? undefined : (value as { r: number; g: number; b: number; a: number } | undefined)
      return (
        <div className="inspector-color-row">
          <ColorField
            label={label}
            value={color === undefined ? M3.primary.toLowerCase() : colorToHex(color)}
            onCommit={(hex) => set(def.key, hexToColor(hex, color?.a ?? 1), 'Modifier la couleur')}
          />
          {color !== undefined || mixed ? (
            <button
              type="button"
              className="inspector-link-button"
              aria-label="Revenir à la couleur du thème"
              onClick={() => set(def.key, undefined, 'Couleur du thème')}
            >
              Thème
            </button>
          ) : null}
        </div>
      )
    }
    case 'strings':
      return (
        <TextAreaField
          label={label}
          value={mixed ? null : (value as string[]).join('\n')}
          onCommit={(v) =>
            set(
              def.key,
              v.split('\n').filter((line) => line !== ''),
              `Modifier ${label.toLowerCase()}`,
            )
          }
        />
      )
    case 'icons': {
      const actions = mixed ? [] : (value as IconName[])
      return (
        <fieldset className="inspector-list">
          <legend>{label}</legend>
          {actions.map((name, i) => (
            <div key={i} className="inspector-list-row">
              <SelectField
                label={`Action ${i + 1}`}
                value={name}
                options={ICON_OPTIONS}
                onCommit={(v) => set(def.key, actions.map((a, j) => (j === i ? v : a)), 'Modifier une action')}
              />
              <button
                type="button"
                className="inspector-link-button"
                aria-label={`Retirer l’action ${i + 1}`}
                onClick={() => set(def.key, actions.filter((_, j) => j !== i), 'Retirer une action')}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inspector-link-button"
            onClick={() => set(def.key, [...actions, 'search'], 'Ajouter une action')}
          >
            Ajouter une action
          </button>
        </fieldset>
      )
    }
    case 'navItems': {
      type Item = { label: string; icon?: IconName; target?: string }
      const items = mixed ? [] : (value as Item[])
      const update = (i: number, patch: Partial<Item>, undo: string) => {
        const next = items.map((item, j) => {
          if (j !== i) return item
          const merged: Item = { ...item, ...patch }
          for (const k of Object.keys(patch) as (keyof Item)[]) if (patch[k] === undefined) delete merged[k]
          return merged
        })
        set(def.key, next, undo)
      }
      const screenOptions = [{ value: '', label: '(aucun)' }, ...screens.map((s) => ({ value: s.id, label: s.name }))]
      return (
        <fieldset className="inspector-list">
          <legend>{label}</legend>
          {items.map((item, i) => (
            <div key={i} className="inspector-list-item">
              <TextField label={`Entrée ${i + 1} : libellé`} value={item.label} onCommit={(v) => update(i, { label: v }, 'Modifier une entrée')} />
              <SelectField
                label={`Entrée ${i + 1} : icône`}
                value={item.icon ?? ''}
                options={def.iconOptional ? [{ value: '', label: '(aucune)' }, ...ICON_OPTIONS] : ICON_OPTIONS}
                onCommit={(v) => update(i, { icon: v === '' ? undefined : (v as IconName) }, 'Modifier une entrée')}
              />
              <SelectField
                label={`Entrée ${i + 1} : écran cible`}
                value={item.target ?? ''}
                options={screenOptions}
                onCommit={(v) => update(i, { target: v === '' ? undefined : v }, 'Lier une entrée')}
              />
              <button
                type="button"
                className="inspector-link-button"
                aria-label={`Retirer l’entrée ${i + 1}`}
                onClick={() => set(def.key, items.filter((_, j) => j !== i), 'Retirer une entrée')}
              >
                Retirer
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inspector-link-button"
            onClick={() =>
              set(
                def.key,
                [...items, def.iconOptional ? { label: `Onglet ${items.length + 1}` } : { label: `Entrée ${items.length + 1}`, icon: 'star' }],
                'Ajouter une entrée',
              )
            }
          >
            Ajouter une entrée
          </button>
        </fieldset>
      )
    }
  }
}

// --- Section d'un composant feuille ---

export function ComponentSection({
  nodes,
  pageId,
  execute,
  screens,
}: {
  nodes: ComponentNode[]
  pageId: string
  execute: (c: Command) => void
  screens: ScreenOption[]
}) {
  const [error, setError] = useState<string | null>(null)
  const kind: ComponentKind = nodes[0]!.kind
  const definition = COMPONENT_DEFINITIONS[kind]
  const values = nodes.map((n) => n.props as Props)

  function set(key: string, value: unknown, label: string) {
    const commands = nodes
      .map((n) => {
        const props = n.props as Props
        const next = withKey(props, key, value)
        return JSON.stringify(next) === JSON.stringify(props) ? null : updateNodeCommand(pageId, n.id, { props: next })
      })
      .filter((c): c is Command => c !== null)
    if (commands.length === 0) return
    try {
      execute(commands.length === 1 ? commands[0]! : compositeCommand(label, commands))
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <section className="inspector-section" data-section="component">
      <h2>{definition.label}</h2>
      {definition.fields.map((field) => (
        <Field key={field.key} def={field} values={values} screens={screens} set={set} />
      ))}
      <ErrorLine message={error} />
    </section>
  )
}

// --- Section « conteneur » d'une ou plusieurs frames ---

const CONTAINER_TYPE_OPTIONS = [
  { value: '', label: 'Frame (aucun)' },
  ...CONTAINER_KINDS.map((kind) => ({ value: kind, label: CONTAINER_DEFINITIONS[kind].label })),
]

export function ContainerSection({
  nodes,
  pageId,
  execute,
}: {
  nodes: FrameNode[]
  pageId: string
  execute: (c: Command) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const kinds = nodes.map((n) => n.container?.kind ?? '')
  const commonKind = kinds.every((k) => k === kinds[0]) ? kinds[0]! : null

  function run(commands: Command[], label: string) {
    if (commands.length === 0) return
    try {
      execute(commands.length === 1 ? commands[0]! : compositeCommand(label, commands))
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    }
  }

  function changeKind(next: string) {
    const commands = nodes
      .filter((n) => (n.container?.kind ?? '') !== next)
      .map((n) =>
        setContainerCommand(pageId, n.id, next === '' ? null : ({ ...CONTAINER_DEFINITIONS[next as ContainerKind].spec } as ContainerSpec)),
      )
    run(commands, 'Modifier le conteneur')
  }

  const fields: FieldDef[] =
    commonKind !== null && commonKind !== '' ? CONTAINER_DEFINITIONS[commonKind as ContainerKind].fields : []
  const values = nodes.map((n) => (n.container ?? {}) as Props)

  function set(key: string, value: unknown, label: string) {
    const commands = nodes
      .filter((n) => n.container !== undefined)
      .map((n) => {
        const spec = n.container as unknown as Props
        const next = withKey(spec, key, value) as unknown as ContainerSpec
        return JSON.stringify(next) === JSON.stringify(spec) ? null : setContainerCommand(pageId, n.id, next)
      })
      .filter((c): c is Command => c !== null)
    run(commands, label)
  }

  return (
    <section className="inspector-section" data-section="container">
      <h2>Conteneur</h2>
      <SelectField label="Type de conteneur" value={commonKind} options={CONTAINER_TYPE_OPTIONS} onCommit={changeKind} />
      {fields.map((field) => (
        <Field key={field.key} def={field} values={values} screens={[]} set={set} />
      ))}
      <ErrorLine message={error} />
    </section>
  )
}
