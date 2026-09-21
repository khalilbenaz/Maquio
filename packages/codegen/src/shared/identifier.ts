// Regles communes de fabrication d'un identifiant valide (camelCase) a
// partir d'une chaine arbitraire -- id de noeud Figma ('1:1'), nom de
// token de design ('Brand/Primary 500')... -- partagees par tous les
// generateurs (Critical 1 et Critical 3 de la vague de correction finale).
//
// Un identifiant Dart, Kotlin, Swift ou JS/TS valide doit commencer par
// une lettre (ou `_`), jamais un chiffre : un id Figma comme '1:1' ('11'
// une fois les separateurs retires) produisait auparavant une cle
// `styles.11` -- syntaxiquement invalide dans les cinq langages cibles.
// Le meme decoupage en mots que l'ancien `toCamelCase` de rn-utils.ts est
// conserve (compatibilite de sortie sur toute chaine deja valide), avec
// deux ajouts : un prefixe quand le resultat commencerait par un chiffre,
// et un mecanisme d'unicite par compteur pour les appelants qui en ont
// besoin (cles de style derivees d'id, noms de token normalises).
const WORD_SEPARATORS = /[^a-zA-Z0-9]+/

function words(input: string): string[] {
  return input.split(WORD_SEPARATORS).filter((part) => part.length > 0)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

// camelCase valide en identifiant JS/TS/Dart/Kotlin/Swift : ne contient
// que des lettres et des chiffres, commence toujours par une lettre.
// `fallback` est utilise quand `input` ne contient aucun caractere
// alphanumerique (chaine vide, ou uniquement des separateurs).
export function toSafeIdentifier(input: string, fallback = 'value'): string {
  const parts = words(input)
  if (parts.length === 0) return fallback

  const [first, ...rest] = parts
  const head = first!.toLowerCase()
  const tail = rest.map(capitalize).join('')
  const candidate = `${head}${tail}`

  // Un premier "mot" purement numerique (id Figma '1:1' -> mot '1') laisse
  // `candidate` commencer par un chiffre : prefixe fixe plutot que de
  // produire un identifiant illegal ou de perdre l'information d'origine.
  return /^[a-zA-Z]/.test(candidate) ? candidate : `n${candidate}`
}

// Fabrique une fonction de normalisation a etat : chaque appel renvoie un
// identifiant valide ET jamais deja renvoye par cette meme fonction,
// repli sur un compteur numerique en cas de collision apres normalisation
// (ex. deux ids Figma distincts, ou deux noms de token distincts, qui se
// normalisent tous les deux en la meme chaine -- y compris une collision
// avec une cle de repli fixe comme 'root').
//
// `reservedWords` (D1 du rapport dart-correctness) traite un mot reserve
// de la langue cible EXACTEMENT comme une collision : un token nomme
// "Default" normalise en camelCase vers "default", identique au mot
// reserve Dart `default` -- `static const Color default = ...;` ne
// parse pas (verifie avec `dart analyze`, code de sortie 65 avant ce
// correctif). Repli sur le meme compteur numerique que pour une
// collision ordinaire ('default2'), jamais un prefixe special : un seul
// mecanisme de reprise, plus simple a auditer que deux.
//
// Vide par defaut : un appelant qui ne cible aucune langue a mots
// reserves genants en position de nom de membre (ex. React Native/JS, ou
// `colors.class` est un acces de propriete parfaitement legal) ne change
// jamais de sortie -- seuls les appelants Dart/Kotlin/Swift concernes
// passent un ensemble non vide.
export function createUniqueIdentifierNamer(
  fallback = 'value',
  reservedWords: ReadonlySet<string> = new Set(),
): (input: string) => string {
  const used = new Set<string>()
  return (input: string): string => {
    const base = toSafeIdentifier(input, fallback)
    let candidate = base
    let suffix = 2
    while (used.has(candidate) || reservedWords.has(candidate)) {
      candidate = `${base}${suffix}`
      suffix += 1
    }
    used.add(candidate)
    return candidate
  }
}
