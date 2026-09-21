# Calque

Calque est une application de bureau pour concevoir des interfaces mobiles
au drag & drop, sur un canvas type Figma. Elle importe une maquette Figma
existante comme point de départ, laisse Claude Code créer ou modifier
l'interface en langage naturel, puis exporte l'écran obtenu en code natif
(Flutter, React Native, SwiftUI, Jetpack Compose). Le document produit est
un fichier `.calque` — du JSON lisible, versionné, fait pour vivre dans un
dépôt à côté du code qu'il décrit.

## Ce que ça fait

- **Dessiner** une interface mobile au drag & drop sur un canvas — cadres,
  texte, rectangles, ellipses, images, lignes, mise en page absolue ou
  automatique (ligne/colonne), historique annuler/refaire.
- **Importer une maquette Figma**, depuis l'API REST Figma (avec un jeton
  personnel) ou depuis un fichier JSON exporté localement ; tout ce qui
  n'a pas d'équivalent (composant/variante aplati, vecteur complexe,
  opération booléenne) devient un espace réservé signalé, jamais perdu en
  silence.
- **Demander à Claude Code** de créer ou modifier l'interface en langage
  naturel, directement dans le document : la réponse est un patch validé
  par schéma, appliqué par le même mécanisme d'historique que les gestes
  de souris — donc annulable.
