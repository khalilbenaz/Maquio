// Politique de securite du contenu (CSP) du renderer, source unique : lue
// par index.html (copie litterale verifiee par test/security.test.ts) et par
// le plugin Vite du mode dev (vite.config.ts).
//
// Le renderer ne charge que ses propres scripts, n'ouvre aucune connexion
// reseau (tout le reseau passe par le processus main) et n'affiche d'images
// que locales (file:, data:) ou en HTTPS explicite -- jamais en http clair.
// `style-src 'unsafe-inline'` est requis par les attributs style de React
// (positions des noeuds du canevas) ; aucun script inline n'est autorise.
export function buildContentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    // Dev uniquement : le preambule React Refresh de Vite est un script inline.
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' file: data: https:",
    "font-src 'self' data:",
    dev ? "connect-src 'self' ws://localhost:5173 http://localhost:5173" : "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]
  return directives.join('; ')
}
