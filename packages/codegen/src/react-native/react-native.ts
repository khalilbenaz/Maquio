// Stub d'exportateur React Native (Tache 7, decision 2 du brief) : le
// registre doit deja connaitre les quatre cibles, mais seul Flutter est
// implemente dans cette tache. La Tache 8 remplacera ce stub par le vrai
// generateur ; jusque-la, `export()` echoue fort plutot que de renvoyer un
// resultat vide ou trompeur.
import type { Exporter } from '../types'

export const reactNativeExporter: Exporter = {
  id: 'react-native',
  label: 'React Native',
  maturity: 'complete',
  export() {
    throw new Error('non implemente')
  },
}
