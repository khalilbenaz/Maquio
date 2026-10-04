<p align="center"><img src="assets/brand/maquio-logotype.png" alt="maquio — De la maquette au code natif." width="420"></p>

# Maquio

Maquio est une application de bureau pour concevoir des interfaces mobiles
au drag & drop, sur un canvas type Figma. Elle importe une maquette Figma
existante comme point de départ, laisse Claude Code créer ou modifier
l'interface en langage naturel, puis exporte l'écran obtenu en code natif
(Flutter, React Native, SwiftUI, Jetpack Compose). Le document produit est
un fichier `.maquio` — du JSON lisible, versionné, fait pour vivre dans un
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
- **Assembler avec des composants mobiles sémantiques** : une palette de
  30 composants et 7 conteneurs (boutons, champs, cases, interrupteurs,
  curseurs, listes déroulantes, dates, icônes, avatars, cartes, listes,
  grilles, barre d'application, barre de navigation, onglets, tiroir,
  dialogues, feuilles basses, snackbars, Row / Column / Stack...), avec
  recherche, glisser-déposer et propriétés éditables et annulables. Voir
  [Composants mobiles](#composants-mobiles).
- **Prototyper** : chaque élément peut porter des interactions (appui, appui
  long, délai) qui naviguent, reviennent en arrière, ouvrent ou ferment un
  dialogue, une feuille basse ou un snackbar, ou ouvrent une URL, avec une
  transition (aucune, glissement, poussée, fondu, modale ; durée et courbe).
  Les liens sont tracés en flèches sur le canvas, et le bouton ▶ « Prototype »
  (Cmd/Ctrl+Entrée, Échap pour quitter) joue le parcours en plein écran.
- **Travailler à l'aise** : tous les panneaux (calques, inspecteur, Claude) se
  replient (Cmd/Ctrl+Alt+1, Cmd/Ctrl+Alt+2, Cmd/Ctrl+J), se redimensionnent,
  le mode focus (Cmd/Ctrl+.) ne laisse que le canvas ; thème clair, sombre ou
  système (menu Affichage ou Réglages) ; tout est mémorisé.
- **Exporter TOUS les écrans** avec leur navigation vers quatre cibles
  mobiles : Flutter et React Native en générateurs complets, SwiftUI et
  Jetpack Compose en aperçu (voir [Export](#export) pour le détail de chaque
  cible).

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

`npm test` lance toute la suite (près de 900 tests au moment de l'écriture, sans
écran, sans réseau et sans le binaire `claude` — voir plus bas pour le
test bout-en-bout opt-in qui, lui, appelle le vrai binaire). `npm run dev` ouvre une
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
passe) puis **Enregistrer**. Maquio le chiffre avec `safeStorage`
d'Electron et l'écrit dans le dossier de données de l'application —
jamais dans le document `.maquio`, jamais dans le dépôt. Une fois
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

**Maquio lance le binaire `claude` déjà installé sur la machine et
n'utilise, ne stocke ni ne transmet aucune clé d'API.** Si `claude` est
introuvable, le panneau Claude de l'interface se désactive avec un
message qui renvoie vers les Réglages, dès l'ouverture de l'application.

Chaque appel s'exécute dans un **répertoire de travail temporaire et
vide**, créé par Maquio puis supprimé juste après (jamais le dossier de
l'utilisateur, jamais celui du document ouvert) : lancé sans ce
répertoire neutre, `claude -p` hérite du répertoire courant du processus
et, dans un dossier de projet, part l'explorer (mémoire, hooks, contexte
de session) au lieu de répondre — constaté en conditions réelles, un même
appel se termine en 13 secondes depuis un répertoire neutre contre plus
de 10 minutes, jamais terminé, depuis le dossier du dépôt. L'appel est
par ailleurs plafonné à **2 minutes** (largement au-dessus du régime sain
observé) et interrompu au-delà avec un message explicite ; le panneau
affiche un état d'attente pendant l'appel et un bouton **Annuler** qui
l'interrompt réellement, côté sous-processus, pas seulement côté
interface.

## Composants mobiles

Un bouton n'est plus un rectangle avec du texte : le modèle porte des
composants **sémantiques**, exportés vers le widget natif de chaque cible.
Onglet **Composants** de la colonne de gauche : sept familles, recherche
(libellé, famille ou nom natif : `toggle`, `scaffold`, `TextField`...),
glisser-déposer sur le canevas ou clic. La barre d'application, la barre de
navigation basse, le bouton flottant, le tiroir, la feuille basse, le dialogue
et le snackbar se placent d'eux-mêmes à leur emplacement naturel dans l'écran.

| Famille | Composants | Flutter | React Native | SwiftUI | Compose |
|---|---|---|---|---|---|
| Actions | Button (primaire / secondaire / texte, désactivé, icône), IconButton, FAB (petit / grand / étendu) | ElevatedButton / OutlinedButton / TextButton, IconButton, FloatingActionButton | Pressable | Button (.borderedProminent / .bordered / .borderless) | Button / OutlinedButton / TextButton, FilledIconButton, FloatingActionButton |
| Saisie | TextField (libellé, indication, mot de passe, multiligne, erreur), Checkbox, Switch, Radio, Slider, Dropdown, DatePicker | TextField, Checkbox, Switch, RadioGroup, Slider, DropdownButtonFormField, showDatePicker | TextInput, Switch, `@react-native-community/slider`, `@react-native-picker/picker`, `datetimepicker` | TextField / SecureField, Toggle, Slider, Picker, DatePicker | OutlinedTextField, Checkbox, Switch, RadioButton, Slider, ExposedDropdownMenuBox, DatePickerDialog |
| Affichage | Icon, Avatar, Badge, Chip, Divider, Card, ProgressBar, Spinner | Icon, CircleAvatar, Badge, ActionChip / FilterChip, Divider, Card, LinearProgressIndicator, CircularProgressIndicator | MaterialIcons, View, ActivityIndicator | Image(systemName:), ProgressView | Icon, Badge, AssistChip / FilterChip, HorizontalDivider, Card, LinearProgressIndicator |
| Listes | ListTile, ListView, Grid, ScrollView | ListTile, ListView, GridView.count, SingleChildScrollView | Pressable, ScrollView, flexWrap | ScrollView + LazyVStack, LazyVGrid | ListItem, LazyColumn / LazyRow, LazyVerticalGrid |
| Navigation | AppBar, BottomNavigationBar, Tabs, Drawer, lien « au clic, aller à l'écran X » | Scaffold(appBar, bottomNavigationBar, drawer), TabBar, Navigator.pushNamed | en-tête View, barre View, tiroir à état local, React Navigation | navigationTitle + toolbar, TabView, NavigationStack | Scaffold(topBar, bottomBar), TabRow, ModalNavigationDrawer, NavHost |
| Mise en page | Row, Column, Stack (frames en auto-layout), SafeArea, Spacer | Row / Column / Stack, SafeArea, Spacer | flexbox, SafeAreaView | HStack / VStack / ZStack, Spacer | Row / Column / Box, safeDrawingPadding, Spacer(weight) |
| Overlays | Dialog, BottomSheet, Snackbar | AlertDialog, BottomSheet, Material | Modal, View | `.alert`, `.sheet` + détents, vue | AlertDialog, ModalBottomSheet, Snackbar |

Icônes : un jeu commun de 30 pictogrammes, mappé vers Material Icons
(Flutter, React Native), SF Symbols (SwiftUI) et `Icons.Default.*` de
`material-icons-core` (Compose). Couleurs : sans choix explicite, celles du
thème Material 3 de la cible.

Dans le modèle, un composant est un nœud `component` (`kind` + `props`
validées par `kind`, jamais d'enfants) ; un conteneur est une `frame` qui porte
`container` (carte, liste, grille, zone défilante, zone sûre, feuille basse,
tiroir) — l'arbre, l'historique et le reparentage n'ont donc qu'un type de
conteneur. La mise en page automatique (Row, Column, grille) est matérialisée
dans le document, dans la même entrée d'historique que la commande qui la
provoque : le canevas montre ce que l'export génère. Le catalogue unique
(`packages/core/src/components/catalog.ts`) alimente la palette, l'inspecteur,
les valeurs par défaut et le prompt de l'assistant.

Un projet d'exemple contenant TOUS les composants (3 écrans reliés, barre,
tiroir, barre basse, dialogue...) est livré dans
`exemples/tous-les-composants.maquio`.

## Export

| Cible | Identifiant | Maturité |
|---|---|---|
| Flutter | `flutter` | complet |
| React Native | `react-native` | complet |
| SwiftUI | `swiftui` | aperçu (`preview`) |
| Jetpack Compose | `compose` | aperçu (`preview`) |

Chaque export écrit un fichier par écran, un fichier de thème issu des
tokens, et — dès que le document a des écrans — les fichiers de **navigation** :
TOUS les écrans sont exportés (l'écran actif ne fait que choisir l'écran de
départ). Un écran devient un `Scaffold` (ou son équivalent) quand il contient
une barre d'application, une barre basse, un bouton flottant ou un tiroir.

| Cible | Point d'entrée et routes | Dépendances à ajouter |
|---|---|---|
| Flutter | `lib/main.dart` : `MaterialApp(routes:, initialRoute:)` ; `Navigator.pushNamed` | Flutter ≥ 3.35 (`RadioGroup`) |
| React Native | `App.tsx` (pile native), `src/navigation.ts` (types de routes) ; `navigation.navigate()` | `@react-navigation/native`, `native-stack`, `react-native-screens`, `react-native-safe-area-context`, `react-native-vector-icons`, `@react-native-community/slider`, `@react-native-picker/picker`, `@react-native-community/datetimepicker` |
| SwiftUI | `Sources/App.swift` (`NavigationStack`), `Sources/Navigation.swift` (`Route`, `Navigator`) | iOS 17 / macOS 14 |
| Compose | `AppNavigation.kt` (`NavHost`), `MainActivity.kt` | Compose BOM récent (material3 ≥ 1.3), `navigation-compose`, Coil |

Un rapport (fichiers écrits, avertissements) est affiché dans le dialogue
d'export.

Flutter et React Native couvrent l'ensemble des **types** de nœud du
modèle de document (mises en page absolues et automatiques, formes,
texte, image, thème) — « complet » qualifie cette couverture par type de
nœud, pas l'absence de toute limite : voir [Écarts connus](#écarts-connus-par-rapport-à-la-spec)
pour ce qu'elle ne garantit pas.

SwiftUI et Jetpack Compose partagent la même interface `Exporter` et le
même arbre parcouru que les deux générateurs complets, mais leur
couverture d'« aperçu » se limite aux **types de nœud** `frame`, `text`,
`rect`, `ellipse`, `image` et `component` (tous les composants ci-dessus) :
tout autre type rencontré (`line` aujourd'hui)
n'est jamais rendu en silence — il produit l'avertissement `"<type> non
pris en charge par l export <id> (apercu)"`, identique au mot près entre
les deux générateurs. Ils existent dès la v1 pour que l'interface
`Exporter` soit validée par quatre implémentations réelles, pas une
seule.

Le code généré est **compilé pour de vrai** sur le projet d'exemple : Dart par
`flutter analyze` (0 remontée, `flutter_lints` compris) et `dart format` ;
Swift par `swiftc -typecheck` ; TypeScript par `tsc --strict` avec
`react-native`, `@types/react` et React Navigation ; Kotlin par Gradle
(`compileDebugKotlin`). Voir `test/verif/README.md` (`MAQUIO_VERIF_FULL=1` pour
React Native et Compose, qui installent des dépendances volumineuses).

Le Dart généré par l'export Flutter est vérifié par `flutter analyze`
dans la suite de tests d'intégration (`test/integration/flutter-analyze.test.ts`) :
un paquet Flutter jetable est construit avec les fichiers produits sur
plusieurs documents de test, et le test échoue à la moindre remontée de
l'analyseur — erreur, avertissement ou simple `info`, `flutter_lints`
compris. Au moment de l'écriture, cette vérification tourne sans aucune
remontée. Le test s'ignore (`it.skip`) si `flutter` est absent du `PATH`
plutôt que de faire dépendre toute la suite d'un SDK installé.

### SVG et Figma

- **SVG** : un fichier par écran (images en data URI), avec un croquis
  vectoriel de chaque composant.
- **Figma** : l'export produit un bundle `.figma.json` ; le plugin
  `apps/figma-plugin` (« Import Maquio ») le transforme en frames Figma,
  composants, styles et **réactions de prototype** (navigation, retour,
  overlays, URL, transitions). Installation : `npm run build:plugin`, puis dans
  Figma « Plugins > Development > Import plugin from manifest... » sur
  `apps/figma-plugin/manifest.json`. Limite de l'API de plugin : la position et
  le voile d'un overlay ne sont pas réglables (avertissement émis). Le plugin
  est couvert par des tests unitaires avec un faux `figma` ; il n'a pas été
  exécuté dans l'application Figma elle-même.

### Interactions exportées

Les transitions et overlays sont émis nativement dans les quatre cibles
(`lib/actions.dart` et `lib/transitions.dart` pour Flutter ; paramètres de route
pour React Native ; pile de navigation maison pour SwiftUI quand une transition
n'est pas native ; `NavHost` pour Compose). Limites : `native-stack` ignore la
courbe, Compose n'accepte qu'une transition par destination, les durées des
dialogues et feuilles SwiftUI sont celles du système. Un dialogue qui porte une
interaction (« Valider » vers un écran de succès) la joue après s'être fermé.

## Exemples

- `exemples/tous-les-composants.maquio` : tous les composants et conteneurs.
- `exemples/banque.maquio` : prototype d'application bancaire « nacre » (marque
  et données FICTIVES), 16 écrans de 390 x 844 plus la barre d'onglets : Bienvenue,
  code d'accès, accueil, comptes multi-devises, détail d'opération, historique,
  paiements, montant, confirmation OTP (feuille basse, transition modale), succès,
  change avec graphique, cartes, dépenses, coffres, notifications, profil. Typographie
  Geist (400 à 800, interlettrage négatif), indigo `#4338FF`, pilules et rayons de
  20 à 28. Reproduit fidèlement la maquette de référence
  (`test/integration/fixtures/nacre/*.dc.html`) : `mesurer.cjs` la rend et la mesure
  dans Electron, `convertir.mjs` en tire `nacre-spec.json`, et `fixtures/banque.ts`
  construit le document par les commandes (jamais de JSON écrit à la main).
  Jouable en mode prototype (push, modale pour l'OTP, fondus, barre d'onglets sans
  animation). Régénération : `UPDATE_EXEMPLE=1 npx vitest run test/integration/banque.test.ts`.
  Planche de rendu : `node test/e2e/banque-rendu.mjs`.

## Architecture

Le dépôt est un monorepo à quatre paquets de cœur plus une application, en
workspaces npm :

```
packages/
  core/          modele de document, geometrie, commandes, historique   (0 dependance Electron/React)
  figma/         client API Figma + traducteur Figma -> document Maquio  (depend de core)
  codegen/       registre d'exportateurs + generateurs par framework     (depend de core)
  ai/            pont Claude Code : prompt -> patch de document          (depend de core)
apps/
  desktop/       Electron : main, preload, renderer React                (depend des 4 paquets ci-dessus)
```

**Règle de dépendance** :

- `packages/core` n'importe aucun autre paquet du dépôt ;
- `packages/figma`, `packages/codegen` et `packages/ai` n'importent que
  `@maquio/core` ;
- aucun paquet de cœur (`core`, `figma`, `codegen`, `ai`) n'importe
  `electron`, `react` ni `react-dom` ;
- `apps/desktop/src/renderer` n'importe jamais `electron`, un module
  `node:*`, ni `@maquio/figma`, `@maquio/codegen` ou `@maquio/ai` : le
  renderer ne touche jamais au disque, au réseau ni à un sous-processus
  directement — tout cela passe par le processus main via le preload
  (`window.maquio`).

Cette règle est ce qui rend le monorepo testable et prévisible : le cœur
reste une bibliothèque de transformation de données pure, exécutable sous
Node seul, sans écran ; seule l'application de bureau connaît Electron et
React. Elle n'est pas seulement documentée : elle est **vérifiée par un
test exécutable**, `test/architecture.test.ts`, qui lit les fichiers
sources et fait échouer la suite en nommant le fichier et l'import fautif
dès qu'elle est violée.

## Le format `.maquio`

Un document Maquio est un fichier `.maquio` : du JSON versionné
(`{ version, id, name, pages, tokens }`), sérialisé avec une
indentation lisible plutôt que minifié. Chaque page porte un appareil
cible (iPhone 15, Pixel 8, iPad mini) et un arbre de nœuds (`Frame`,
`Text`, `Rect`, `Ellipse`, `Image`, `Line`, `Component`). Version 4 :
les documents v1 à v3 s'ouvrent et sont migrés (les anciens `link` deviennent des interactions tap vers un écran). Les fichiers `.calque` (ancien nom) sont lus, et l'application propose de les convertir en `.maquio` (ouverture, glisser-déposer, ouverture système). Un document d'une version
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

- **parcours réel** (`npm run test:e2e`, après `npm run build`) — pilote
  l'application Electron avec Playwright (`_electron`) : créer un écran,
  tracer, déplacer, redimensionner, multi-sélection, propriétés,
  annuler/rétablir, enregistrer puis rouvrir un `.maquio`, exporter vers
  les quatre cibles, compiler le Swift généré, vérifier qu'un document
  hostile est refusé. Les dialogues natifs sont simulés côté processus
  principal. Les captures vont dans `OUT=<dossier>`.

La CI (`.github/workflows/ci.yml`) rejoue typecheck, tests, build, audit des
dépendances livrées, `flutter analyze` et ce parcours réel.

### Test bout-en-bout avec le vrai binaire `claude`

`test/integration/claude-e2e.test.ts` appelle le **vrai** binaire
`claude` (pas `FakeClaudeRunner`) avec le prompt réellement construit par
`buildPrompt`, et vérifie que la réponse est acceptée par `parsePatch`
puis applicable par `patchToCommand` — le seul garde-fou qui aurait
attrapé le répertoire de travail non maîtrisé et la forme de noeud non
fixée dans le prompt (voir plus haut). Il reste **opt-in**, jamais
exécuté par `npm test` : il est ignoré par défaut, et ignoré (`it.skip`)
même quand la variable d'environnement ci-dessous est mise si `claude`
est introuvable dans le `PATH`.

```bash
MAQUIO_E2E_CLAUDE=1 npx vitest run test/integration/claude-e2e.test.ts
```

Il consomme un vrai appel réseau/API via le binaire `claude` installé
localement (quota, latence) et tourne dans le même répertoire de travail
neutre que la production (voir `apps/desktop/src/main/adapters/
claudeWorkingDirectory.ts`), avec un délai généreux (4 minutes) au-dessus
du délai de production (2 minutes) pour ne mesurer que l'acceptation du
patch, pas le comportement du délai lui-même (déjà couvert par
`packages/ai/test/runner.test.ts` avec de faux minuteurs).

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
- le prototypage avancé (variables, logique conditionnelle, composants animés) ;
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
- le générateur Flutter produit une classe par écran plutôt qu'un widget
  par frame nommée, contrairement à ce que décrit le §7 de la spec
  (le `Scaffold` et les routes sont désormais émis) ;
- la première édition d'un nœud réordonne ses clés dans le fichier
  `.maquio` (vérifié : un nœud fraîchement créé conserve l'ordre littéral
  de ses champs, une fois passé par une commande de modification ses
  clés sont réordonnées selon le schéma de validation) — le document
  reste lisible et valide, mais le premier `git diff` qui suit une
  édition est bruyant.

Écart fermé depuis (usage-w3a) : tout nœud `image` dont `src` est vide
(importé de Figma sans URL d'asset résolue, ou tracé dans l'éditeur avant
tout choix de fichier) produit désormais un **avertissement** dans
`ExportResult.warnings`, identique dans son principe entre les quatre
générateurs (`emptyImageSourceWarning`, `packages/codegen/src/shared/node-helpers.ts`) —
aucun des quatre n'émet plus de référence à la ressource vide
(`require('')`, `Image.asset('')`, `Image("")` ou un
`painterResource(...)`/`AsyncImage(...)` construit sur une chaîne vide) :
le nœud est simplement omis de la sortie, comme un type de nœud non
supporté.

La normalisation des noms de token en identifiant (Flutter) traite
désormais les mots réservés du langage cible (`class`, `default`,
`new`...) : un token ainsi nommé se voit attribuer un identifiant de
repli plutôt que de produire du Dart invalide — corrigé depuis la
précédente version de ce document, vérifié avec le vrai SDK Dart via
`flutter analyze`.

## Licence

Distribué sous licence [MIT](LICENSE) © 2026 Khalil Benazzouz.

## Limites connues des exports

- Compose : les 24 pictogrammes sans équivalent dans `material-icons-core` (échange, carte,
  coffre...) sont remplacés par l'icône `core` la plus proche ; ajoutez
  `material-icons-extended` pour les icônes exactes.
- SwiftUI : la couleur de piste d'une barre de progression n'est pas réglable (ignorée).
- Flutter : les lignes de plus de 80 colonnes (noms d'écrans longs, listes de routes) ne
  sont pas repliées ; lancez `dart format lib` après l'export.
- Pas de composant réutilisable (instance) : la barre d'onglets est un composant natif
  (`bottomNav`) recopié sur chaque écran.
- Pas de composant graphique : une courbe est composée de segments (rectangles tournés).
