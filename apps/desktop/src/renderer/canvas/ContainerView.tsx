// Habillage canevas des conteneurs semantiques (frames portant `container`) :
// ombre d'elevation de la carte et du tiroir, poignee de la feuille basse,
// separateurs d'une liste, repere d'une zone sure. Les enfants sont rendus
// par Canvas comme pour toute frame ; ce module ne dessine que ce qui
// distingue le widget natif d'un simple groupe.
import type { FrameNode } from '@calque/core'
import { M3 } from './ComponentView'

export function containerShadow(node: FrameNode): string | undefined {
  const spec = node.container
  if (spec === undefined) return undefined
  if (spec.kind === 'card' && spec.elevation > 0) {
    const e = spec.elevation
    return `0 ${e}px ${e * 3}px rgba(0, 0, 0, 0.22)`
  }
  if (spec.kind === 'drawer') return '4px 0 16px rgba(0, 0, 0, 0.25)'
  if (spec.kind === 'bottomSheet') return '0 -4px 16px rgba(0, 0, 0, 0.2)'
  return undefined
}

export function ContainerDecor({ node }: { node: FrameNode }) {
  const spec = node.container
  if (spec === undefined) return null

  if (spec.kind === 'bottomSheet' && spec.handle) {
    return (
      <div
        data-container-decor="handle"
        style={{ position: 'absolute', top: 8, left: '50%', width: 32, height: 4, marginLeft: -16, borderRadius: 2, background: M3.outlineVariant }}
      />
    )
  }

  if (spec.kind === 'listView' && spec.dividers && spec.axis === 'vertical') {
    return (
      <>
        {node.children.slice(0, -1).map((child) => (
          <div
            key={child.id}
            data-container-decor="divider"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: child.frame.y + child.frame.h + node.layout.gap / 2,
              height: 1,
              background: M3.outlineVariant,
              pointerEvents: 'none',
            }}
          />
        ))}
      </>
    )
  }

  if (spec.kind === 'safeArea') {
    // Repere discret : la zone sure exclut l'encoche et la barre d'accueil.
    return (
      <div
        data-container-decor="safe-area"
        style={{ position: 'absolute', inset: 0, border: '1px dashed rgba(103, 80, 164, 0.45)', pointerEvents: 'none' }}
      />
    )
  }

  return null
}
