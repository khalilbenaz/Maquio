// Conversion de nom en PascalCase, partagee par les quatre exportateurs
// (classe Dart, composant React Native, struct SwiftUI, fonction
// Composable) : la meme regle de casse doit produire le meme nom de
// classe/fichier pour un meme Page.name, quelle que soit la cible. Extrait
// ici (Taches 8/9) plutot que laisse duplique dans flutter/dart-utils.ts,
// react-native/, swiftui/ et compose/.
export function toPascalCase(input: string): string {
  return input
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('')
}
