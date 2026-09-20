import SwiftUI

struct LoginScreen: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Bienvenue")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(Color(red: 0.0000, green: 0.0000, blue: 0.0000, opacity: 1.0000)) // black
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.9500, green: 0.9500, blue: 0.9600, opacity: 1.0000))
                .frame(width: 345, height: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(red: 0.8500, green: 0.8500, blue: 0.8700, opacity: 1.0000), lineWidth: 1)
                )
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.9500, green: 0.9500, blue: 0.9600, opacity: 1.0000))
                .frame(width: 345, height: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(red: 0.8500, green: 0.8500, blue: 0.8700, opacity: 1.0000), lineWidth: 1)
                )
            HStack(alignment: .center, spacing: 0) {
                Text("Se connecter")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1.0000)) // white
            }
            .frame(width: 345, height: 48)
            .background(Color(red: 0.2000, green: 0.4000, blue: 0.9000, opacity: 1.0000)) // primary
            .cornerRadius(12)
        }
        .padding(24)
        .frame(width: 393, height: 852)
        .background(Color(red: 1.0000, green: 1.0000, blue: 1.0000, opacity: 1.0000)) // white
    }
}
