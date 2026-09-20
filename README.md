# Calque

Calque est une application de bureau pour concevoir des interfaces mobiles
au drag & drop, sur un canvas type Figma. Elle importe une maquette Figma
existante comme point de départ, puis exporte l'écran obtenu en code natif
(Flutter, React Native, SwiftUI, Jetpack Compose). Une quatrième voie,
transverse aux deux premières, permet de demander à Claude Code de créer ou
modifier l'interface en langage naturel, directement dans le document.

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

**Règle de dépendance** (vérifiée par un test, pas seulement documentée) :

- `packages/core` n'importe aucun autre paquet du dépôt ;
- `packages/figma`, `packages/codegen` et `packages/ai` n'importent que
  `@calque/core` ;
- aucun paquet de cœur (`core`, `figma`, `codegen`, `ai`) n'importe
  `electron`, `react` ni `react-dom` ;
- `apps/desktop/src/renderer` n'importe jamais `electron`, un module
  `node:*`, ni `@calque/figma`, `@calque/codegen` ou `@calque/ai`.

Cette règle est celle qui rend le monorepo testable et prévisible : le cœur
reste une bibliothèque de transformation de données pure, exécutable sous
Node seul, sans écran ; seule l'application de bureau connaît Electron et
React. Elle est imposée par `test/architecture.test.ts`, qui lit les
fichiers sources et échoue en nommant le fichier et l'import fautifs dès
qu'elle est violée — voir [Tests](#tests).

## Installation

Prérequis : Node.js 24 ou plus récent (`engines.node` dans `package.json`).

```bash
npm install
```

## Commandes

```bash
npm test           # suite complète (Vitest) : sans écran, sans réseau, sans binaire claude
npm run typecheck  # tsc --noEmit sur packages/ puis sur apps/desktop/ (deux configurations distinctes, voir plus bas)
npm run build      # construit le renderer et le processus main/preload d'apps/desktop (Vite)
npm run dist       # construit puis empaquette l'application desktop (electron-builder, dossier non compressé)
npm run dev        # lance l'application desktop en mode developpement (ouvre une fenetre Electron)
```

`npm run typecheck` enchaîne volontairement deux invocations de `tsc` :
`tsc --noEmit -p tsconfig.json` (qui ne couvre que `packages/` et le dossier
`test/` à la racine) puis `tsc --noEmit -p apps/desktop/tsconfig.json`. Ce
n'est pas un oubli à fusionner : `apps/desktop/tsconfig.json` déclare
`lib: ["ES2022", "DOM"]` et `jsx: "react-jsx"`, alors que
`tsconfig.base.json` (dont héritent tous les paquets de cœur) déclare
`lib: ["ES2022"]` **sans DOM** — une revue a déjà dû corriger une fuite du
DOM vers les paquets de cœur, et ce test d'architecture (`test/architecture.test.ts`)
vérifie désormais que `tsconfig.base.json` ne réintroduit jamais `DOM`.

## Cibles d'export

| Cible | Identifiant | Maturité |
|---|---|---|
| Flutter | `flutter` | **complet** |
| React Native | `react-native` | **complet** |
| SwiftUI | `swiftui` | aperçu (`preview`) |
| Jetpack Compose | `compose` | aperçu (`preview`) |

Flutter et React Native couvrent l'ensemble des **types** de nœud du
modèle de document (mises en page absolues et automatiques, formes,
texte, image, thème issu des tokens) — « complet » qualifie cette
couverture par type de nœud, pas l'absence de toute limite : voir
« Écarts connus » plus bas pour ce que cette maturité ne garantit pas
(mots réservés d'un token, image locale sans avertissement). SwiftUI et
Jetpack Compose partagent la même interface `Exporter` et le même arbre
parcouru, mais leur couverture se limite aux nœuds les plus courants
(frame, texte, rectangle, ellipse, image) ; ils existent dès la v1 pour
que l'interface `Exporter` soit validée par quatre implémentations
réelles, pas une seule, et sont signalés comme `preview` partout où
l'interface les propose.

## Import Figma

L'import lit un fichier Figma par deux entrées possibles : l'API REST
Figma (`GET /v1/files/:key`) ou un fichier JSON exporté localement. Le
format binaire `.fig` n'est pas lu.

Pour importer depuis l'API, il faut un jeton d'accès personnel Figma :

1. dans Figma, ouvrir **Settings** (icône de compte en haut à gauche) ;
2. aller dans la section **Personal access tokens** ;
3. cliquer **Generate new token**, lui donner un nom, le générer ;
4. copier le jeton immédiatement — Figma ne le réaffiche plus ensuite.

Ce jeton se saisit dans l'écran **Réglages** de l'application (bouton
« Réglages » dans la barre d'outils) : le champ est masqué (type mot de
passe), et le bouton Enregistrer le transmet à `window.calque.setFigmaToken`.
Calque le chiffre alors avec `safeStorage` d'Electron et l'écrit dans un
fichier du dossier de données de l'application (jamais dans le document
`.calque`, jamais dans le dépôt). Une fois enregistré, le jeton n'est plus
jamais réaffiché : l'écran indique seulement si un jeton est enregistré ou
non. Si le chiffrement du système n'est pas disponible sur la machine
courante, l'enregistrement est refusé et la raison s'affiche dans l'écran
Réglages, plutôt que d'écrire le jeton en clair. Une fois le jeton
enregistré, le dialogue d'import Figma de la barre d'outils accepte la clé
ou le lien d'un fichier Figma.

