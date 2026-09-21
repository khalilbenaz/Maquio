// Double de CalqueApi pour les tests de composants (Tache 17, decision 9
// du brief) : chaque methode rend une valeur inerte (aucun reseau, aucun
// disque, aucun sous-processus). Les tests qui ont besoin d'un
// comportement precis surchargent la ou les methodes concernees avec un
// spread (`{ ...apiFactice, askClaude: ... }`), comme le fait le cahier
// des charges pour ClaudePanel.
import type { CalqueApi } from '../../src/shared/api'

export const apiFactice: CalqueApi = {
  openDocument: async () => null,
  saveDocument: async () => null,
  importFigma: async () => null,
  exportProject: async () => null,
  listExporters: async () => [
    { id: 'flutter', label: 'Flutter', maturity: 'complete' },
    { id: 'react-native', label: 'React Native', maturity: 'complete' },
    { id: 'swiftui', label: 'SwiftUI', maturity: 'preview' },
    { id: 'compose', label: 'Jetpack Compose', maturity: 'preview' },
  ],
  // Le plus inerte possible : rend un patch vide (aucune operation) et
  // renvoie le document recu tel quel, sans jamais fabriquer de nouveau
  // contenu ni dependre de l'instruction.
  askClaude: async ({ json }) => ({
    patchJson: JSON.stringify({ summary: 'Reponse de test (double inerte)', ops: [] }),
    documentJson: json,
  }),
  claudeAvailable: async () => true,
  getSettings: async () => ({
    hasFigmaToken: false,
    claudeAvailable: true,
    claudePath: '/usr/local/bin/claude',
    claudeCustomPath: null,
  }),
  setFigmaToken: async () => {},
  setClaudeCustomPath: async () => ({ claudeAvailable: true, claudePath: '/usr/local/bin/claude' }),
}
