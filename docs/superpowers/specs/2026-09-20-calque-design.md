# Calque — éditeur d'interfaces mobiles drag & drop

Spec de conception, 2026-09-20. Mode autopilot : `creation`.

## 1. Le problème

Concevoir une interface mobile aujourd'hui demande deux outils qui ne se
parlent pas : un éditeur visuel (Figma) et un éditeur de code (Flutter,
React Native…). Le passage de l'un à l'autre est manuel, coûteux, et se
refait à chaque itération de design.

Calque est une application de bureau qui tient les trois bouts dans un
seul document :

1. **dessiner** une interface mobile au drag & drop, sur un canvas type
   Figma ;
2. **importer** une maquette Figma existante comme point de départ ;
3. **exporter** l'écran en code natif, Flutter en premier, puis React
   Native, SwiftUI et Jetpack Compose ;

et une quatrième, transverse : **demander à Claude Code** de créer ou de
modifier l'interface en langage naturel, directement dans le document.

## 2. Ce que Calque n'est pas (v1)

YAGNI explicite. Sont **hors périmètre** de la v1 :

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

## 3. Pile technique

| Choix | Décision | Pourquoi |
|---|---|---|
| Enveloppe desktop | **Electron 32+** | il faut lancer le binaire `claude` en sous-processus local et lire/écrire des fichiers : un navigateur seul ne peut pas. Electron se construit sur ce Mac sans Xcode complet, contrairement à Flutter desktop, et l'utilisateur en exploite déjà en production. |
| Langage | **TypeScript strict** partout | le cœur de valeur (modèle de document, import Figma, générateurs de code) est de la transformation de données pure : un seul langage, testable hors interface. |
| Interface | **React 18 + Vite** | écosystème, rechargement à chaud, et rendu du canvas en DOM (voir §5.2). |
| Tests | **Vitest** + fichiers témoins (*golden files*) | même moteur pour le cœur et l'interface, exécution sans écran. |
| Monorepo | **workspaces npm** | les paquets du cœur ne doivent jamais dépendre d'Electron ; la frontière est structurelle, pas conventionnelle. |
| Empaquetage | **electron-builder** | déjà éprouvé sur les autres projets Electron de l'utilisateur. |

## 4. Structure du dépôt

```
packages/
  core/          modèle de document, géométrie, commandes, historique   (0 dépendance Electron/React)
  figma/         client API Figma + traducteur Figma → document Calque   (dépend de core)
  codegen/       registre d'exportateurs + générateurs par framework     (dépend de core)
  ai/            pont Claude Code : prompt → patch de document           (dépend de core)
apps/
  desktop/       Electron : main, preload, renderer React                (dépend des 4)
docs/
  superpowers/specs/
```

Règle de dépendance, vérifiée par un test : `core` n'importe rien des
autres paquets ; `figma`, `codegen` et `ai` n'importent que `core` ;
seul `apps/desktop` importe Electron et React.

## 5. Le cœur : `packages/core`

### 5.1 Modèle de document

Un document Calque est un JSON versionné, sérialisable, sans référence
circulaire :

```ts
Document  { version, id, name, pages: Page[], tokens: DesignTokens }
Page      { id, name, device: DevicePreset, nodes: Node[] }
Node      = Frame | Text | Rect | Ellipse | Image | Line
```

Tout nœud porte : `id`, `name`, `type`, `frame {x, y, w, h}`,
`visible`, `locked`, `opacity`, `rotation`, `constraints`.

- `Frame` ajoute `layout` — `{ mode: 'absolute' | 'row' | 'column',
  gap, padding, alignMain, alignCross }` — `fills`, `strokes`,
  `cornerRadius`, `clipsContent` et `children: Node[]`.
- `Text` ajoute `characters` et `style` (famille, taille, graisse,
  interligne, interlettrage, couleur, alignement).
- `Rect` / `Ellipse` ajoutent `fills`, `strokes`, `cornerRadius`.
- `Image` ajoute `src` (chemin relatif au document ou URL) et `fit`.
- `Line` ajoute `stroke`.

`DesignTokens` porte les couleurs, typographies et espacements nommés du
document. L'import Figma les alimente depuis les styles publiés ; les
exportateurs les rendent en constantes (`ThemeData` Flutter, objet de
thème React Native, etc.) plutôt qu'en valeurs littérales dispersées.

`DevicePreset` fixe la taille du canvas et le ratio de pixels
(iPhone 15, Pixel 8, iPad mini en v1).

### 5.2 Rendu et interaction

Le canvas est rendu en **DOM absolu + calque SVG de superposition**, pas
en `<canvas>` 2D. Le test de contact, la sélection, l'édition de texte au
clavier et le rendu des polices sont alors gérés par le navigateur ; un
`<canvas>` imposerait de réécrire tout cela pour un gain de performance
dont une maquette d'écran mobile (quelques centaines de nœuds) n'a pas
besoin.

