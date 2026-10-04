// Section « Interactions » de l'inspecteur : liste des interactions du noeud
// (declencheur -> action, avec transition), ajout, modification et
// suppression. Toute modification est UNE commande annulable
// (setInteractionsCommand) ; une commande refusee affiche son message.
import { useState } from 'react'
import { isScreenNode, screenContaining, setInteractionsCommand } from '@maquio/core'
import type { Command, Interaction, Node as MaquioNode } from '@maquio/core'
import { NumberField, SelectField, TextField } from './inspectorFields'
import {
  ACTION_LABELS,
  DIRECTION_LABELS,
  EASING_LABELS,
  OVERLAY_LABELS,
  TRANSITION_LABELS,
  TRIGGER_LABELS,
  actionUsable,
  availableTriggers,
  newInteraction,
  overlaysOf,
  withAction,
  withTransitionField,
  withTransitionType,
  withTrigger,
} from './interactionsEdit'
import type { Ctx } from './interactionsEdit'

const opts = <T extends string>(labels: Record<T, string>, keys: readonly T[]) => keys.map((k) => ({ value: k, label: labels[k] as string }))

export function InteractionsSection({
  node,
  pageId,
  execute,
  allNodes,
}: {
  node: MaquioNode
  pageId: string
  execute: (c: Command) => void
  allNodes: MaquioNode[]
}) {
  const [erreur, setErreur] = useState('')
  const list: Interaction[] = node.interactions ?? []
  const containing = screenContaining(allNodes, node.id)
  const ctx: Ctx = {
    isScreen: allNodes.some((n) => n.id === node.id) && isScreenNode(node),
    screens: allNodes.filter(isScreenNode).filter((s) => s.id !== containing && s.id !== node.id).map((s) => ({ id: s.id, name: s.name })),
    overlays: overlaysOf(allNodes),
  }

  function commit(next: Interaction[]) {
    try {
      execute(setInteractionsCommand(pageId, node.id, next))
      setErreur('')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }
  const replace = (i: number, it: Interaction) => commit(list.map((x, k) => (k === i ? it : x)))
  const ajout = newInteraction(list, ctx)

  return (
    <section className="inspector-section" aria-label="Interactions">
      <h2>Interactions</h2>
      {list.length === 0 ? <p className="inspector-empty">Aucune interaction.</p> : null}
      {list.map((it, i) => (
        <fieldset key={`${it.trigger.type}-${i}`} className="interaction-row" aria-label={`Interaction ${i + 1}`}>
          <SelectField
            label="Déclencheur"
            value={it.trigger.type}
            options={opts(TRIGGER_LABELS, [it.trigger.type, ...availableTriggers(list, i, ctx).filter((t) => t !== it.trigger.type)])}
            onCommit={(v) => replace(i, withTrigger(it, v))}
          />
          {it.trigger.type === 'afterDelay' ? (
            <NumberField label="Délai (ms)" value={it.trigger.ms} min={0} max={60000} onCommit={(v) => replace(i, { ...it, trigger: { type: 'afterDelay', ms: Math.round(v) } })} />
          ) : null}
          <SelectField
            label="Action"
            value={it.action.type}
            options={opts(ACTION_LABELS, (['navigate', 'back', 'openOverlay', 'closeOverlay', 'openUrl'] as const).filter((t) => t === it.action.type || actionUsable(t, ctx)))}
            onCommit={(v) => replace(i, withAction(it, v, ctx))}
          />
          {it.action.type === 'navigate' ? (
            <SelectField
              label="Écran cible"
              value={it.action.target}
              options={ctx.screens.map((s) => ({ value: s.id, label: s.name }))}
              onCommit={(v) => replace(i, { ...it, action: { type: 'navigate', target: v } })}
            />
          ) : null}
          {it.action.type === 'openOverlay' ? (
            <SelectField
              label="Overlay"
              value={it.action.target}
              options={ctx.overlays.map((o) => ({ value: o.id, label: `${OVERLAY_LABELS[o.overlay]} : ${o.name}` }))}
              onCommit={(v) => {
                const o = ctx.overlays.find((x) => x.id === v)
                if (o) replace(i, { ...it, action: { type: 'openOverlay', overlay: o.overlay, target: o.id } })
              }}
            />
          ) : null}
          {it.action.type === 'openUrl' ? (
            <TextField label="URL" value={it.action.url} onCommit={(v) => replace(i, { ...it, action: { type: 'openUrl', url: v.trim() } })} />
          ) : null}
          <SelectField
            label="Transition"
            value={it.transition.type}
            options={opts(TRANSITION_LABELS, ['none', 'slide', 'push', 'fade', 'modal'])}
            onCommit={(v) => replace(i, withTransitionType(it, v))}
          />
          {it.transition.type === 'slide' ? (
            <SelectField label="Direction" value={it.transition.direction} options={opts(DIRECTION_LABELS, ['left', 'right', 'up', 'down'])} onCommit={(v) => replace(i, withTransitionField(it, { direction: v as 'left' | 'right' | 'up' | 'down' }))} />
          ) : null}
          {it.transition.type !== 'none' ? (
            <>
              <NumberField label="Durée (ms)" value={it.transition.durationMs} min={0} max={5000} onCommit={(v) => replace(i, withTransitionField(it, { durationMs: Math.round(v) }))} />
              <SelectField label="Courbe" value={it.transition.easing} options={opts(EASING_LABELS, ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'])} onCommit={(v) => replace(i, withTransitionField(it, { easing: v as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' }))} />
            </>
          ) : null}
          <button type="button" className="arrange-button interaction-remove" aria-label={`Supprimer l'interaction ${i + 1}`} onClick={() => commit(list.filter((_, k) => k !== i))}>
            Supprimer l'interaction
          </button>
        </fieldset>
      ))}
      <button type="button" className="arrange-button" aria-label="Ajouter une interaction" disabled={ajout === null} onClick={() => ajout && commit([...list, ajout])}>
        + Ajouter une interaction
      </button>
      {erreur !== '' ? (
        <p role="alert" className="inspector-error">
          {erreur}
        </p>
      ) : null}
    </section>
  )
}
