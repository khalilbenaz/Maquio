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
// tout le reste (2 arguments ou plus, ou un argument multi-lignes) est
// developpe avec une virgule finale par ligne, comme le ferait un
// developpeur Flutter a la main.
//
// Ce module ne tente PAS de deviner ici si un appel a plusieurs arguments
// tiendrait sur une seule ligne une fois `dart format` applique : au
// moment de construire un `Block`, sa colonne finale (indentation reelle +
// prefixe `cle: ` que l'appelant ajoutera via `attach`) n'est pas encore
// connue -- un meme Block peut d'ailleurs etre reattache a des
// profondeurs differentes selon son appelant. Une regle qui devine sans
// connaitre la colonne reelle ment au garde-fou `dart format
// --set-exit-if-changed` (Important 3, corrige apres qu'une premiere
// version de cette regle, basee sur un seuil de longueur arbitraire, s'est
// revelee fausse dans les deux sens sur des documents autres que la
// fixture temoin). Voir `collapseShortCalls` ci-dessous : le regroupement
// sur une ligne se decide en POST-TRAITEMENT, une fois le texte final
// entierement indente -- donc la colonne reelle enfin connue.
export function call(name: string, args: Arg[]): Block {
  if (args.length === 0) return [`${name}()`]
  if (args.length === 1 && args[0]!.block.length === 1) {
    const arg = args[0]!
    const prefix = arg.key ? `${arg.key}: ` : ''
    return [`${name}(${prefix}${arg.block[0]!})`]
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

// ---- Post-traitement : regroupement sur une ligne conscient de la
// colonne reelle (Important 3, correction apres re-revue) ----

const MAX_LINE_WIDTH = 80

// Neutralise le contenu des litteraux `'...'` (guillemet simple, seul
// delimiteur utilise par ce generateur -- voir escapeDartString) avant de
// compter les parentheses d'une ligne : un texte utilisateur comme
// `Text('Bienvenue (VIP)')` ne doit jamais etre confondu avec une
// parenthese structurelle. La longueur de la ligne masquee est preservee
// (meme nombre de caracteres), seul le CONTENU du texte importe ici.
function maskStringLiterals(line: string): string {
  return line.replace(/'(?:[^'\\]|\\.)*'/g, (match) => 'x'.repeat(match.length))
}

// Solde des parentheses d'une ligne (masquee) : +1 pour un `(` sans son
// `)`, -1 pour un `)` sans son `(`, 0 pour une ligne dont les parentheses
// s'equilibrent entre elles (ex. `color: const Color(0xFFFFFFFF),`). Ce
// generateur n'utilise jamais `(` ailleurs que pour un appel (jamais pour
// grouper une expression), donc ce solde suffit a suivre la profondeur
// d'imbrication sans analyser la grammaire Dart.
function parenBalance(maskedLine: string): number {
  let balance = 0
  for (const ch of maskedLine) {
    if (ch === '(') balance += 1
    else if (ch === ')') balance -= 1
  }
  return balance
}

// Une passe : cherche un groupe `Nom(` / lignes d'arguments plates
// (chacune neutre en parentheses -- donc aucune ne contient elle-meme un
// appel encore multi-lignes) / `)` fermant, et le reduit a une seule
// ligne si le resultat, a son indentation REELLE (deja gravee dans la
// ligne d'ouverture par tous les `attach` deja resolus), tient dans les
// `MAX_LINE_WIDTH` colonnes de `dart format`. Ne consomme jamais un
// groupe qui ne peut pas etre reduit : un appel imbrique encore
// multi-lignes a l'interieur disqualifie CE groupe (l'exterieur reste
// developpe, comme le ferait `dart format` pour un appel trop long), mais
// n'empeche pas ce meme appel imbrique d'etre repere et reduit a son tour
// plus loin dans le balayage.
function collapseOncePass(lines: readonly string[]): { lines: string[]; changed: boolean } {
  const out: string[] = []
  let changed = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const masked = maskStringLiterals(line)
    const isOpening = line.trimEnd().endsWith('(') && parenBalance(masked) === 1

    if (!isOpening) {
      out.push(line)
      i += 1
      continue
    }

    // Cherche la ligne fermante correspondante (solde qui revient a 0),
    // en verifiant au passage que chaque ligne intermediaire est plate
    // (solde individuel nul : ni ouverture ni fermeture d'un appel
    // imbrique encore developpe sur plusieurs lignes).
    let depth = 1
    let j = i + 1
    let flat = true
    while (j < lines.length && depth > 0) {
      const innerMasked = maskStringLiterals(lines[j]!)
      const innerBalance = parenBalance(innerMasked)
      const nextDepth = depth + innerBalance
      // La ligne qui ramene `depth` a 0 EST la fermeture de notre propre
      // groupe : son solde de -1 est attendu, pas le signe d'un appel
      // imbrique encore developpe -- ne doit jamais, a elle seule,
      // disqualifier ce groupe de la reduction sur une ligne.
      if (innerBalance !== 0 && nextDepth > 0) flat = false
      depth = nextDepth
      if (depth > 0) j += 1
    }

    const closingFound = depth === 0 && j < lines.length
    if (!closingFound || !flat || j === i + 1) {
      out.push(line)
      i += 1
      continue
    }

    const argLines = lines.slice(i + 1, j)
    const closingLine = lines[j]!
    const indentMatch = /^(\s*)/.exec(line)
    const indent = indentMatch ? indentMatch[1]! : ''
    const head = line.trim()
    const argsJoined = argLines.map((a) => a.trim().replace(/,$/, '')).join(', ')
    const tail = closingLine.trim()
    const candidate = `${indent}${head}${argsJoined}${tail}`

    if (candidate.length <= MAX_LINE_WIDTH) {
      out.push(candidate)
      changed = true
      i = j + 1
    } else {
      out.push(line)
      i += 1
    }
  }

  return { lines: out, changed }
}

// Point fixe de `collapseOncePass` : un regroupement peut raccourcir un
// appel imbrique au point qu'un appel ENGLOBANT, disqualifie a la
// premiere passe (parce que cet imbrique etait encore multi-lignes),
// tienne a son tour sur une ligne. Boucle bornee (la taille du fichier ne
// peut pas croitre, chaque passe reduit ou laisse inchange le nombre de
// lignes) plutot qu'un nombre d'iterations arbitraire.
export function collapseShortCalls(lines: readonly string[]): string[] {
  let current = [...lines]
  for (let iterations = 0; iterations < current.length + 1; iterations++) {
    const { lines: next, changed } = collapseOncePass(current)
    current = next
    if (!changed) break
  }
  return current
}
