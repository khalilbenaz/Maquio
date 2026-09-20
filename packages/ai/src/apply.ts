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
import type { Command } from '@calque/core'
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
