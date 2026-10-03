import SwiftUI

@main
struct DemoApp: App {
    @StateObject private var navigator = Navigator()

    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $navigator.path) {
                Connexion()
                    .navigationDestination(for: Route.self) { route in
                        switch route {
                        case .connexion:
                            Connexion()
                        case .accueil:
                            Accueil()
                        }
                    }
            }
            .environmentObject(navigator)
        }
    }
}