La superposition SVG porte ce qui n'est pas le dessin lui-même : cadre de
sélection, huit poignées de redimensionnement, guides d'alignement,
indicateurs d'espacement, zone de dépôt.

### 5.3 Commandes et historique

Toute mutation passe par une **commande** — `{ apply(doc) → doc,
invert(doc) → Command }` — jamais par une écriture directe. L'historique
est deux piles de commandes. Conséquence recherchée : la même couche sert
l'interface (glisser une poignée), le raccourci clavier, **et** les
patchs que renvoie Claude Code (§8), qui deviennent donc annulables comme
n'importe quelle action humaine.

Commandes de la v1 : créer, supprimer, déplacer, redimensionner,
reparenter, réordonner, modifier un style, modifier un texte, grouper,
dégrouper, appliquer une mise en page automatique.

## 6. Import Figma : `packages/figma`

Deux entrées, un seul traducteur :

1. **API REST Figma** — `GET /v1/files/:key` avec un jeton personnel
   fourni par l'utilisateur dans les réglages, stocké dans le trousseau
   du système via `safeStorage` d'Electron, jamais dans le document ni
   dans le dépôt ;
2. **fichier JSON local** — la même charge utile, enregistrée sur disque.

Le format `.fig` binaire propriétaire n'est pas lu : il n'est pas
documenté, et l'API REST publique donne le même arbre de manière stable.

Le traducteur `figmaToDocument()` est une fonction pure, testée sur des
fichiers témoins figés dans le dépôt. Correspondances :

| Figma | Calque |
|---|---|
| `DOCUMENT` / `CANVAS` | `Document` / `Page` |
| `FRAME`, `GROUP`, `COMPONENT`, `INSTANCE` | `Frame` (composants aplatis) |
| `TEXT` | `Text` |
| `RECTANGLE`, `ROUNDED_RECTANGLE` | `Rect` |
| `ELLIPSE` | `Ellipse` |
| `LINE`, `VECTOR` simple | `Line` |
| `VECTOR` complexe, `BOOLEAN_OPERATION` | `Image` (rendu en espace réservé + avertissement) |
| `layoutMode: HORIZONTAL/VERTICAL` | `layout.mode: row/column` |
| styles publiés | `DesignTokens` |

Ce qui n'a pas d'équivalent n'est jamais perdu en silence : l'import rend
un `ImportReport { nodesImported, warnings: Warning[] }` affiché à
l'utilisateur à la fin de l'import.

## 7. Export : `packages/codegen`

Un registre, une interface :

```ts
interface Exporter {
  id: 'flutter' | 'react-native' | 'swiftui' | 'compose'
  label: string
  maturity: 'complete' | 'preview'
  export(doc: Document, opts: ExportOptions): ExportResult  // fichiers en mémoire
}
```

`ExportResult` est une liste de `{ path, contents }` ; l'écriture sur
disque appartient à `apps/desktop`, ce qui rend chaque générateur
testable par comparaison à un fichier témoin.

**Flutter est le générateur complet de la v1** : `Scaffold`, `Stack`
pour les mises en page absolues, `Column`/`Row` + `SizedBox` pour les
mises en page automatiques, `Container` + `BoxDecoration` pour les
formes, `Text` + `TextStyle`, `Image`, et un `ThemeData` alimenté par les
tokens. Un widget par frame nommée, un fichier par écran.

**React Native** est complet également (composants fonctionnels,
`StyleSheet.create`, thème en objet exporté).

**SwiftUI** et **Jetpack Compose** sortent en `preview` : même interface,
même arbre parcouru, couverture limitée aux nœuds les plus courants
(frame, texte, rectangle, ellipse, image) et marqués comme tels dans
l'interface. Ils existent dès la v1 pour que l'interface `Exporter` soit
validée par quatre implémentations et non par une seule.

Chaque générateur est jugé par des tests témoins : un document d'entrée
figé, un fichier de sortie attendu, comparaison octet à octet. Pour
Flutter, un test supplémentaire vérifie que la sortie passe
`dart format --output=none --set-exit-if-changed` **si** l'outil `dart`
est présent sur la machine, et se marque comme ignoré sinon — la suite ne
doit pas dépendre d'un SDK Flutter installé.

## 8. Pont Claude Code : `packages/ai`

L'utilisateur écrit « ajoute une barre de navigation en bas avec trois
onglets » ; Calque doit modifier le document.

Mécanique :

1. `packages/ai` construit un prompt qui contient l'instruction, le
   document courant sérialisé (ou la sélection seule si elle existe) et
   le **schéma de patch** attendu en réponse ;
2. il le passe à un `ClaudeRunner` — une interface à une méthode,
   `run(prompt): Promise<string>` ;
