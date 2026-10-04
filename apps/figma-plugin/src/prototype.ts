// Prototype Figma : reactions issues des liens entre ecrans.
import type { Bundle } from './mapping'

export async function applyPrototype(_figma: PluginAPI, _bundle: Bundle, _created: Map<string, SceneNode>): Promise<{ reactions: number; warnings: string[] }> {
  return { reactions: 0, warnings: [] }
}
