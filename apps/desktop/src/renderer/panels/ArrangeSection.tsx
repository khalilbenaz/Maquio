// Section « Agencement » de l'inspecteur : ordre des calques, alignement,
// distribution, groupement, duplication, suppression. Les boutons appellent
// les memes actions que les raccourcis (state/arrangeActions.ts).
import type { ReactNode } from 'react'
import {
  alignSelection,
  canGroup,
  canUngroup,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  reorderSelection,
  ungroupSelection,
} from '../state/arrangeActions'

function Btn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="arrange-button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

export function ArrangeSection({ count }: { count: number }) {
  return (
    <section className="inspector-section" aria-label="Agencement">
      <h2>Agencement</h2>
      <div className="arrange-row" role="group" aria-label="Alignement">
        <Btn label="Aligner à gauche" onClick={() => alignSelection('left')}>⇤</Btn>
        <Btn label="Centrer horizontalement" onClick={() => alignSelection('hcenter')}>↔</Btn>
        <Btn label="Aligner à droite" onClick={() => alignSelection('right')}>⇥</Btn>
        <Btn label="Aligner en haut" onClick={() => alignSelection('top')}>⤒</Btn>
        <Btn label="Centrer verticalement" onClick={() => alignSelection('vcenter')}>↕</Btn>
        <Btn label="Aligner en bas" onClick={() => alignSelection('bottom')}>⤓</Btn>
      </div>
      <div className="arrange-row" role="group" aria-label="Distribution">
        <Btn label="Distribuer horizontalement" disabled={count < 3} onClick={() => distributeSelection('horizontal')}>⇹</Btn>
        <Btn label="Distribuer verticalement" disabled={count < 3} onClick={() => distributeSelection('vertical')}>⇳</Btn>
        <Btn label="Grouper" disabled={!canGroup()} onClick={groupSelection}>▣</Btn>
        <Btn label="Dégrouper" disabled={!canUngroup()} onClick={ungroupSelection}>▢</Btn>
      </div>
      <div className="arrange-row" role="group" aria-label="Ordre et copie">
        <Btn label="Premier plan" onClick={() => reorderSelection('front')}>⤒▲</Btn>
        <Btn label="Avancer" onClick={() => reorderSelection('forward')}>▲</Btn>
        <Btn label="Reculer" onClick={() => reorderSelection('backward')}>▼</Btn>
        <Btn label="Arrière-plan" onClick={() => reorderSelection('back')}>⤓▼</Btn>
        <Btn label="Dupliquer" onClick={duplicateSelection}>⧉</Btn>
        <Btn label="Supprimer" onClick={deleteSelection}>🗑</Btn>
      </div>
    </section>
  )
}
