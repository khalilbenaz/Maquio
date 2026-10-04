// Conversion de nom en PascalCase, partagee par les quatre exportateurs
// (classe Dart, composant React Native, struct SwiftUI, fonction
// Composable) : la meme regle de casse doit produire le meme nom de
// classe/fichier pour un meme Page.name, quelle que soit la cible.
//
// Un nom d'ecran vient de l'utilisateur (« Écran d'accueil », « 登录 »,
// « 2fa »), pas d'un identifiant : il doit toujours donner un identifiant
// valide dans les quatre langages cibles.

// Retire les accents (NFD puis suppression des marques combinantes) :
// « Écran » -> « Ecran » plutot que « cran » (l'accent etait traite comme
// un separateur et la lettre accentuee disparaissait).
export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const PAGE_FALLBACK = 'Screen'

function nameWords(input: string): string[] {
  return stripAccents(input)
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
}

export function toPascalCase(input: string): string {
  const pascal = nameWords(input)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  if (pascal === '') return PAGE_FALLBACK
  // Un identifiant ne peut pas commencer par un chiffre.
  return /^[0-9]/.test(pascal) ? `${PAGE_FALLBACK}${pascal}` : pascal
}

// camelCase : identifiants de fonctions / d'etats (showConfirmDialog).
export function toCamelCase(input: string): string {
  const pascal = nameWords(input)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
  if (pascal === '') return ''
  const camel = pascal[0]!.toLowerCase() + pascal.slice(1)
  return /^[0-9]/.test(camel) ? `n${camel}` : camel
}

// snake_case : noms de fichiers Dart (login_screen.dart).
export function toSnakeCase(input: string): string {
  const spaced = stripAccents(input).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_')
  const snake = spaced.toLowerCase().replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (snake === '') return PAGE_FALLBACK.toLowerCase()
  return /^[0-9]/.test(snake) ? `${PAGE_FALLBACK.toLowerCase()}_${snake}` : snake
}

// Fabrique un attributeur de noms de page SANS collision : deux pages dont
// les noms se normalisent pareil (« Accueil » et « accueil », ou deux
// « Home ») recevraient la meme classe et le meme fichier, et la seconde
// ecraserait la premiere. Le N-ieme doublon prend le suffixe N (Home2,
// home_2). La comparaison ignore la casse : certains systemes de fichiers
// (macOS, Windows) ne distinguent pas Home.kt de home.kt.
export function createPageNamer(): (name: string) => { pascal: string; snake: string } {
  const seen = new Map<string, number>()
  return (name) => {
    const pascal = toPascalCase(name)
    const snake = toSnakeCase(name)
    const key = pascal.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    if (count === 1) return { pascal, snake }
    return { pascal: `${pascal}${count}`, snake: `${snake}_${count}` }
  }
}
