// Apercu d'un ecran en cours d'ecriture par Claude (dessin en direct, voir
// app-pipeline.ts) : a partir du texte partiel de sa reponse, un ecran
// AFFICHABLE qui ne contient que des elements valides. Un element termine
// est garde tel quel ; une frame a moitie ecrite est completee de valeurs
// neutres pour montrer deja ses enfants termines ; le reste est ecarte.
// L'apercu n'est qu'un affichage : l'ecran definitif reste celui valide par
// la boucle de correction.
import { nodeSchema } from '@maquio/core'
import type { DevicePreset, FrameNode, Node, Rect } from '@maquio/core'
import { parsePartialJson } from './partial-json'

const ABSOLUTE = { mode: 'absolute' as const, gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start' as const, alignCross: 'start' as const }
const WHITE = [{ type: 'solid' as const, color: { r: 1, g: 1, b: 1, a: 1 } }]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isRect(v: unknown): v is Rect {
  return isRecord(v) && ['x', 'y', 'w', 'h'].every((k) => typeof v[k] === 'number')
}

// Essaie un champ ; s'il rend le noeud invalide, prend la valeur neutre.
function partialFrame(raw: Record<string, unknown>, frame: Rect, fallbackFills: FrameNode['fills']): FrameNode | null {
  const children = Array.isArray(raw['children']) ? raw['children'].map(lenientNode).filter((n): n is Node => n !== null) : []
  const candidate: FrameNode = {
    id: raw['id'] as string,
    name: typeof raw['name'] === 'string' ? raw['name'] : '',
    type: 'frame',
    frame,
    visible: raw['visible'] !== false,
    locked: false,
    opacity: typeof raw['opacity'] === 'number' ? raw['opacity'] : 1,
    rotation: 0,
    layout: ABSOLUTE,
    fills: fallbackFills,
    strokes: [],
    cornerRadius: 0,
    clipsContent: raw['clipsContent'] === true,
    children,
  }
  let node = candidate
  for (const key of ['layout', 'fills', 'strokes', 'cornerRadius', 'container'] as const) {
    if (raw[key] === undefined) continue
    const essai = { ...node, [key]: raw[key] }
    if (nodeSchema.safeParse({ ...essai, children: [] }).success) node = essai as FrameNode
  }
  return nodeSchema.safeParse({ ...node, children: [] }).success ? node : null
}

function lenientNode(raw: unknown): Node | null {
  const parsed = nodeSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  if (!isRecord(raw) || raw['type'] !== 'frame' || typeof raw['id'] !== 'string' || !isRect(raw['frame'])) return null
  return partialFrame(raw, raw['frame'], [])
}

export function previewScreen(partialText: string, screenId: string, frame: Rect, device: DevicePreset): FrameNode | null {
  const partial = parsePartialJson(partialText)
  const raw = isRecord(partial) ? partial['node'] : undefined
  if (!isRecord(raw)) return null
  const screen = partialFrame({ ...raw, id: screenId }, frame, WHITE)
  return screen === null ? null : { ...screen, device }
}
