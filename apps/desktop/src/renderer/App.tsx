// Renderer minimal (Tache 14, decision 6) : affiche le nom du document
// courant et rien d'autre. Le canevas d'edition arrive a la Tache 15 ; ce
// composant n'anticipe pas dessus. Aucun acces au disque, au reseau ou a un
// sous-processus ici : tout cela passera par le preload (window.calque)
// quand les gestionnaires seront reellement cables.
export function App() {
  const nomDuDocument = 'Document sans titre'

  return (
    <main>
      <h1>Calque</h1>
      <p>{nomDuDocument}</p>
    </main>
  )
}
