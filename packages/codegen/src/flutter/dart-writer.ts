// Petit assembleur de blocs Dart multi-lignes (Tache 7), sans dependance a
// un vrai formateur : le SDK Flutter / le binaire `dart` ne sont pas
// disponibles en test (contrainte du brief).
//
// Un `Block` est une liste de lignes RELATIVES a son propre debut : la
// premiere ligne commence a la colonne 0, les suivantes portent deja leur
// indentation relative au bloc. `attach` les replace a la profondeur
// voulue (en unites de 2 espaces) et ajoute un prefixe sur la premiere
// ligne / un suffixe sur la derniere, ce qui permet de composer des blocs
// les uns dans les autres sans jamais recalculer une indentation absolue a
// la main.
export type Block = string[]

export function lit(text: string): Block {
  return [text]
}

export function attach(prefix: string, block: Block, depth: number, suffix: string): Block {
  const pad = '  '.repeat(depth)
  return block.map((line, i) => {
    const withPrefix = i === 0 ? prefix + line : line
    const withSuffix = i === block.length - 1 ? withPrefix + suffix : withPrefix
    return pad + withSuffix
  })
}

export type Arg = { key?: string; block: Block }

// Rend un appel `Nom(arg1: v1, arg2: v2, ...)`. Un appel a un seul
// argument dont la valeur tient sur une ligne reste sur une seule ligne
// (ex. `SizedBox(height: 16)`, `ColorScheme.fromSeed(seedColor: ...)`) ;
// un appel a PLUSIEURS arguments dont chacun tient sur une seule ligne
// reste egalement sur une seule ligne si l'ensemble reste tres court (ex.
// `Border.all(color: ..., width: 1)`) -- c'est le choix de `dart format`
// lui-meme (Important 3, garde-fou `dart format --set-exit-if-changed`) :
// sans cette regle, ce garde-fou reecrirait un tel appel et ferait
// echouer le test des qu'un SDK Dart est present. Le seuil, bien en-deca
// de 80 colonnes, laisse de la marge pour l'indentation et le prefixe
// `cle: ` que l'appelant ajoutera via `attach`, inconnus a ce point.
// Tout le reste (un argument multi-lignes, ou un total trop long) est
// developpe avec une virgule finale par ligne, comme le ferait un
// developpeur Flutter a la main.
const SINGLE_LINE_CALL_MAX_LENGTH = 60

export function call(name: string, args: Arg[]): Block {
  if (args.length === 0) return [`${name}()`]
  if (args.length === 1 && args[0]!.block.length === 1) {
    const arg = args[0]!
    const prefix = arg.key ? `${arg.key}: ` : ''
    return [`${name}(${prefix}${arg.block[0]!})`]
  }
  if (args.every((arg) => arg.block.length === 1)) {
    const parts = args.map((arg) => `${arg.key ? `${arg.key}: ` : ''}${arg.block[0]!}`)
    const candidate = `${name}(${parts.join(', ')})`
    if (candidate.length <= SINGLE_LINE_CALL_MAX_LENGTH) return [candidate]
  }
  const lines: Block = [`${name}(`]
  for (const arg of args) {
    lines.push(...attach(arg.key ? `${arg.key}: ` : '', arg.block, 1, ','))
  }
  lines.push(')')
  return lines
}

// Rend une liste litterale `[item1, item2, ...]`, toujours developpee (une
// entree par ligne, virgule finale) car c'est le seul cas d'usage ici
// (listes d'enfants de widgets, potentiellement longues).
export function list(items: Block[]): Block {
  if (items.length === 0) return ['[]']
  const lines: Block = ['[']
  for (const item of items) {
    lines.push(...attach('', item, 1, ','))
  }
  lines.push(']')
  return lines
}
