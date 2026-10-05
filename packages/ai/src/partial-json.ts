// Lecture d'un JSON INCOMPLET (reponse de Claude en cours d'ecriture, voir
// le dessin en direct dans app-pipeline.ts) : rend l'objet forme par toutes
// les valeurs deja TERMINEES, en ignorant celle qui s'ecrit (chaine coupee,
// cle sans valeur, objet ouvert dont on ne garde que les membres finis).
//
// Un seul passage : on retient le dernier « point de coupe » ou couper le
// texte puis fermer les conteneurs ouverts donne un JSON valide.
type Container = { kind: 'obj' | 'arr'; expectKey: boolean }

export function parsePartialJson(text: string): unknown {
  const start = text.indexOf('{')
  if (start === -1) return null

  const stack: Container[] = []
  let commit: { pos: number; closers: string } | null = null
  const closers = () =>
    stack
      .slice()
      .reverse()
      .map((c) => (c.kind === 'obj' ? '}' : ']'))
      .join('')
  const mark = (pos: number) => {
    commit = { pos, closers: closers() }
  }

  let i = start
  while (i < text.length) {
    const ch = text[i]!
    const top = stack[stack.length - 1]

    if (ch === '{' || ch === '[') {
      stack.push({ kind: ch === '{' ? 'obj' : 'arr', expectKey: ch === '{' })
      i++
      mark(i)
      continue
    }
    if (ch === '}' || ch === ']') {
      stack.pop()
      i++
      mark(i)
      if (stack.length === 0) break
      continue
    }
    if (ch === '"') {
      let j = i + 1
      let closed = false
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2
          continue
        }
        if (text[j] === '"') {
          closed = true
          break
        }
        j++
      }
      if (!closed) break
      i = j + 1
      // Une cle n'est pas une valeur : on ne coupe pas juste apres elle.
      if (top?.kind === 'obj' && top.expectKey) continue
      mark(i)
      continue
    }
    if (ch === ':') {
      if (top) top.expectKey = false
      i++
      continue
    }
    if (ch === ',') {
      if (top?.kind === 'obj') top.expectKey = true
      i++
      continue
    }
    if (/[-0-9tfn]/.test(ch)) {
      let j = i
      while (j < text.length && /[-+0-9.eEtrufalsn]/.test(text[j]!)) j++
      // Nombre ou litteral coupe en fin de texte : peut-etre incomplet.
      if (j >= text.length) break
      i = j
      mark(i)
      continue
    }
    i++
  }

  if (commit === null) return null
  const { pos, closers: fermetures } = commit as { pos: number; closers: string }
  try {
    return JSON.parse(text.slice(start, pos) + fermetures)
  } catch {
    return null
  }
}
