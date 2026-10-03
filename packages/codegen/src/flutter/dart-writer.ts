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

// Rend un appel `Nom(arg1: v1, arg2: v2, ...)`, TOUJOURS developpe (une
// ligne par argument, virgule finale), comme le ferait un developpeur
// Flutter a la main avant passage de `dart format`.
//
// Ce module ne tente PAS de deviner ici si un appel tiendrait sur une
// seule ligne une fois `dart format` applique : au moment de construire
// un `Block`, sa colonne finale (indentation reelle + prefixe `cle: ` que
// l'appelant ajoutera via `attach`) n'est pas encore connue -- un meme
// Block peut d'ailleurs etre reattache a des profondeurs differentes
// selon son appelant. Une regle qui devine sans connaitre la colonne
// reelle ment au garde-fou `dart format --set-exit-if-changed`.
//
// Correction D3 (rapport dart-correctness-report.md) : une premiere
// version de cette regle devinait sur un seuil de longueur arbitraire
// (fausse dans les deux sens, Important 3 de la vague de correction
// finale) ; la version suivante gardait encore un repli special pour
// l'appel a UN SEUL argument tenant lui-meme sur une ligne (ex.
// `BoxDecoration(color: ...)`), rendu immediatement sur une seule ligne
// SANS jamais consulter la colonne reelle -- exactement la meme faute
// que le seuil arbitraire, simplement deguisee en cas particulier. A
// grande profondeur d'imbrication (`decoration: BoxDecoration(color:
// const Color(0xFF000000)),` a la colonne 90 dans un cas mesure avec
// `dart format --set-exit-if-changed` sur 120 documents), ce repli
// produisait une ligne trop longue que rien ne venait plus jamais
// re-decouper : `collapseShortCalls` ne fait QUE regrouper, jamais
// l'inverse. Seule la suppression complete de ce repli garantit qu'AUCUNE
// decision de mise en ligne n'est prise avant que la colonne reelle soit
// connue : tout appel, quel que soit son nombre d'arguments, part
// developpe, et seul `collapseShortCalls` (post-traitement, texte deja
// indente a sa profondeur reelle) decide de le regrouper -- ou renonce si
// la colonne resultante depasse `MAX_LINE_WIDTH`, laissant alors un Dart
// plus verbeux mais jamais un garde-fou qui ment.
export function call(name: string, args: Arg[]): Block {
  if (args.length === 0) return [`${name}()`]
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

// Solde des delimiteurs d'une ligne (masquee) : +1 pour un `(` ou un `[`
// sans sa fermeture, -1 pour un `)` ou un `]` sans son ouverture, 0 pour
// une ligne dont les delimiteurs s'equilibrent entre eux (ex. `color:
// const Color(0xFFFFFFFF),`). Ce generateur n'utilise jamais `(` ailleurs
// que pour un appel (jamais pour grouper une expression) NI `[` ailleurs
// que pour une liste litterale (`list()` ci-dessous), donc ce solde
// suffit a suivre la profondeur d'imbrication sans analyser la grammaire
// Dart.
//
// Correction D2 (rapport dart-correctness) : `[`/`]` etaient auparavant
// ignores ici, donc invisibles a `flat` plus bas -- une ligne `children:
// [` (parenthese-neutre : aucun `(`/`)`) se faisait compter comme une
// ligne "plate" alors qu'elle ouvre une liste PAS refermee sur cette
// meme ligne. Un groupe englobant (ex. `Row(...)`) pouvait alors
// l'aspirer dans un regroupement sur une seule ligne, produisant `Row(
// children: [, Foo(), ])` -- un `[,` qui ne parse pas (reproduit et
// verifie avec `dart analyze` avant ce correctif). Compter `[`/`]`
// exactement comme `(`/`)` fait remonter ce desequilibre jusqu'a `flat`,
// qui disqualifie alors correctement le groupe (memes garanties que pour
// un appel imbrique encore developpe).
function parenBalance(maskedLine: string): number {
  let balance = 0
  for (const ch of maskedLine) {
    if (ch === '(' || ch === '[') balance += 1
    else if (ch === ')' || ch === ']') balance -= 1
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
    const trimmedEnd = line.trimEnd()
    const isOpening = (trimmedEnd.endsWith('(') || trimmedEnd.endsWith('[')) && parenBalance(masked) === 1

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
  return wrapLongArrows(current)
}

// `dart format` coupe une fonction fleche trop longue apres `=>` et indente la
// suite de 4 colonnes par rapport a la ligne (`onPressed: () =>` puis
// l'expression). Les rappels de navigation (`() => Navigator.of(context)
// .pushNamed('/x')`) depassent facilement 80 colonnes a une profondeur
// d'imbrication reelle : on reproduit cette coupure plutot que de laisser
// une ligne que le formateur reecrirait.
const ARROW_LINE = /^(\s*)((?:\w+: )?\([^()]*\) =>) (.+?)(,?)$/

function wrapLongArrows(lines: readonly string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const match = line.length > MAX_LINE_WIDTH ? ARROW_LINE.exec(line) : null
    if (match === null || parenBalance(maskStringLiterals(match[3]!)) !== 0) {
      out.push(line)
      continue
    }
    out.push(`${match[1]}${match[2]}`, `${match[1]}    ${match[3]}${match[4]}`)
  }
  return out
}
