# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.0] - 2026-10-04

Première version publique de Maquio, l'éditeur d'interfaces mobiles qui exporte vers le code natif.

### Ajouté
- Éditeur de bureau (Electron + TypeScript) : canevas, calques, inspecteur, auto-layout, zoom, groupes, composants réutilisables.
- Composants mobiles natifs (barre d'onglets, listes, champs, boutons, bascules...) avec palette et exemple `tous-les-composants`.
- Mode prototype : liens entre écrans, transitions (fondu, glissement, modale), appui long, parcours jouable à l'échelle 1:1.
- Export compilé vers quatre cibles : Flutter, React Native, SwiftUI et Jetpack Compose.
- Assistance Claude intégrée pour traduire et modifier une maquette depuis l'éditeur.
- Import et export Figma (fichier ou API) et plugin Figma « Import Maquio ».
- Thème clair, sombre ou suivant le système ; panneaux gauche, droit et Claude repliables.
- Format de document `.maquio` (lecture de l'ancien format `.calque` conservée) et exemple de prototype bancaire fictif « nacre ».
- Paquets de distribution : `.dmg` et `.zip` macOS universels, installeur Windows NSIS (x64 et arm64), `.AppImage` et `.deb` Linux x64, avec somme de contrôle SHA-256.

### Divers
- Licence MIT.
- Site de présentation sur GitHub Pages.
