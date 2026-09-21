// Fabrique partagee du squelette d'un ecran (v2, addendum navigation §3.1) :
// une frame de premier niveau portant `device`. Utilisee a la fois par
// document.ts (createDocument, migration v1 -> v2) et par
// commands/edits.ts (createScreenCommand) pour qu'il n'existe qu'un seul
// endroit qui decide de la forme par defaut d'un ecran vide.
import type { DevicePreset, FrameNode, Node, Rect } from './types'

export function createScreenNode(name: string, device: DevicePreset, frame: Rect, children: Node[] = []): FrameNode {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'frame',
    frame,
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
    layout: {
      mode: 'absolute',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      alignMain: 'start',
      alignCross: 'start',
    },
    // Blanc plein par defaut (pas `[]`) : un ecran est un artboard visible,
    // pas une frame de mise en page transparente -- une page blanche vide
    // doit rester lisible a l'ecran, exactement comme le fond du plan de
    // travail que la refonte v1 dessinait "en dur" avant que les ecrans ne
    // deviennent de vrais noeuds.
    fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }],
    strokes: [],
    cornerRadius: 0,
    clipsContent: false,
    children,
    device: { ...device },
  }
}
