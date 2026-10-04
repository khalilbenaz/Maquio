// Registre des exportateurs de code (Tache 7). Les quatre cibles sont
// enregistrees des cette tache, dans cet ordre (decision 2 du brief) :
// flutter (complete), react-native (complete), swiftui (preview), compose
// (preview). Seul Flutter est reellement implemente ; les trois autres
// sont des stubs dont `export()` leve jusqu'aux Taches 8 et 9.
import { composeExporter } from './compose/compose'
import { flutterExporter } from './flutter/flutter'
import { reactNativeExporter } from './react-native/react-native'
import { swiftuiExporter } from './swiftui/swiftui'
import { svgExporter } from './svg/svg'
import { figmaExporter } from './figma/figma'
import type { Exporter, ExporterId } from './types'

const exporters: Exporter[] = [flutterExporter, reactNativeExporter, swiftuiExporter, composeExporter, svgExporter, figmaExporter]

export function listExporters(): Exporter[] {
  return exporters
}

export function getExporter(id: ExporterId): Exporter {
  const exporter = exporters.find((e) => e.id === id)
  if (!exporter) throw new Error(`Exportateur inconnu : ${id}`)
  return exporter
}
