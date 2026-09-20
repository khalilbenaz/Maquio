// Enregistre les matchers jest-dom (toBeInTheDocument, etc.) sur `expect`.
// Ce fichier est declare en setupFiles dans vitest.config.ts. Il est charge
// pour l'ensemble du run vitest (le fichier de config n'offre pas de
// setupFiles par glob), mais reste sans effet sur les tests de packages/**
// : les matchers ajoutes ici ne font quoi que ce soit qu'invoques sur un
// element DOM, ce qu'aucun test de packages/** ne fait puisque ces paquets
// tournent sous l'environnement Node (voir environmentMatchGlobs).
import '@testing-library/jest-dom/vitest'

// `globals: true` n'est pas active dans vitest.config.ts (les tests
// importent explicitement describe/it/expect), donc le nettoyage
// automatique de @testing-library/react (qui ne s'enregistre que s'il
// trouve un `afterEach` global) ne se declenche pas tout seul : on
// l'enregistre ici pour que chaque `render()` d'un test soit demonte avant
// le suivant (sinon les data-testid des rendus precedents s'accumulent dans
// le DOM jsdom partage entre les tests d'un meme fichier).
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
