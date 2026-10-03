// Traduction generique d'erreur en message francais actionnable (Tache 17,
// correction round 1 : Critical). Contrairement a src/shared/api.ts (qui ne
// doit rien importer du tout), ce fichier peut dependre de `zod` -- une
// dependance de donnees pure, ni Electron ni React -- pour reconnaitre les
// erreurs de validation (`ZodError`) et ne JAMAIS les laisser fuiter telles
// quelles vers l'interface (leur `.message` par defaut est un dump JSON
// technique, illisible et non actionnable pour un utilisateur).
//
// Utilisee par les quatre gestionnaires du main (documentHandlers,
// exportHandlers, figmaHandlers, claudeHandlers) ET par ClaudePanel cote
// renderer (qui appelle aussi parseDocument localement, sur la reponse
// d'askClaude) : c'est pour ca qu'elle vit dans src/shared/, le seul
// dossier que les trois cotes de l'application peuvent tous importer.
//
// Discipline (decision 4 du brief) : chaque appelant reconnait d'abord SES
// PROPRES erreurs nommees (DocumentVersionError, FigmaAuthError, etc.) et
// rend leur message tel quel, SANS repasser par cette fonction -- leur
// message est deja complet et francais, le prefixer a nouveau produirait un
// double prefixe (corrige ici : voir le Minor du round de correction 1 sur
// figmaHandlers.ts). Cette fonction n'est appelee qu'en dernier recours,
// pour tout ce qui n'est pas une erreur nommee reconnue par l'appelant.
import { ZodError, type ZodIssue } from 'zod'

function decrireChemin(path: (string | number)[]): string {
  if (path.length === 0) return 'racine du contenu'
  let resultat = ''
  for (const segment of path) {
    if (typeof segment === 'number') {
      resultat += `[${segment}]`
    } else {
      resultat += resultat === '' ? segment : `.${segment}`
    }
  }
  return resultat
}

// Reformule chaque code d'erreur Zod en une phrase francaise, sans jamais
// reprendre le code technique lui-meme (ex. "invalid_type") ni le message
// par defaut de Zod (en anglais).
function decrireProbleme(issue: ZodIssue): string {
  const chemin = decrireChemin(issue.path)
  switch (issue.code) {
    case 'invalid_type':
      return `la propriété "${chemin}" devrait être de type ${issue.expected} (valeur reçue de type ${issue.received})`
    case 'invalid_literal':
      return `la propriété "${chemin}" a une valeur inattendue`
    case 'unrecognized_keys':
      return `des propriétés inconnues sont présentes (${issue.keys.join(', ')})`
    case 'invalid_union':
      return `la propriété "${chemin}" ne correspond à aucune des formes attendues`
    case 'invalid_union_discriminator':
      return `la propriété "${chemin}" a une valeur de type non reconnue`
    case 'invalid_enum_value':
      return `la propriété "${chemin}" a une valeur non autorisée`
    case 'invalid_date':
      return `la propriété "${chemin}" n'est pas une date valide`
    case 'invalid_string':
      return `la propriété "${chemin}" n'a pas le format attendu`
    case 'too_small':
      return `la propriété "${chemin}" est trop petite`
    case 'too_big':
      return `la propriété "${chemin}" est trop grande`
    case 'not_multiple_of':
      return `la propriété "${chemin}" n'est pas un multiple valide`
    case 'not_finite':
      return `la propriété "${chemin}" doit être un nombre fini`
    default:
      return `la propriété "${chemin}" est invalide`
  }
}

function decrireZodError(err: ZodError): string {
  const [premier, ...reste] = err.issues
  if (premier === undefined) return 'le contenu ne correspond pas au format attendu'
  const suffixe = reste.length > 0 ? ` (et ${reste.length} autre(s) probleme(s))` : ''
  return `le contenu est mal formé : ${decrireProbleme(premier)}${suffixe}`
}

// Traduit une erreur QUELCONQUE (non reconnue par l'appelant) en un message
// francais actionnable, prefixe par son contexte (ex. "Fichier .calque
// invalide", "Export impossible") -- jamais un dump JSON de ZodError, jamais
// le SyntaxError brut de JSON.parse (en anglais, illisible pour qui n'est
// pas developpeur).
export function translateUnknownError(err: unknown, contexte: string): Error {
  if (err instanceof ZodError) {
    return new Error(`${contexte} : ${decrireZodError(err)}`)
  }
  if (err instanceof SyntaxError) {
    return new Error(`${contexte} : contenu JSON illisible`)
  }
  if (err instanceof Error) {
    return new Error(`${contexte} : ${err.message}`)
  }
  return new Error(`${contexte} : erreur inconnue`)
}

// Message affichable d'une erreur recue du processus principal : Electron
// prefixe les erreurs IPC (« Error invoking remote method 'canal': Error: »),
// bruit technique que l'utilisateur ne doit jamais lire.
export function messageOfError(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err)
  return brut.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}
