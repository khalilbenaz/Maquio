// Construction du prompt envoye a Claude Code (Tache 12, defaut B corrige
// lors de la reparation du pont).
//
// Le prompt est en francais et contient : l'instruction de l'utilisateur, le
// document (ou la selection seule quand elle existe - jamais les deux, pour
// ne pas noyer le modele dans du contexte non pertinent), le schema des
// operations autorisees, une interdiction explicite de renvoyer un document
// complet, et les bornes du modele de donnees (couleurs 0..1, dimensions
// positives, rotation en degres).
//
// Defaut B (diagnostic reel, pas suppose) : ce fichier decrivait le
// VOCABULAIRE des operations (insertNode/updateNode/...) mais jamais la
// FORME d'un noeud. Appele avec le vrai binaire `claude`, ca a produit un
// noeud plausible mais invente -- x/y/width/height a plat, "fontSize" a
// plat, un type "rectangle" qui n'existe pas -- rejete par parsePatch avec
// des erreurs comme `["ops",0,"node","frame"] Required`. Le prompt fixe
// desormais, pour CHAQUE type de noeud, un exemple JSON complet et valide
// (voir prompt-examples.ts, derive des types du modele et revalide par
// nodeSchema a l'import), plus les regles qui ne se devinent pas depuis un
// seul exemple (les six types exacts, `frame` en objet imbrique, la
// structure d'un ecran).
import { findNode } from '@calque/core'
import type { CalqueDocument, Node } from '@calque/core'
import { NODE_EXAMPLES } from './prompt-examples'

function collectSelectedNodes(document: CalqueDocument, selectionIds: string[]): Node[] {
  const found: Node[] = []
  for (const id of selectionIds) {
    for (const page of document.pages) {
      const node = findNode(page.nodes, id)
      if (node !== null) {
        found.push(node)
        break
      }
    }
  }
  return found
}

const PATCH_FORMAT = `{
  "summary": "resume court de ce que fait le patch",
  "ops": [
    { "op": "insertNode", "parentId": "id du parent ou null pour la racine de la page", "index": 0, "node": { /* Node complet et valide */ } },
    { "op": "updateNode", "nodeId": "id du noeud", "patch": { /* champs a fusionner dans le noeud */ } },
    { "op": "deleteNode", "nodeId": "id du noeud" },
    { "op": "moveNode", "nodeId": "id du noeud", "parentId": "id du nouveau parent ou null", "index": 0 },
    { "op": "setTokens", "tokens": { /* colors/typography/spacing partiels */ } }
  ]
}`

// Un exemple JSON complet et valide par type de noeud (point 3 de la
// reparation du pont) : NODE_EXAMPLES vient de prompt-examples.ts, derive
// des types du modele et revalide par nodeSchema, jamais ecrit ici a la
// main. Chaque exemple est precede de son type au format attendu par
// "node.type" (pas un nom de fantaisie), pour que le lien entre le texte
// des regles ci-dessous et le JSON qui suit soit sans ambiguite.
const NODE_EXAMPLES_TEXT = NODE_EXAMPLES.map((node) => `"${node.type}" (exemple, id "${node.id}") :\n${JSON.stringify(node, null, 2)}`).join(
  '\n\n',
)

export function buildPrompt(input: { instruction: string; document: CalqueDocument; selectionIds: string[] }): string {
  const { instruction, document, selectionIds } = input

  const contexte =
    selectionIds.length > 0
      ? `Selection actuelle (noeuds : ${selectionIds.join(', ')}) :\n${JSON.stringify(collectSelectedNodes(document, selectionIds), null, 2)}`
      : `Document actuel :\n${JSON.stringify(document, null, 2)}`

  return `Tu es l'assistant d'edition integre a l'editeur d'interfaces mobiles Calque.

Instruction de l'utilisateur : ${instruction}

${contexte}

Reponds UNIQUEMENT avec un patch JSON decrivant les operations a appliquer au document, jamais un document complet : le contenu ci-dessus n'est fourni que pour contexte, et tout ce que tu ne modifies pas explicitement doit rester intact. N'inclus jamais les cles "version" ou "pages" au niveau racine de ta reponse, ce serait interprete comme une tentative de remplacer tout le document et serait rejete.

Format attendu (DocumentPatch), eventuellement dans un bloc de code :
${PATCH_FORMAT}

Le champ "node" de "insertNode", et le resultat de la fusion de "patch" dans "updateNode", doivent avoir EXACTEMENT la forme d'un des six types de noeud ci-dessous -- jamais une forme inventee, meme plausible. Il n'existe QUE ces six types, sous CES noms exacts : "frame", "text", "rect", "ellipse", "image", "line" (jamais "rectangle", "shape", ou toute autre variante).

Regles communes a tous les types, qui ne se devinent pas depuis un seul exemple :
- la position et la taille vivent TOUJOURS dans un objet imbrique "frame" : { "x", "y", "w", "h" } -- jamais "x"/"y"/"width"/"height" a plat sur le noeud ;
- un noeud "text" porte son contenu dans "characters" (jamais "text" ni "content"), et sa typographie dans un objet imbrique "style" : { "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "align" } -- jamais ces champs a plat sur le noeud ;
- les couleurs ("fills[].color", "strokes[].color", "style.color", "tokens.colors.*") sont des objets { "r", "g", "b", "a" } avec des composantes entre 0 et 1, jamais entre 0 et 255 ;
- toutes les dimensions (largeur, hauteur, espacement, marges, rayon d'arrondi, epaisseur de trait, taille de police, interligne) sont des nombres ENTIERS et POSITIFS ou nuls, jamais negatifs ni fractionnaires ;
- la rotation ("rotation") est exprimee en degres, jamais en radians ;
- un "id" et un "name" sont obligatoires sur chaque noeud, ainsi que "visible", "locked", "opacity" (0 a 1) ;
- un ECRAN n'est PAS un type de noeud a part : c'est une frame de PREMIER NIVEAU de la page qui porte un champ "device" ({ "id", "label", "width", "height", "pixelRatio" }, voir l'exemple "frame" nomme "Écran Accueil" ci-dessous) -- une frame imbriquee (pas de premier niveau) ne doit jamais porter "device".

Exemples complets, un par type, a suivre EXACTEMENT (mêmes cles, mêmes noms de cles, mêmes objets imbriques) :

${NODE_EXAMPLES_TEXT}

Contraintes du modele de donnees a respecter dans "node", "patch" et "tokens" :
- les couleurs (r, g, b, a) sont des nombres entre 0 et 1, pas entre 0 et 255 ;
- les dimensions (largeur, hauteur, espacement, marges, rayon d'arrondi, epaisseur de trait, taille de police, interligne) doivent etre entieres, positives ou nulles ;
- la rotation est exprimee en degres, pas en radians.

Un patch qui ignore ces bornes, ou qui invente une forme de noeud differente des exemples ci-dessus, sera rejete : respecte-les strictement.`
}
