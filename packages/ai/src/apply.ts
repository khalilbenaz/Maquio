// Traduction d'un DocumentPatch en commandes du coeur (Tache 12).
//
// patchToCommands ne modifie JAMAIS le document elle-meme : elle rend une
// liste de Command deja construites, a charge de l'appelant de les executer
// via History (c'est ce qui rend un patch de Claude Code annulable comme
// n'importe quelle action humaine, cf. AiService.ask en Tache 13). Chaque
// operation est traduite vers la fabrique de commandes du coeur qui porte
// exactement sa semantique : c'est la ou vit deja la verification
// d'existence des noeuds (via findNode/NodeNotFoundError, appelee par
// invert() AVANT apply() dans History.execute()), on ne la duplique pas ici.
import {
  createNodeCommand,
  deleteNodeCommand,
  reparentNodeCommand,
  setTokensCommand,
  updateNodeCommand,
} from '@calque/core'
import type { CalqueDocument, Command } from '@calque/core'
import type { DocumentPatch, PatchOp } from './patch'

// PatchOp 'moveNode' porte (nodeId, parentId, index) : cette forme est celle
// de reparentNodeCommand (reparentage + position finale dans la fratrie),
// pas celle de moveNodeCommand du coeur (deplacement RELATIF en dx/dy, sans
// rapport avec le vocabulaire du patch).
function opToCommand(op: PatchOp, pageId: string): Command {
  switch (op.op) {
    case 'insertNode':
      return createNodeCommand(pageId, op.parentId, op.node, op.index)
    case 'updateNode':
      return updateNodeCommand(pageId, op.nodeId, op.patch)
    case 'deleteNode':
      return deleteNodeCommand(pageId, op.nodeId)
    case 'moveNode':
      return reparentNodeCommand(pageId, op.nodeId, op.parentId, op.index)
    case 'setTokens':
      return setTokensCommand(op.tokens)
  }
}

export function patchToCommands(patch: DocumentPatch, pageId: string): Command[] {
  return patch.ops.map((op) => opToCommand(op, pageId))
}

// Round de correction 1 (Critical) : patchToCommands + un simple
// `cmds.forEach(c => h.execute(c))` n'est PAS atomique pour un patch a
// plusieurs operations - chaque commande est executee (et empilee dans
// l'historique) independamment des autres par History.execute(). Si la
// operation N+1 echoue, les operations 1..N ont deja mute le document et
// l'historique n'est plus vierge, en violation de la decision 5 pour tout
// patch de plus d'une operation.
//
// patchToCommand construit ici une commande COMPOSITE qui applique toutes
// les operations du patch en tout ou rien : elle rejoue la sequence sur le
// document recu (jamais sur celui capture a la construction, pour rester
// correcte a travers un redo()) et ne rend le document final que si TOUTES
// les operations reussissent ; la premiere qui echoue - pour n'importe
// quelle raison, pas seulement une reference a un noeud inexistant - fait
// echouer apply() dans son ensemble, sans avoir mute quoi que ce soit
// (chaque commande interne rend un nouveau document immuable, jamais ne
// mute en place ; le document recu en entree reste donc intact).
//
// Elle prend le document en parametre pour valider IMMEDIATEMENT, avant de
// rendre une quelconque Command : un patch invalide leve ici, avant meme
// que l'appelant ait pu executer quoi que ce soit via History.
function applyAllOps(patch: DocumentPatch, pageId: string, document: CalqueDocument): CalqueDocument {
  let current = document
  for (const op of patch.ops) {
    current = opToCommand(op, pageId).apply(current)
  }
  return current
}

export function patchToCommand(patch: DocumentPatch, pageId: string, document: CalqueDocument): Command {
  // Validation immediate et eager : si une operation echoue, on leve ICI,
  // avant de rendre quoi que ce soit. Le resultat est jete (seul l'effet de
  // bord "ne leve pas" nous interesse a ce stade) ; apply() ci-dessous
  // recalculera le meme resultat a partir du document qu'il recoit reellement
  // au moment de l'execution.
  applyAllOps(patch, pageId, document)

  return {
    label: patch.summary,
    apply(doc: CalqueDocument): CalqueDocument {
      return applyAllOps(patch, pageId, doc)
    },
    invert(doc: CalqueDocument): Command {
      // `doc` est l'etat D'AVANT application (History appelle toujours
      // invert(current) puis apply(current) sur le meme `current`) : le
      // restaurer est une simple restitution en une seule etape, pas une
      // reconstruction operation par operation.
      return {
        label: patch.summary,
        apply(): CalqueDocument {
          return doc
        },
        invert(): Command {
          return patchToCommand(patch, pageId, doc)
        },
      }
    },
  }
}
