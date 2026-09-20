// Schema du patch renvoye par Claude Code et son parseur (Tache 12).
//
// Le patch est un VOCABULAIRE D'OPERATIONS EXPLICITES (insertNode,
// updateNode, deleteNode, moveNode, setTokens), jamais un document complet a
// substituer : un modele qui renverrait un document entier effacerait en
// silence tout ce qu'il n'a pas compris. C'est pourquoi parsePatch rejette
// explicitement tout objet qui porte a la fois les cles "version" et
// "pages", meme s'il a par ailleurs la forme d'un patch valide.
//
// Le champ "patch" de l'operation updateNode et le champ "tokens" de
// setTokens restent volontairement peu types ici (record permissif) : la
// validation fine du noeud fusionne appartient a nodeSchema, via
// updateNodeCommand (apply.ts, packages/core), exactement comme documente
// dans packages/core/src/commands/edits.ts pour NodePatch. On ne la
// reinvente pas ici.
import { z } from 'zod'
import { nodeSchema } from '@calque/core'
import type { Color, DesignTokens, Node, NodePatch, TextStyle } from '@calque/core'

export class InvalidPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPatchError'
  }
}

// updateNode.patch reprend NodePatch (Record<string, unknown>) plutot que
// Partial<Node> : comme documente dans packages/core/src/commands/edits.ts,
// Partial<Node> sur une union discriminee ne type que l'intersection des
// champs optionnels de toutes les variantes (donc rien d'utile), et
// nodeSchema (via updateNodeCommand) est de toute facon la seule source de
// verite qui revalide le noeud fusionne.
export type PatchOp =
  | { op: 'insertNode'; parentId: string | null; index?: number; node: Node }
  | { op: 'updateNode'; nodeId: string; patch: NodePatch }
  | { op: 'deleteNode'; nodeId: string }
  | { op: 'moveNode'; nodeId: string; parentId: string | null; index: number }
  | { op: 'setTokens'; tokens: Partial<DesignTokens> }

export type DocumentPatch = { summary: string; ops: PatchOp[] }

const insertNodeOpSchema = z
  .object({
    op: z.literal('insertNode'),
    parentId: z.string().nullable(),
    index: z.number().optional(),
    node: nodeSchema,
  })
  .strict()

// Le champ "patch" reste un record permissif (miroir de NodePatch dans
// packages/core) : c'est nodeSchema, applique par updateNodeCommand lors de
// l'execution de la commande, qui revalide le noeud fusionne. Le type
// externe (Partial<Node>) documente l'intention sans pretendre la valider
// ici.
const updateNodeOpSchema = z
  .object({
    op: z.literal('updateNode'),
    nodeId: z.string(),
    patch: z.record(z.string(), z.unknown()),
  })
  .strict()

const deleteNodeOpSchema = z
  .object({
    op: z.literal('deleteNode'),
    nodeId: z.string(),
  })
  .strict()

const moveNodeOpSchema = z
  .object({
    op: z.literal('moveNode'),
    nodeId: z.string(),
    parentId: z.string().nullable(),
    index: z.number(),
  })
  .strict()

// packages/core n'exporte que nodeSchema/documentSchema (pas les schemas
// internes de Color/TextStyle) : ces deux petits schemas sont donc
// dupliques ici, seulement pour typer et valider "tokens". Ce n'est pas le
// mecanisme de patch de noeud (celui-la reste dans updateNodeCommand, on ne
// le reinvente pas) ; setTokensCommand lui-meme ne validant rien (edits.ts),
// cette validation est une garantie EN PLUS, pas un doublon.
const colorPatchSchema = z
  .object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1),
  })
  .strict() satisfies z.ZodType<Color>

const textStylePatchSchema = z
  .object({
    fontFamily: z.string(),
    fontSize: z.number().min(0),
    fontWeight: z.number(),
    lineHeight: z.number().min(0),
    letterSpacing: z.number(),
    color: colorPatchSchema,
    align: z.union([z.literal('left'), z.literal('center'), z.literal('right')]),
  })
  .strict() satisfies z.ZodType<TextStyle>

const tokensPatchSchema: z.ZodType<Partial<DesignTokens>> = z
  .object({
    colors: z.record(z.string(), colorPatchSchema).optional(),
    typography: z.record(z.string(), textStylePatchSchema).optional(),
    spacing: z.record(z.string(), z.number()).optional(),
  })
  .strict()

const setTokensOpSchema = z
  .object({
    op: z.literal('setTokens'),
    tokens: tokensPatchSchema,
  })
  .strict()

const patchOpSchema = z.discriminatedUnion('op', [
  insertNodeOpSchema,
  updateNodeOpSchema,
  deleteNodeOpSchema,
  moveNodeOpSchema,
  setTokensOpSchema,
])

export const patchSchema: z.ZodType<DocumentPatch> = z
  .object({
    summary: z.string(),
    ops: z.array(patchOpSchema),
  })
  .strict()

// Rend le plus petit objet JSON equilibre commencant au premier '{' de la
// chaine, en ignorant les accolades a l'interieur des chaines de
// caracteres. Fonctionne aussi bien pour un JSON nu que pour un JSON
// entoure de prose et/ou de balises de code (```json ... ```), sans avoir a
// reconnaitre ces balises explicitement : tout ce qui n'est pas a
// l'interieur des accolades equilibrees est simplement ignore.
function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{')
  if (start === -1) {
    throw new InvalidPatchError("Reponse de Claude Code sans JSON exploitable")
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        return raw.slice(start, i + 1)
      }
    }
  }

  throw new InvalidPatchError('JSON incomplet dans la reponse de Claude Code')
}

// Un objet qui porte a la fois "version" et "pages" est la signature d'un
// CalqueDocument complet : c'est precisement ce que le patch ne doit jamais
// etre (decision 3), independamment du fait qu'il porterait par ailleurs
// "summary"/"ops".
function looksLikeFullDocument(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return 'version' in record && 'pages' in record
}

// Valide le patch EN ENTIER avant de rendre quoi que ce soit : une seule
// operation invalide (type inconnu, champ manquant, etc.) rejette tout le
// patch, jamais seulement l'operation fautive.
export function parsePatch(raw: string): DocumentPatch {
  const jsonText = extractFirstJsonObject(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    // Aucune tentative de reparation d'un JSON malforme : un modele qui
    // produit un JSON invalide doit voir son patch rejete, pas corrige a sa
    // place.
    throw new InvalidPatchError('JSON malforme dans la reponse de Claude Code')
  }

  if (looksLikeFullDocument(parsed)) {
    throw new InvalidPatchError(
      'Le patch recu porte "version" et "pages" : Claude Code a renvoye un document complet au lieu d un patch d operations, il est rejete',
    )
  }

  const result = patchSchema.safeParse(parsed)
  if (!result.success) {
    throw new InvalidPatchError(`Patch invalide : ${result.error.message}`)
  }

  return result.data
}
