// Guide de design injecte dans le prompt (voir prompt.ts) : ce qui fait
// qu'un ecran mobile genere a l'air soigne plutot que "genere par IA".
//
// Synthese, reformulee et restreinte a ce que le modele Maquio sait
// exprimer (aplats, bordures, un rayon, texte, composants natifs,
// transitions de prototype ; ni ombre, ni degrade, ni flou), de trois
// skills de design :
// - emilkowalski/skill (MIT, Emil Kowalski) : mobile-native, apple-design,
//   emil-design-eng, prototype, animate ;
// - pbakaus/impeccable (Apache-2.0, Paul Bakaus) : craft-floor, ios,
//   android, layout, colorize, typeset ;
// - Leonxlnx/taste-skill (MIT, Leonxlnx) : taste-skill,
//   imagegen-frontend-mobile, soft-skill, minimalist-skill, brandkit.
// Voir THIRD_PARTY_NOTICES.md.
//
// Claude Code est lance sans outil (voir runner.ts) : il ne peut pas
// charger ces skills lui-meme, d'ou leur synthese ici.
export const DESIGN_GUIDE_TEXT = `Qualite visuelle attendue (un ecran qui a l'air concu par un designer produit, pas genere) :

Ecran et zones systeme (iPhone 393 x 852) :
- rien d'important dans les 59 px du haut (barre d'etat) ni les 34 px du bas (indicateur d'accueil) ; une barre d'onglets occupe le bas (49 px + 34 px de zone sure) ;
- une seule marge laterale par ecran : 16, 20 ou 24 px, identique sur tous les ecrans du flux ;
- composer avec des frames en "column"/"row" ("gap", "padding") plutot qu'en positions absolues : c'est ce qui evite les chevauchements. Deux textes ou composants freres ne se superposent JAMAIS ; chaque texte a une largeur et une hauteur suffisantes pour son contenu reel (hauteur = nombre de lignes x lineHeight), sinon il est rogne.

Hierarchie et composition :
- un seul point focal par ecran, puis un niveau secondaire, puis le reste ; une seule action primaire, visible sans defiler ;
- regrouper par proximite avant d'ajouter des conteneurs : 4 a 12 px dans un groupe, 24 a 32 px entre sections, plus d'espace au-dessus d'un titre qu'en dessous ;
- pas de carte dans une carte ; listes a plat avec separateurs de 1 px plutot qu'une pile de cartes identiques ;
- varier la composition d'un ecran a l'autre (grand chiffre, liste a plat, formulaire aere, feuille basse) au lieu de cloner la meme structure.

Typographie :
- une seule famille de police sur tout le document ; une meme fonction (titre d'ecran, corps, legende) garde le meme style sur tous les ecrans ;
- echelle : titre d'ecran 28 a 34 (lineHeight ~1,15, letterSpacing -0,5), titre de section 20 a 22, corps 16 a 17 (lineHeight 22 a 24), secondaire 14 a 15, legende 12 a 13 ; jamais moins de 11 ; au plus 4 tailles et 3 graisses (400, 500 ou 600, 700) par ecran ;
- la hierarchie vient de la taille ET de la graisse ET de la couleur, pas d'une taille demesuree ; casse de phrase, pas de Title Case ;
- montants : grands (36 a 44 pour un solde), graisse 600, devise plus petite et en gris, COLLEE au montant : une frame "row" ("gap" 4 a 6, "alignCross" "end") qui contient le montant puis la devise, jamais deux textes places independamment (la devise flotterait loin du chiffre).

Couleur (tout passe par "tokens.colors") :
- une famille de neutres (fond, surface, texte primaire, texte secondaire, separateur) + UN seul accent, reserve aux actions, a l'etat actif et aux valeurs cles ; + des couleurs semantiques (succes, erreur) desaturees : fond clair + texte fonce de la meme teinte ;
- texte jamais noir pur ni gris pale : primaire ~#111827, secondaire ~#6B7280 sur fond clair ; contraste >= 4,5:1 pour le texte, >= 3:1 pour les gros titres et les icones ;
- sans ombre : la profondeur vient des surfaces tonales (fond de page ~#F4F5F7, surfaces blanches par-dessus), d'une bordure de 1 px a faible contraste (~#E5E7EB) ou d'un separateur ; un dialogue ou une feuille basse s'accompagne d'un voile (rect noir a 30-40 % d'opacite) ; barres de navigation opaques avec un trait fin ; une barre d'application ("appBar") recoit "color" = la couleur de surface de son ecran, sinon elle garde la teinte rosee par defaut de Material ;
- mode sombre : surfaces en niveaux (#0B0B0F, #16161D, #1F1F28), jamais une simple inversion.

Formes et tailles :
- un seul systeme de rayons : 8 (petits elements), 12 (champs, boutons), 16 a 20 (surfaces), 999 (pastilles) ; rayon interieur = rayon exterieur - padding ;
- espacements et tailles en multiples de 4 ;
- cibles tactiles >= 44 x 44, espacees d'au moins 8 ; bouton principal 50 a 56 de haut, pleine largeur moins les marges ; champs 48 a 52 de haut.

Contenu :
- textes realistes et specifiques au domaine : vrais prenoms et noms locaux, montants "non ronds" avec devise (1 284,30 MAD), dates variees, libelles qui disent ou l'on est ;
- boutons nommes par leur action a l'imperatif ("Envoyer 250 MAD", "Continuer") ; erreur = probleme + remede ;
- jamais de Lorem ipsum, "John Doe", "Titre ici", "Bienvenue !" generique, ni de slogan creux.

Prototype (interactions) :
- chaque ecran dit ou l'on est, ou aller, comment revenir : bouton retour ou barre d'application vers "back", onglets relies a leurs ecrans ;
- navigation avant : "push" ou "slide" (direction "left"), 250 a 350 ms, "easeOut" ; feuille basse ou dialogue : "modal", 300 a 400 ms, "easeOut" ou "spring" ; changement d'onglet : "fade" 150 a 200 ms ou "none" ; jamais "easeIn" ni "linear" pour une navigation.

A refuser (le "look IA generique") :
- degrade violet-bleu, neon, plusieurs accents concurrents, tout centre ;
- grille de cartes identiques icone + titre + texte comme structure d'ecran ; widgets, graphiques et badges decoratifs sans information ;
- carte "metrique heros" + rangee de statistiques sans raison ; sur-titre au-dessus de chaque titre ; bordure gauche coloree sur les cartes ;
- rayons et espacements incoherents (10, 14, 22 melanges) ; petits textes gris pale illisibles ;
- emoji ou caracteres Unicode en guise d'icones ; site web pose dans un cadre de telephone, sans zones systeme.`