Tout nœud Figma sans équivalent (composant/variante aplati, vecteur
complexe, opération booléenne) n'est jamais perdu en silence : il est
converti en espace réservé et consigné dans le rapport d'import affiché à
l'utilisateur à la fin de l'opération.

## Pont Claude Code

Le panneau Claude de l'application ne parle jamais directement à une API :
il lance en sous-processus le binaire `claude` **déjà installé sur la
machine** (`claude -p --output-format json`), ce qui réutilise la session
déjà authentifiée de l'utilisateur.

**Calque ne demande, ne stocke ni ne transmet aucune clé d'API.** Si le
binaire `claude` est introuvable dans le `PATH`, le panneau se désactive
avec un message expliquant pourquoi, dès l'ouverture de l'application et
non au moment de l'envoi.

La réponse de Claude est un patch (liste d'opérations explicites, jamais
un document complet) validé par un schéma avant d'être traduit en
commandes du même mécanisme d'historique que l'interface : annulables, et
incapables de modifier le document autrement que par les chemins déjà
empruntés par un geste humain. Une réponse qui ne respecte pas le schéma
est rejetée en bloc, et le document reste intact.

## Tests

```bash
npm test
```

exécute toute la suite (Vitest), sans écran, sans réseau, sans SDK Flutter
et sans le binaire `claude` — les tests du pont Claude utilisent un
`FakeClaudeRunner` alimenté par des réponses figées, jamais le vrai
binaire.

La stratégie de test suit cinq niveaux : unitaire (géométrie, commandes,
historique, traducteur Figma), témoin (les quatre générateurs de code,
comparés octet à octet à un fichier `.golden`), contrat (schéma du patch
Claude, rejet des réponses malformées), composant (canvas, inspecteur,
panneau des calques, avec Testing Library sous jsdom) et **architecture**
(`test/architecture.test.ts`, à la racine du dépôt, hors des paquets et
donc explicitement inclus dans les globs de `vitest.config.ts`) : ce
dernier lit les fichiers sources et fait échouer la suite, en nommant le
fichier et l'import en cause, si la règle de dépendance décrite plus haut
est violée.

Les tests bout-en-bout Electron (Playwright, qui demanderaient un écran et
une application empaquetée) sont hors périmètre de la v1 ; leur absence
est assumée.

## Ce que la v1 ne fait pas

- l'édition collaborative en temps réel (multi-curseurs, présence) ;
- le versionnage cloud, les comptes utilisateurs, tout backend distant
  autre que l'API Figma ;
- les composants et variantes réutilisables au sens Figma (l'import les
  aplatit en simples frames) ;
- l'édition vectorielle (nœuds de Bézier, opérations booléennes) ;
- le prototypage interactif (transitions entre écrans, animations) ;
- le réimport code → design (l'export est à sens unique) ;
- la publication, la signature et la distribution de l'application
  elle-même ;
- les tests bout-en-bout Electron (Playwright).

Chacun de ces points est un projet à part entière ; les YAGNI explicites
de la v1 sont détaillés dans la spec de conception,
`docs/superpowers/specs/2026-09-20-calque-design.md`.

## Écarts connus par rapport à la spec

Constatés lors de la revue finale de branche, non corrigés dans cette
vague de correction (coût assumé, à reprendre plus tard) :

- le champ `constraints` du §5.1 de la spec n'existe pas dans le modèle
  de document (`packages/core/src/model/types.ts`) ;
- le générateur Flutter n'émet pas de `Scaffold` et produit une classe
  par page plutôt qu'un widget par frame nommée, contrairement à ce que
  décrit le §7 de la spec ;
- la première édition d'un nœud réordonne ses clés dans le fichier
  `.calque` : le document reste lisible et valide, mais le premier
  `git diff` qui suit une édition est bruyant ;
- la normalisation des noms de token en identifiant (Flutter, React
  Native) ne traite pas les mots réservés du langage cible : un token
  nommé `class`, `default` ou `new` produit `static const Color class =
  ...`, que `dart` ne parse pas ;
- tout nœud `image` importé de Figma a `src: ''` (aucune URL d'asset
  n'est résolue par le traducteur), d'où `require('')`,
  `Image.asset('')` et `Image("")` émis **sans avertissement** par React
  Native, Flutter et SwiftUI — seul Jetpack Compose avertit (et
  n'émet rien) pour une image locale, faute de connaître le nom de
  paquet applicatif nécessaire à `R.drawable`. Préexistant à cette vague
  de correction, à signaler au relecteur humain.
