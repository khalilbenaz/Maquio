// Types partages par tous les exportateurs de code (Tache 7).
//
// Chaque exportateur transforme un CalqueDocument en une liste de fichiers
// GARDES EN MEMOIRE : ce package n'ecrit jamais sur disque (decision 3), pour
// rester testable par simple comparaison de chaines et pour laisser
// l'ecriture reelle a l'application de bureau (Tache 17).
import type { CalqueDocument } from '@calque/core'

export type ExportedFile = { path: string; contents: string }

// Fichier a COPIER dans le projet exporte (image locale). `source` est le
// `src` du document (relatif aux ressources du document, ou absolu) ;
// `path` la destination relative a la racine du projet exporte.
export type ExportAsset = { source: string; path: string }

export type ExportResult = { files: ExportedFile[]; warnings: string[]; assets?: ExportAsset[] }

// `activeScreenId` : ecran de depart de la navigation generee (route
// initiale, `startDestination`, racine de la pile). TOUS les ecrans sont
// exportes ; absent ou inconnu, le premier ecran est l'ecran de depart.
export type ExportOptions = { projectName: string; nullSafety?: boolean; activeScreenId?: string; androidPackage?: string }

export type ExporterId = 'flutter' | 'react-native' | 'swiftui' | 'compose'

export interface Exporter {
  id: ExporterId
  label: string
  maturity: 'complete' | 'preview'
  export(doc: CalqueDocument, opts: ExportOptions): ExportResult
}
