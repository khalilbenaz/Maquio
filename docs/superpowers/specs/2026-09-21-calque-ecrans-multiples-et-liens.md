# Calque v2 — écrans multiples et liens de navigation

Addendum à `2026-09-20-calque-design.md`, 21 septembre 2026.

## 1. Pourquoi

La v1 conçoit **un** écran. L'utilisateur a été clair : il veut concevoir
**toute** l'interface d'une application — plusieurs écrans côte à côte — et
**relier chaque écran aux autres par des clics**, puis exporter le tout avec
sa navigation.

Le §2 de la spec v1 excluait explicitement « le prototypage interactif
(transitions entre écrans) ». Cet addendum lève cette exclusion : ce n'était
pas un détail de confort, c'est ce qui sépare une maquette d'écran d'une
maquette d'application.

## 2. Ce que cette v2 ajoute, et rien de plus

- plusieurs **écrans** sur le même plan de travail, posés côte à côte ;
- un **lien** posé sur n'importe quel nœud : « au clic, aller à tel écran » ;
- l'**export de la navigation** vers Flutter et React Native ;
- un **mode Parcours** qui rejoue l'enchaînement dans l'application.

Restent hors périmètre, et le restent volontairement : les transitions
animées et leur durée, les gestes autres que le clic (glissement, appui
long), les conditions (« si connecté alors… »), le retour arrière matériel
d'Android, et les liens vers une URL externe.

## 3. Le modèle

### 3.1 Un écran est une frame de premier niveau

Aucun nouveau type de nœud. **Une frame de premier niveau d'une page est un
écran.** Elle porte en plus :

```ts
FrameNode.device?: DevicePreset   // présent ⇒ c'est un écran
```

Conséquences voulues :

- les commandes, l'arbre, la mise en page automatique et les quatre
  générateurs continuent de fonctionner sans changement de forme ;
- `Page.device` devient le **gabarit par défaut** des nouveaux écrans, plus
  la taille du plan de travail ;
- `frame.x` et `frame.y` d'un écran le positionnent sur le plan de travail
  infini, ce qui donne gratuitement la disposition côte à côte.

Un document v1 reste lisible : sa page a des nœuds de premier niveau sans
`device`. À l'ouverture, ils sont enveloppés dans un écran unique portant le
`device` de la page. La migration est écrite une fois, dans `parseDocument`,
et le champ `version` du document passe à **2**.

### 3.2 Un lien

```ts
NodeBase.link?: { target: string }   // identifiant d'un écran de la même page
```

Un seul déclencheur, le clic — d'où l'absence de champ `trigger` : l'ajouter
aujourd'hui serait inventer une extension dont personne n'a besoin.

Règles, imposées par le schéma et par les commandes :

- la cible est l'identifiant d'une frame de premier niveau **de la même
  page** ; toute autre cible est refusée ;
- un lien vers l'écran qui contient le nœud est refusé (il ne produirait
  rien de sensé) ;
- supprimer un écran **retire** les liens qui le visaient, dans la même
  commande annulable — un lien orphelin produirait du code qui ne compile
  pas ;
- un nœud invisible ou verrouillé garde son lien ; c'est son affichage qui
  change, pas sa sémantique.

## 4. Le plan de travail

- plusieurs écrans visibles à la fois, chacun avec son étiquette (nom et
  gabarit) au-dessus ;
- l'écran **actif** est celui de la sélection, ou le dernier touché ; son
  étiquette est en accent ;
- l'ajustement à la fenêtre cadre **tous** les écrans, pas seulement le
  premier ;
- un nouvel écran se crée par un bouton « Nouvel écran », qui le place à
  droite du dernier avec une gouttière fixe, et par duplication d'un écran
  existant ;
- les liens se dessinent comme des **connecteurs** entre le nœud source et
  le bord de l'écran cible, sur un calque qui s'affiche et se masque. Ils ne
  sont jamais dessinés pendant un glissement, pour ne pas encombrer le
  geste.

## 5. Poser un lien

Deux chemins, parce qu'aucun des deux seul ne suffit :

1. **par l'inspecteur** — un nœud sélectionné expose « Au clic → » avec la
   liste des écrans de la page ; c'est le chemin sûr, celui qui marche même
   quand l'écran cible est hors de vue ;
2. **par glissement** — une poignée de lien sur le cadre de sélection, que
   l'on tire jusqu'à l'écran cible ; c'est le chemin rapide, celui qu'on
   attend d'un outil de ce genre.

Les deux passent par la même commande annulable, `setLinkCommand`.

## 6. Le mode Parcours

Un bouton **« Parcours »** dans la barre d'outils bascule l'application en
lecture : les panneaux s'effacent, l'écran actif s'affiche seul à sa taille
réelle, un clic sur un nœud lié va à l'écran cible, une flèche revient en
arrière, `Échap` sort du mode.

C'est ce qui permet de **vérifier l'enchaînement sans exporter**, et c'est le
seul moyen honnête de savoir si la navigation qu'on a dessinée tient debout.

## 7. L'export de la navigation

Un document à plusieurs écrans produit, en plus des écrans eux-mêmes, le
câblage de navigation de la cible.

**Flutter** — un fichier par écran, plus `lib/app.dart` : un `MaterialApp`
avec `routes`, une route nommée par écran, et l'écran actif en
`initialRoute`. Un nœud lié est enveloppé dans un `InkWell` dont le
`onTap` appelle `Navigator.pushNamed(context, '/cible')`.

**React Native** — un fichier par écran, plus `src/navigation.tsx` : un
`createNativeStackNavigator` avec un `Screen` par écran. Un nœud lié devient
un `Pressable` dont le `onPress` appelle `navigation.navigate('Cible')`. Le
générateur **n'installe pas** `@react-navigation` : il le nomme dans les
avertissements, comme dépendance attendue.

**SwiftUI et Compose**, en aperçu — pas de câblage de navigation. Chaque
nœud lié produit un avertissement nommant l'écran cible, pour que rien ne
soit perdu en silence. C'est cohérent avec la maturité annoncée.

## 8. Ce qu'on vérifie

Au-delà des tests unitaires habituels :

- un document v1 s'ouvre, se migre en v2 et reste valide au schéma ;
- supprimer un écran visé par trois liens les retire tous, et un seul
  « annuler » restaure l'écran **et** ses trois liens ;
- une cible hors de la page, ou l'écran lui-même, est refusée ;
- le code Flutter d'un document à trois écrans et quatre liens passe
  `flutter analyze` sans aucune remontée — le harnais existant s'en charge,
  il suffit de lui donner un document à plusieurs écrans ;
- le mode Parcours suit un lien et revient en arrière.
