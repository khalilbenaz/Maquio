// Boucle de correction du pont Claude Code : quand un patch est rejete
// (forme invalide selon le schema, ou operation inapplicable au document),
// on ne l'abandonne pas au premier essai. On renvoie a Claude sa reponse et
// la liste PRECISE des problemes (chemin, valeur recue, valeurs autorisees)
// pour qu'il la corrige. Ce texte est destine au modele, pas a
// l'utilisateur : il peut donc reprendre les messages techniques de Zod.
import { ZodError, type ZodIssue } from 'zod'
import { InvalidPatchError, extractFirstJsonObject } from './patch'

const MAX_ISSUES = 20

function formatPath(path: (string | number)[]): string {
  let out = ''
  for (const segment of path) {
    out += typeof segment === 'number' ? `[${segment}]` : out === '' ? segment : `.${segment}`
  }
  return out === '' ? '(racine)' : out
}

function valueAt(root: unknown, path: (string | number)[]): unknown {
  let current = root
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

function received(root: unknown, path: (string | number)[]): string {
  const value = valueAt(root, path)
  if (value === undefined) return 'absente'
  const text = JSON.stringify(value)
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

// Une union de litteraux (ex. style.align : "left" | "center" | "right")
// se reduit a la liste des valeurs autorisees. Une union de formes (ex. les
// types de noeud) se reduit aux problemes de la branche la plus proche,
// celle qui a le moins d'erreurs.
function describeIssue(issue: ZodIssue, root: unknown, out: string[]): void {
  if (out.length >= MAX_ISSUES) return
  const path = formatPath(issue.path)

  if (issue.code === 'invalid_union') {
    const branches = issue.unionErrors.map((e) => e.issues)
    const literals = branches.flat().filter((i) => i.code === 'invalid_literal')
    if (literals.length === branches.length && literals.every((i) => i.code === 'invalid_literal')) {
      const allowed = literals.map((i) => JSON.stringify(i.code === 'invalid_literal' ? i.expected : null)).join(', ')
      out.push(`- "${path}" : valeur ${received(root, issue.path)} interdite, valeurs autorisées : ${allowed}`)
      return
    }
    const closest = branches.reduce((best, b) => (b.length < best.length ? b : best), branches[0] ?? [])
    if (closest.length > 0) {
      for (const sub of closest) describeIssue(sub, root, out)
      return
    }
  }

  if (issue.code === 'invalid_enum_value') {
    const allowed = issue.options.map((o) => JSON.stringify(o)).join(', ')
    out.push(`- "${path}" : valeur ${received(root, issue.path)} interdite, valeurs autorisées : ${allowed}`)
    return
  }

  out.push(`- "${path}" : ${issue.message} (valeur reçue : ${received(root, issue.path)})`)
}

// Extrait la ZodError d'un rejet, qu'elle vienne de parsePatch
// (InvalidPatchError.cause) ou de l'application d'une operation
// (nodeSchema.parse leve directement une ZodError).
function zodErrorOf(err: unknown): ZodError | null {
  if (err instanceof ZodError) return err
  if (err instanceof InvalidPatchError && err.cause instanceof ZodError) return err.cause
  return null
}

export function describeRejectionForModel(err: unknown, rawResponse: string): string {
  const zod = zodErrorOf(err)
  if (zod === null) {
    return `- ${err instanceof Error ? err.message : String(err)}`
  }

  let root: unknown
  try {
    root = JSON.parse(extractFirstJsonObject(rawResponse))
  } catch {
    root = undefined
  }

  const lines: string[] = []
  for (const issue of zod.issues) describeIssue(issue, root, lines)
  const hidden = zod.issues.length - lines.length
  if (hidden > 0) lines.push(`- ... et ${hidden} autre(s) problème(s) du même genre`)
  return lines.join('\n')
}

export function buildCorrectionPrompt(originalPrompt: string, rawResponse: string, problems: string): string {
  return `${originalPrompt}

---

Ta réponse précédente a été REJETÉE. La voici :

${rawResponse}

Problèmes détectés (chemins relatifs à la racine de ton patch) :
${problems}

Renvoie le patch COMPLET corrigé (toutes les opérations, pas seulement celles qui posaient problème), au même format, en corrigeant chacun de ces problèmes et en respectant strictement les formes et valeurs autorisées décrites plus haut.`
}
