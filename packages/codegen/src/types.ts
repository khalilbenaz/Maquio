// Types partages par tous les exportateurs de code (Tache 7).
//
// Chaque exportateur transforme un CalqueDocument en une liste de fichiers
// GARDES EN MEMOIRE : ce package n'ecrit jamais sur disque (decision 3), pour
// rester testable par simple comparaison de chaines et pour laisser
// l'ecriture reelle a l'application de bureau (Tache 17).
import type { CalqueDocument } from '@calque/core'

export type ExportedFile = { path: string; contents: string }

export type ExportResult = { files: ExportedFile[]; warnings: string[] }

// `activeScreenId` (v2, addendum navigation §3.1/§7) : identifiant de
// l'ecran a exporter pour une page qui en contient plusieurs -- absent ou
// ne correspondant a aucun ecran de la page en cours, le premier ecran de
// cette page est exporte (voir selectActiveScreen dans
// shared/node-helpers.ts). Sans effet sur une page sans ecran (document v1
// non migre).
export type ExportOptions = { projectName: string; nullSafety?: boolean; activeScreenId?: string }

export type ExporterId = 'flutter' | 'react-native' | 'swiftui' | 'compose'

export interface Exporter {
  id: ExporterId
  label: string
  maturity: 'complete' | 'preview'
  export(doc: CalqueDocument, opts: ExportOptions): ExportResult
}
