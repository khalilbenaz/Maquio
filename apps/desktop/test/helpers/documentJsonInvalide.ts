// Aide de test (round de correction 1, Critical) : produit un document
// JSON SYNTAXIQUEMENT valide mais de FORME invalide (pages[0].nodes n'est
// pas un tableau), pour verifier que le ZodError leve par
// documentSchema.parse ne remonte jamais tel quel (dump JSON technique) a
// l'interface, dans aucun des quatre canaux qui valident un document.
import { createDocument, serializeDocument } from '@maquio/core'

export function documentJsonDeFormeInvalide(): string {
  const brut = JSON.parse(serializeDocument(createDocument('Document invalide'))) as { pages: Record<string, unknown>[] }
  const premierePage = brut.pages[0]
  if (premierePage === undefined) throw new Error('document de test sans page')
  premierePage['nodes'] = 'pas-un-tableau'
  return JSON.stringify(brut)
}
