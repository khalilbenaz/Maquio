// Construction du prompt envoye a Claude Code (Tache 12).
//
// Le prompt est en francais et contient : l'instruction de l'utilisateur, le
// document (ou la selection seule quand elle existe - jamais les deux, pour
// ne pas noyer le modele dans du contexte non pertinent), le schema des
// operations autorisees, une interdiction explicite de renvoyer un document
// complet, et les bornes du modele de donnees (couleurs 0..1, dimensions
// positives, rotation en degres) : un modele qui les ignore produit un
// patch que parsePatch/nodeSchema rejetteront de toute facon, autant les
// lui donner en amont.
import { findNode } from '@calque/core'
import type { CalqueDocument, Node } from '@calque/core'

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

Contraintes du modele de donnees a respecter dans "node", "patch" et "tokens" :
- les couleurs (r, g, b, a) sont des nombres entre 0 et 1, pas entre 0 et 255 ;
- les dimensions (largeur, hauteur, espacement, marges, rayon d'arrondi, epaisseur de trait, taille de police, interligne) doivent etre positives ou nulles ;
- la rotation est exprimee en degres, pas en radians.

Un patch qui ignore ces bornes sera rejete : respecte-les strictement.`
}
