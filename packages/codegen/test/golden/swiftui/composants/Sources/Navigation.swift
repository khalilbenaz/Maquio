import SwiftUI

enum Route: Hashable {
    case connexion
    case accueil
}

// Pile de navigation partagee : `go` empile un ecran, `switchTo` change
// d'onglet (l'ecran de depart est la racine de la pile), `back` depile.
final class Navigator: ObservableObject {
    @Published var path: [Route] = []
    let root: Route = .connexion

    func go(_ route: Route) {
        path.append(route)
    }

    func switchTo(_ route: Route) {
        path = route == root ? [] : [route]
    }

    func back() {
        if !path.isEmpty { path.removeLast() }
    }
}