3. l'implémentation de production lance le binaire `claude` en
   sous-processus (`claude -p --output-format json`), ce qui réutilise la
   session authentifiée de l'utilisateur : **aucune clé d'API n'est
   demandée, stockée ni transmise par Calque** ;
4. la réponse est validée par un schéma Zod, puis traduite en
   **commandes** du §5.3 — donc annulables, et incapables d'écrire dans
   le document autrement que par les mêmes chemins que l'interface.

Le patch est un tableau d'opérations explicites (`insertNode`,
`updateNode`, `deleteNode`, `moveNode`, `setTokens`), jamais un document
complet à substituer : un modèle qui renvoie un document entier efface en
silence ce qu'il n'a pas compris, alors qu'une opération invalide se
rejette isolément.

Tous les tests du paquet utilisent un `FakeClaudeRunner` alimenté par des
réponses figées. Aucun test de la suite n'appelle le binaire `claude`, ni
le réseau.

Si le binaire `claude` est introuvable dans le `PATH`, l'interface le dit
et désactive le panneau, plutôt que d'échouer au moment de l'envoi.

## 9. L'application : `apps/desktop`

Trois processus, une frontière stricte :

- **main** — fenêtre, menus, dialogues de fichiers, écriture sur disque
  de l'export, lancement du sous-processus `claude`, accès au trousseau
  pour le jeton Figma, appels réseau vers l'API Figma ;
- **preload** — `contextBridge` exposant une surface nommée et figée
  (`openDocument`, `saveDocument`, `importFigma`, `exportProject`,
  `askClaude`, `getSettings`, `setSettings`). `nodeIntegration: false`,
  `contextIsolation: true`, `sandbox: true` ;
- **renderer** — React : canvas, panneau des calques, inspecteur de
  propriétés, barre d'outils, panneau Claude, dialogue d'import Figma,
  dialogue d'export.

Le renderer ne touche jamais au disque, au réseau, ni à un
sous-processus. Le document vit dans le renderer ; le main ne le voit que
lorsqu'on le lui passe, sérialisé, pour l'enregistrer ou l'exporter.

Disposition de la fenêtre : barre d'outils en haut, calques à gauche,
canvas au centre, inspecteur à droite, panneau Claude en tiroir à droite.

Format de fichier : `.calque`, JSON `Document` indenté, versionné par le
champ `version`. Lisible par un humain et par `git diff` — délibéré : une
maquette doit pouvoir vivre en revue de code à côté de l'interface
qu'elle décrit.

## 10. Gestion des erreurs

| Situation | Réponse |
|---|---|
| Jeton Figma absent ou refusé | message nommant l'étape (« jeton refusé par Figma »), lien vers les réglages, aucun import partiel appliqué |
| Nœud Figma non convertible | converti en espace réservé, consigné dans `ImportReport.warnings`, import poursuivi |
| Réponse de Claude non conforme au schéma | patch rejeté en entier, réponse brute montrée dans le panneau, document intact |
| Binaire `claude` absent | panneau désactivé avec la raison, à l'ouverture et non à l'envoi |
| Export vers un dossier non vide | confirmation explicite avant écrasement, liste des fichiers concernés |
| Document d'une version future | ouverture refusée avec la version attendue, plutôt qu'une lecture partielle silencieuse |

Principe commun : un échec ne laisse jamais le document à moitié modifié.
Les commandes du §5.3 s'appliquent en tout ou rien.

## 11. Stratégie de test

| Niveau | Objet | Outil |
|---|---|---|
| Unitaire | géométrie, commandes, historique, traducteur Figma | Vitest |
| Témoin | les quatre générateurs de code | Vitest + fichiers `.golden` |
| Contrat | schéma de patch, rejet des réponses malformées | Vitest + Zod |
| Architecture | la règle de dépendance du §4 | Vitest lisant les imports |
| Composant | canvas, inspecteur, panneau calques | Vitest + Testing Library (jsdom) |

Hors périmètre v1 : les tests bout-en-bout Electron (Playwright), qui
demandent un écran et une app empaquetée ; leur absence est assumée et
consignée.

Toute la suite s'exécute par `npm test` à la racine, sans écran, sans
réseau, sans SDK Flutter et sans binaire `claude`.

## 12. Ordre de construction

1. `core` — modèle, géométrie, commandes, historique
2. `codegen` — registre + générateur Flutter sur documents construits à la main
3. `figma` — traducteur sur fichiers témoins
4. `apps/desktop` — coque Electron, canvas, sélection, glisser-déposer
5. inspecteur, panneau des calques, mise en page automatique
6. `ai` — pont Claude Code et panneau
7. React Native, puis SwiftUI et Compose en `preview`
8. import Figma bout en bout dans l'interface, export sur disque

Chaque étape laisse la suite de tests verte.
