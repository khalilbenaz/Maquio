# Bancs de vérification des exports

Ces projets minimaux servent à **compiler pour de vrai** le code produit par les
exportateurs (voir `test/integration/exports-compilables.test.ts`). Ils sont
copiés dans un dossier de travail (`~/.cache/maquio-verif`) : rien n'est écrit ici.

| Cible | Banc | Outil | Quand |
|---|---|---|---|
| Flutter | (paquet jetable, voir `flutter-analyze.test.ts`) | `flutter analyze` | toujours, si `flutter` est installé |
| SwiftUI | aucun projet | `swiftc -typecheck` | toujours, sur macOS |
| React Native | `rn/` | `tsc --strict` + `react-native`, `@types/react`, React Navigation | `MAQUIO_VERIF_FULL=1` (installe ~300 paquets npm au premier passage) |
| Compose | `compose/` | Gradle (`compileDebugKotlin`), AGP 8.9, Kotlin 2.1, Compose BOM 2025.06 | `MAQUIO_VERIF_FULL=1`, avec un SDK Android (`ANDROID_HOME`) et un JDK 17 |

```bash
MAQUIO_VERIF_FULL=1 npx vitest run test/integration/exports-compilables.test.ts
```

Sans Xcode (outils en ligne de commande seuls), le plugin de macros SwiftUI est
absent : `@State` ne se résout pas. Le test le détecte et substitue une copie
du wrapper (`VState`) uniquement pour la vérification — l'export, lui, émet
bien `@State`.
