# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ; le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.0.3] - 2026-10-05

### Corrigé
- Assistance Claude (Windows) : `spawn ENAMETOOLONG` sur un gros document ou lors d’une relance de correction. Le prompt est désormais transmis à `claude` par l’entrée standard, plus en argument de ligne de commande (limité à ~32 000 caractères sous Windows).
- Assistance Claude : le délai par appel passe de 2 à 10 minutes. Générer une application complète (plusieurs écrans et leurs interactions) prend plus de 2 minutes ; le bouton Annuler reste disponible.

## [1.0.2] - 2026-10-05

### Corrigé
- Assistance Claude (Windows) : l’erreur `EBUSY: resource busy or locked, rmdir` sur le dossier temporaire de Claude remplaçait la réponse. Le nettoyage réessaie et n’interrompt plus jamais la demande.
- Assistance Claude : `claude` est lancé sans les serveurs MCP de la configuration de l’utilisateur (`--strict-mcp-config`), inutiles sans outils ; chaque appel est aussi plus rapide.

## [1.0.1] - 2026-10-05

### Corrigé
- Assistance Claude : une réponse dont le patch était rejeté (par exemple une valeur `style.align` hors de `left`, `center`, `right`) faisait échouer toute la demande. Maquio renvoie désormais à Claude la liste précise des problèmes et lui demande de corriger son patch, jusqu’à deux fois.
- Assistance Claude : le prompt liste les valeurs autorisées des champs à valeurs fixes (alignement du texte, mode et alignements du layout, ajustement des images).

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
