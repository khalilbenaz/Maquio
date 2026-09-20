// Stub d'exportateur SwiftUI (Tache 7, decision 2 du brief). Voir
// react-native.ts pour le raisonnement : le registre connait deja les
// quatre cibles, seul Flutter est implemente ici. La Tache 9 remplacera ce
// stub par le vrai generateur.
import type { Exporter } from '../types'

export const swiftuiExporter: Exporter = {
  id: 'swiftui',
  label: 'SwiftUI',
  maturity: 'preview',
  export() {
    throw new Error('non implemente')
  },
}
