// Historique de commandes annulables (Tache 5) : seul chemin de mutation
// d'un MaquioDocument dans tout le projet (canvas, inspecteur et patchs de
// Claude Code passeront tous par execute()).
//
// Chaque entree de pile associe le libelle de la commande executee a la
// commande OPPOSEE (celle qui, appliquee, annule ou retablit l'action).
// Cette commande opposee est toujours recalculee juste avant d'etre
// appliquee, a partir du document courant (double inversion) : undo()
// calcule la commande de retablissement via inverse.invert(current) avant
// d'appliquer inverse, et symetriquement pour redo(). Cela evite de coder
// deux fois la logique d'annulation/retablissement.
import type { Command } from './command'
import type { MaquioDocument } from '../model/types'

type StackEntry = { label: string; command: Command }

export class History {
  private current: MaquioDocument
  private undoStack: StackEntry[] = []
  private redoStack: StackEntry[] = []

  constructor(doc: MaquioDocument) {
    this.current = doc
  }

  get document(): MaquioDocument {
    return this.current
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // Du plus recent au plus ancien : alimente un menu Edition.
  get undoLabels(): string[] {
    return [...this.undoStack].reverse().map((e) => e.label)
  }

  execute(command: Command): void {
    // Regle du cahier des charges : invert() est calcule AVANT apply(), a
    // partir du document d'entree. Si apply() leve, on sort par l'exception
    // avant toute affectation : le document courant et les deux piles
    // restent exactement ceux d'avant (atomicite, point 3).
    const inverse = command.invert(this.current)
    const next = command.apply(this.current)
    this.current = next
    this.undoStack.push({ label: command.label, command: inverse })
    this.redoStack = []
  }

  undo(): void {
    const entry = this.undoStack[this.undoStack.length - 1]
    if (entry === undefined) return
    const redoCommand = entry.command.invert(this.current)
    const next = entry.command.apply(this.current)
    this.current = next
    this.undoStack.pop()
    this.redoStack.push({ label: entry.label, command: redoCommand })
  }

  redo(): void {
    const entry = this.redoStack[this.redoStack.length - 1]
    if (entry === undefined) return
    const undoCommand = entry.command.invert(this.current)
    const next = entry.command.apply(this.current)
    this.current = next
    this.redoStack.pop()
    this.undoStack.push({ label: entry.label, command: undoCommand })
  }
}
