// Normalisation des noms de tokens de design en identifiants d'emission
// (Critical 3 de la vague de correction finale).
//
// Un nom de token vient de Figma ("Brand/Primary 500", normalise en
// "brand-primary-500" par packages/figma/src/translate.ts) ou d'une
// edition Claude Code (packages/ai/src/patch.ts) : il reste lisible tel
// quel dans le modele, c'est une donnee de design que l'utilisateur voit
// et edite. La normalisation en identifiant appartient aux generateurs,
// au moment de l'emission -- jamais au modele, qui imposerait sinon a
// toutes les cibles la convention de la plus stricte d'entre elles.
//
// Reutilise l'algorithme partage par shared/identifier.ts (memes regles
// de decoupage et de depart par une lettre que pour les ids de noeud) :
// une constante Dart/Kotlin/Swift ou une cle d'objet TS accedee en
// notation pointee (`theme.colors.brandPrimary500`) doivent etre un
// identifiant valide dans les cinq langages consideres, ce qui rend une
// seule regle de casse (camelCase) suffisante ici -- voir le ruling du
// brief sur le lieu du correctif.
import { createUniqueIdentifierNamer } from './identifier'

// Associe chaque nom brut d'une categorie de tokens (colors, spacing OU
// typography -- jamais les trois ensembles, qui sont des espaces de noms
// Dart/TS distincts) a son identifiant normalise, unique au sein de cette
// categorie. Deterministe : l'ordre d'iteration de `names` (celui de
// `Object.keys`, stable pour des cles chaine non numeriques) fixe l'ordre
// de resolution des collisions.
export function buildTokenIdentifiers(names: Iterable<string>): ReadonlyMap<string, string> {
  const namer = createUniqueIdentifierNamer('token')
  const map = new Map<string, string>()
  for (const name of names) map.set(name, namer(name))
  return map
}

// Identifiant normalise d'un seul nom de token, recalcule a partir de
// l'ensemble de sa categorie pour garantir la meme resolution de
// collision qu'un appel a `buildTokenIdentifiers` sur ces memes noms
// (utilise par les generateurs qui n'ont, au point d'appel, qu'une seule
// couleur/valeur a resoudre -- ex. `colorExpr` d'un noeud -- mais doivent
// rester coherents avec le fichier de theme genere a partir du meme
// document).
export function tokenIdentifier(name: string, allNamesInCategory: Iterable<string>): string {
  const ids = buildTokenIdentifiers(allNamesInCategory)
  const id = ids.get(name)
  if (id === undefined) {
    throw new Error(`tokenIdentifier: "${name}" n'appartient pas a la categorie fournie`)
  }
  return id
}