- **Exporter l'écran** vers quatre cibles mobiles : Flutter et React
  Native en générateurs complets, SwiftUI et Jetpack Compose en aperçu
  (voir [Export](#export) pour le détail de chaque cible).

## Démarrage rapide

Prérequis :

- Node.js 24 ou plus récent (`engines.node` dans `package.json`) ;
- npm (workspaces) ;
- pour *vérifier* le Dart produit par l'export Flutter (facultatif) : le
  SDK Flutter dans le `PATH`. Sans lui, les tests correspondants
  s'ignorent (`it.skip`) au lieu d'échouer.

```bash
npm install
npm test
npm run dev
```

`npm test` lance toute la suite (496 tests au moment de l'écriture, sans
écran, sans réseau et sans le binaire `claude`). `npm run dev` ouvre une
fenêtre Electron en mode développement — non lancé ici, à essayer en
local.

## Réglages

Le bouton **Réglages** de la barre d'outils ouvre un écran à deux
sections indépendantes.

### Jeton Figma

Pour importer depuis l'API Figma, il faut un jeton d'accès personnel :

1. dans Figma, ouvrir **Settings** (icône de compte en haut à gauche) ;
2. aller dans la section **Personal access tokens** ;
3. cliquer **Generate new token**, lui donner un nom, le générer ;
4. copier le jeton immédiatement — Figma ne le réaffiche plus ensuite.

Ce jeton se colle dans le champ correspondant (masqué, type mot de
passe) puis **Enregistrer**. Calque le chiffre avec `safeStorage`
d'Electron et l'écrit dans le dossier de données de l'application —
jamais dans le document `.calque`, jamais dans le dépôt. Une fois
enregistré, le jeton n'est plus jamais réaffiché : l'écran indique
seulement si un jeton est présent ou non. **Si le chiffrement du système
n'est pas disponible sur la machine courante, l'enregistrement est
refusé** et la raison s'affiche dans l'écran Réglages, plutôt que
d'écrire le jeton en clair.

### Connexion Claude Code

La même page affiche, dans une section séparée, l'état de la connexion à
Claude Code : trouvé (avec le chemin réellement résolu) ou introuvable, un
champ pour un chemin personnalisé vers le binaire `claude`, et un bouton
**Vérifier** qui relance la détection sans rien enregistrer.

Le chemin personnalisé est souvent nécessaire sur macOS quand
l'application est lancée depuis le Finder : une app packagée n'hérite pas
du `PATH` du shell de l'utilisateur, et un `claude` installé via un
gestionnaire de version (nvm, asdf...) ou dans un dossier hors des
emplacements standards reste invisible à la détection automatique tant
que son chemin n'est pas renseigné explicitement.

**Calque lance le binaire `claude` déjà installé sur la machine et
n'utilise, ne stocke ni ne transmet aucune clé d'API.** Si `claude` est
introuvable, le panneau Claude de l'interface se désactive avec un
message qui renvoie vers les Réglages, dès l'ouverture de l'application.

## Export

| Cible | Identifiant | Maturité |
|---|---|---|
| Flutter | `flutter` | complet |
| React Native | `react-native` | complet |
| SwiftUI | `swiftui` | aperçu (`preview`) |
| Jetpack Compose | `compose` | aperçu (`preview`) |

Chaque export écrit un fichier par écran (`Page`) plus un fichier de
thème issu des tokens de couleurs/typographie/espacements du document, et
rend un rapport (fichiers écrits, avertissements) affiché dans le
dialogue d'export.

Flutter et React Native couvrent l'ensemble des **types** de nœud du
modèle de document (mises en page absolues et automatiques, formes,
texte, image, thème) — « complet » qualifie cette couverture par type de
nœud, pas l'absence de toute limite : voir [Écarts connus](#écarts-connus-par-rapport-à-la-spec)
pour ce qu'elle ne garantit pas.

SwiftUI et Jetpack Compose partagent la même interface `Exporter` et le
même arbre parcouru que les deux générateurs complets, mais leur
couverture d'« aperçu » se limite précisément à **cinq types de nœud**
(`frame`, `text`, `rect`, `ellipse`, `image`) : tout autre type rencontré
n'est jamais rendu en silence — il produit l'avertissement `"<type> non
pris en charge par l export <id> (apercu)"`, identique au mot près entre
les deux générateurs. Ils existent dès la v1 pour que l'interface
`Exporter` soit validée par quatre implémentations réelles, pas une
seule.

Le Dart généré par l'export Flutter est vérifié par `flutter analyze`
dans la suite de tests d'intégration (`test/integration/flutter-analyze.test.ts`) :
un paquet Flutter jetable est construit avec les fichiers produits sur
plusieurs documents de test, et le test échoue à la moindre remontée de
l'analyseur — erreur, avertissement ou simple `info`, `flutter_lints`
compris. Au moment de l'écriture, cette vérification tourne sans aucune
remontée. Le test s'ignore (`it.skip`) si `flutter` est absent du `PATH`
plutôt que de faire dépendre toute la suite d'un SDK installé.

## Architecture

Le dépôt est un monorepo à quatre paquets de cœur plus une application, en
workspaces npm :

```
packages/
  core/          modele de document, geometrie, commandes, historique   (0 dependance Electron/React)
  figma/         client API Figma + traducteur Figma -> document Calque  (depend de core)
  codegen/       registre d'exportateurs + generateurs par framework     (depend de core)
  ai/            pont Claude Code : prompt -> patch de document          (depend de core)
apps/
  desktop/       Electron : main, preload, renderer React                (depend des 4 paquets ci-dessus)
```

**Règle de dépendance** :

- `packages/core` n'importe aucun autre paquet du dépôt ;
- `packages/figma`, `packages/codegen` et `packages/ai` n'importent que
  `@calque/core` ;
- aucun paquet de cœur (`core`, `figma`, `codegen`, `ai`) n'importe
  `electron`, `react` ni `react-dom` ;
- `apps/desktop/src/renderer` n'importe jamais `electron`, un module
  `node:*`, ni `@calque/figma`, `@calque/codegen` ou `@calque/ai` : le
  renderer ne touche jamais au disque, au réseau ni à un sous-processus
  directement — tout cela passe par le processus main via le preload
  (`window.calque`).

Cette règle est ce qui rend le monorepo testable et prévisible : le cœur
reste une bibliothèque de transformation de données pure, exécutable sous
Node seul, sans écran ; seule l'application de bureau connaît Electron et
React. Elle n'est pas seulement documentée : elle est **vérifiée par un
test exécutable**, `test/architecture.test.ts`, qui lit les fichiers
sources et fait échouer la suite en nommant le fichier et l'import fautif
dès qu'elle est violée.

## Le format `.calque`

Un document Calque est un fichier `.calque` : du JSON versionné
(`{ version, id, name, pages, tokens }`), sérialisé avec une
indentation lisible plutôt que minifié. Chaque page porte un appareil
cible (iPhone 15, Pixel 8, iPad mini) et un arbre de nœuds (`Frame`,
`Text`, `Rect`, `Ellipse`, `Image`, `Line`). Un document d'une version
plus récente que celle supportée n'est jamais lu partiellement — il est
refusé avec une erreur explicite plutôt que corrompu silencieusement.
Pensé pour être relu en revue de code à côté de l'interface qu'il décrit.

## Développer

```bash
npm test           # suite complete (Vitest) : sans ecran, sans reseau, sans binaire claude
npm run typecheck  # tsc --noEmit sur packages/ puis sur apps/desktop/ (deux configurations distinctes)
npm run build      # construit le renderer et le processus main/preload d'apps/desktop (Vite)
npm run dist       # construit puis empaquette l'application desktop (electron-builder, dossier non compresse)
npm run dev        # lance l'application desktop en mode developpement (ouvre une fenetre Electron)
```

Les tests vivent à côté du code qu'ils couvrent dans chaque paquet
(`packages/*/src`, `packages/*/test`), plus un dossier `test/` à la
racine pour ce qui traverse les paquets. La stratégie suit plusieurs
niveaux :

- **unitaire** — géométrie, commandes, historique, traducteur Figma ;
- **témoin** (*golden files*) — les quatre générateurs de code, comparés
  octet à octet à un fichier de sortie attendu (`packages/codegen/test/golden`) ;
- **composant** — canvas, inspecteur, panneau des calques, dialogues,
  avec Testing Library sous jsdom ;
- **intégration** (`test/integration/`) — Figma → document → code sur des
  fixtures réalistes, plus le garde-fou `flutter analyze` décrit plus
  haut ;
- **architecture** (`test/architecture.test.ts`) — la règle de dépendance
  entre paquets.

Les tests bout-en-bout Electron (Playwright) sont hors périmètre de la
v1 ; leur absence est assumée, pas un oubli.

## Ce que la v1 ne fait pas

YAGNI explicite (voir la spec de conception,
`docs/superpowers/specs/2026-09-20-calque-design.md`, §2). Sont hors
périmètre de la v1 :

- l'édition collaborative temps réel (multi-curseurs, présence) ;
- le versionnage cloud, les comptes utilisateurs, tout backend distant
  autre que l'API Figma ;
- les composants et variantes réutilisables au sens Figma (`COMPONENT`,
  `INSTANCE`, `variants`) — l'import les aplatit en frames ;
- l'édition vectorielle (nœuds de Bézier, opérations booléennes) ;
- le prototypage interactif (transitions entre écrans, animations) ;
- le réimport code → design (aller-retour) ;
- la publication, la signature et la distribution de l'app elle-même.

Chacun de ces points est un projet à part entière et aurait sa propre
spec.

## Écarts connus par rapport à la spec

Constatés en revue de branche, non corrigés dans cette vague (coût
assumé, à reprendre plus tard) :

- le champ `constraints` du §5.1 de la spec n'existe pas dans le modèle
  de document (`packages/core/src/model/types.ts`) — un objet qui en
  porte un est rejeté par le schéma de validation ;
- le générateur Flutter n'émet pas de `Scaffold` et produit une classe
  par page plutôt qu'un widget par frame nommée, contrairement à ce que
  décrit le §7 de la spec ;
- la première édition d'un nœud réordonne ses clés dans le fichier
  `.calque` (vérifié : un nœud fraîchement créé conserve l'ordre littéral
  de ses champs, une fois passé par une commande de modification ses
  clés sont réordonnées selon le schéma de validation) — le document
  reste lisible et valide, mais le premier `git diff` qui suit une
  édition est bruyant ;
- tout nœud `image` importé de Figma a `src: ''` (aucune URL d'asset
  n'est résolue par le traducteur), d'où `require('')`, `Image.asset('')`
  et `Image("")` émis **sans avertissement** par React Native, Flutter et
  SwiftUI — seul Jetpack Compose avertit (et n'émet rien) pour une image
  locale, faute de connaître le nom de paquet applicatif nécessaire à
  `R.drawable`.

La normalisation des noms de token en identifiant (Flutter) traite
désormais les mots réservés du langage cible (`class`, `default`,
`new`...) : un token ainsi nommé se voit attribuer un identifiant de
repli plutôt que de produire du Dart invalide — corrigé depuis la
précédente version de ce document, vérifié avec le vrai SDK Dart via
`flutter analyze`.

## Licence

Projet personnel, sans licence explicite pour l'instant.
