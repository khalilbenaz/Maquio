// Modeles Claude proposes dans les reglages, transmis a `claude --model`.
// Partage entre le main (magasin de reglages) et le renderer (liste de
// choix) : aucune dependance, comme api.ts.
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5 — meilleure qualité de design' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 — plus rapide, moins soigné' },
] as const

export type ClaudeModelId = (typeof CLAUDE_MODELS)[number]['id']

// Opus par defaut : le design est la tache la plus exigeante de Maquio.
export const DEFAULT_CLAUDE_MODEL: ClaudeModelId = 'claude-opus-5-5'

export function isClaudeModelId(value: unknown): value is ClaudeModelId {
  return CLAUDE_MODELS.some((m) => m.id === value)
}
