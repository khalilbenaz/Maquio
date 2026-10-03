import SwiftUI

struct Connexion: View {
    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 4) {
                Text("E-mail")
                    .font(.caption)
                    .foregroundColor(.secondary)
                HStack {
                    Image(systemName: "envelope")
                        .foregroundColor(.secondary)
                    TextField("nom@exemple.fr", text: .constant(""))
                }
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.gray))
            }
                .frame(width: 361, height: 56)
                .offset(x: 16, y: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text("Mot de passe")
                    .font(.caption)
                    .foregroundColor(.secondary)
                HStack {
                    Image(systemName: "lock")
                        .foregroundColor(.secondary)
                    SecureField("", text: .constant(""))
                }
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.gray))
            }
                .frame(width: 361, height: 56)
                .offset(x: 16, y: 144)
            Toggle("Se souvenir de moi", isOn: .constant(true))
                .frame(width: 361, height: 48)
                .offset(x: 16, y: 224)
            Button { navigator.go(.accueil) } label: {
                Text("Se connecter")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
                .buttonStyle(.borderedProminent)
                .frame(width: 361, height: 48)
                .offset(x: 16, y: 284)
            Button {} label: {
                Text("Mot de passe oublié")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
                .buttonStyle(.borderless)
                .frame(width: 361, height: 44)
                .offset(x: 16, y: 344)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1.0000).ignoresSafeArea())
        .navigationTitle("Connexion")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .navigationBarBackButtonHidden(true)
        .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {} label: { Image(systemName: "magnifyingglass") }
                }
        }
    }
}
