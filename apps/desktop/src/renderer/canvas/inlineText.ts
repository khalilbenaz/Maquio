// Edition de texte sur le canevas (double-clic) : quel champ d'un noeud est
// editable, et comment la valeur validee devient une commande. Pur, teste
// sans rendu.
import { COMPONENT_DEFINITIONS, setTextCommand, updateNodeCommand } from '@maquio/core'
import type { Command, Node } from '@maquio/core'

// Cle de la propriete texte principale d'un composant (le premier champ
// `text` de sa definition : libelle d'un bouton, titre d'une barre...).
export function primaryTextKey(node: Node): string | null {
  if (node.type !== 'component') return null
  const field = COMPONENT_DEFINITIONS[node.kind].fields.find((f) => f.type === 'text')
  return field?.key ?? null
}

export function isInlineEditable(node: Node): boolean {
  return node.type === 'text' || primaryTextKey(node) !== null
}

export function inlineTextOf(node: Node): string {
  if (node.type === 'text') return node.characters
  const key = primaryTextKey(node)
  if (node.type === 'component' && key !== null) {
    const v = (node.props as Record<string, unknown>)[key]
    return typeof v === 'string' ? v : ''
  }
  return ''
}

// null = rien a faire (valeur inchangee).
export function inlineTextCommand(pageId: string, node: Node, value: string): Command | null {
  if (value === inlineTextOf(node)) return null
  if (node.type === 'text') return setTextCommand(pageId, node.id, value)
  const key = primaryTextKey(node)
  if (node.type === 'component' && key !== null) {
    return updateNodeCommand(pageId, node.id, { props: { ...(node.props as Record<string, unknown>), [key]: value } })
  }
  return null
}
