// Indentation a 4 espaces par niveau, partagee par SwiftUI et Compose
// (round de correction 1, Minor du coordinateur) : les deux generateurs
// composent leur sortie ligne par ligne avec la meme unite d'indentation
// (convention Swift/Kotlin standard), contrairement a React Native/Dart
// qui utilisent 2 espaces (TypeScript/Dart).
export function pad(depth: number): string {
  return '    '.repeat(depth)
}
