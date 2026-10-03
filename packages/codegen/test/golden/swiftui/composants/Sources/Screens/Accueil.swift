import SwiftUI

struct Accueil: View {
    @EnvironmentObject private var navigator: Navigator
    @State private var tab1 = 0

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    Button {} label: {
                        HStack(spacing: 16) {
                            Image(systemName: "person")
                                .foregroundColor(.secondary)
                            VStack(alignment: .leading) {
                                Text("Alice")
                                Text("Bonjour !")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 16)
                    }
                        .buttonStyle(.plain)
                        .frame(width: 393, height: 72)
                    Button {} label: {
                        HStack(spacing: 16) {
                            Image(systemName: "person")
                                .foregroundColor(.secondary)
                            VStack(alignment: .leading) {
                                Text("Bruno")
                                Text("À demain")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 16)
                    }
                        .buttonStyle(.plain)
                        .frame(width: 393, height: 72)
                }
            }
            .frame(width: 393, height: 216)
            .clipped()
            .offset(x: 0, y: 0)
            .frame(width: 393, height: 216)
            Button {} label: {
                Image(systemName: "plus")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.9176, green: 0.8667, blue: 1.0000, opacity: 1.0000))
                .foregroundColor(Color(red: 0.1294, green: 0.0000, blue: 0.3647, opacity: 1.0000))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(radius: 4)
                .frame(width: 56, height: 56)
                .offset(x: 321, y: 634)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1.0000).ignoresSafeArea())
        .navigationTitle("Messages")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
        .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {} label: { Image(systemName: "magnifyingglass") }
                }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
                TabView(selection: $tab1) {
                    Color.clear
                        .tabItem { Label("Accueil", systemImage: "house") }
                        .tag(0)
                    Color.clear
                        .tabItem { Label("Connexion", systemImage: "person") }
                        .tag(1)
                }
                    .onChange(of: tab1) { _, index in
                        switch index {
                        case 0: navigator.switchTo(.accueil)
                        case 1: navigator.switchTo(.connexion)
                        default: break
                        }
                    }
                    .frame(width: 393, height: 80)
        }
    }
}
