// Prototype d'application bancaire mobile (donnees MANIFESTEMENT FICTIVES) :
// 21 ecrans de 390 x 844 relies par des interactions avec transitions, uniquement
// des composants mobiles semantiques. Construit en passant par les COMMANDES du
// document (History : chaque etape est validee et annulable), jamais en ecrivant
// le JSON a la main. Sert de demonstration de bout en bout ET de test
// d'acceptation de l'outil : voir exemples/banque.maquio et
// test/integration/banque.test.ts.
import {
  History,
  createComponentNode,
  createContainerNode,
  createDocument,
  createNodeCommand,
  createScreenCommand,
  createScreenNode,
  setInteractionsCommand,
  setTokensCommand,
  withAutoLayout,
} from '@maquio/core'
import type { MaquioDocument, Color, ComponentKind, ComponentPropsMap, ContainerKind, DevicePreset, FrameNode, Interaction, Node, Rect, TextNode, Transition } from '@maquio/core'

export const TELEPHONE: DevicePreset = { id: 'telephone-390', label: 'Téléphone 390 × 844', width: 390, height: 844, pixelRatio: 3 }
const W = TELEPHONE.width

// --- Marque : une couleur (violet Material 3, celle des composants natifs) et une typographie (Roboto) ---
const MARQUE: Color = { r: 0.404, g: 0.314, b: 0.643, a: 1 }
const ENCRE: Color = { r: 0.114, g: 0.106, b: 0.125, a: 1 }
const GRIS: Color = { r: 0.286, g: 0.271, b: 0.31, a: 1 }
const BLANC: Color = { r: 1, g: 1, b: 1, a: 1 }
const FOND: Color = { r: 0.996, g: 0.969, b: 1, a: 1 }
const VERT: Color = { r: 0.11, g: 0.48, b: 0.27, a: 1 }
const ROUGE: Color = { r: 0.7, g: 0.15, b: 0.12, a: 1 }

// --- Interactions ---
const push: Transition = { type: 'push', durationMs: 300, easing: 'easeInOut' }
const modal: Transition = { type: 'modal', durationMs: 350, easing: 'easeOut' }
const fade: Transition = { type: 'fade', durationMs: 350, easing: 'linear' }
const slide: Transition = { type: 'slide', direction: 'left', durationMs: 300, easing: 'easeOut' }
const none: Transition = { type: 'none' }
const tap = (target: string, transition: Transition = push): Interaction => ({ trigger: { type: 'tap' }, action: { type: 'navigate', target }, transition })
const back = (transition: Transition = none): Interaction => ({ trigger: { type: 'tap' }, action: { type: 'back' }, transition })
const overlay = (kind: 'dialog' | 'bottomSheet' | 'snackbar', target: string, transition: Transition = fade): Interaction => ({ trigger: { type: 'tap' }, action: { type: 'openOverlay', overlay: kind, target }, transition })
const close: Interaction = { trigger: { type: 'tap' }, action: { type: 'closeOverlay' }, transition: none }

// Identifiants stables des ecrans et des overlays (references par les interactions).
const ids = new Map<string, string>()
const id = (nom: string): string => {
  if (!ids.has(nom)) ids.set(nom, `banque-${nom}`)
  return ids.get(nom)!
}

type Extra = { interactions?: Interaction[]; nom?: string; id?: string }
function comp<K extends ComponentKind>(kind: K, frame: Partial<Rect>, props: Partial<ComponentPropsMap[K]>, extra: Extra = {}): Node {
  const node = createComponentNode(kind, { x: 0, y: 0, w: 100, h: 48, ...frame }, props as never, extra.nom) as Node
  return { ...node, ...(extra.id ? { id: extra.id } : {}), ...(extra.interactions ? { interactions: extra.interactions } : {}) } as Node
}
function cont(kind: ContainerKind, frame: Rect, extra: Extra & { children?: Node[]; fill?: Color | null; radius?: number; spec?: Record<string, unknown> } = {}): FrameNode {
  const node = createContainerNode(kind, frame, (extra.spec ?? {}) as never, extra.nom)
  return {
    ...node,
    ...(extra.id ? { id: extra.id } : {}),
    ...(extra.fill !== undefined ? { fills: extra.fill === null ? [{ type: 'none' as const }] : [{ type: 'solid' as const, color: extra.fill }] } : {}),
    ...(extra.radius !== undefined ? { cornerRadius: extra.radius } : {}),
    layout: { ...node.layout, mode: 'absolute' as const },
    children: extra.children ?? [],
    ...(extra.interactions ? { interactions: extra.interactions } : {}),
  }
}
function txt(nom: string, characters: string, x: number, y: number, w: number, size = 16, weight = 400, color: Color = ENCRE, align: 'left' | 'center' | 'right' = 'left'): TextNode {
  return {
    id: crypto.randomUUID(), name: nom, type: 'text', frame: { x, y, w, h: Math.round(size * 1.4) }, visible: true, locked: false, opacity: 1, rotation: 0, characters,
    style: { fontFamily: 'Roboto', fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.4), letterSpacing: 0, color, align },
  }
}
const bouton = (label: string, y: number, interactions: Interaction[], variant: 'primary' | 'secondary' | 'text' = 'primary', x = 24, w = W - 48, extra: Partial<ComponentPropsMap['button']> = {}) =>
  comp('button', { x, y, w, h: 48 }, { label, variant, color: MARQUE, ...extra }, { interactions, nom: `Bouton ${label}` })
const barre = (titre: string, retour: boolean, actions: ComponentPropsMap['appBar']['actions'] = []) =>
  comp('appBar', { x: 0, y: 0, w: W, h: 56 }, { title: titre, leading: retour ? 'back' : 'none', actions, centerTitle: false, color: BLANC }, { nom: `Barre ${titre}`, interactions: retour ? [back()] : [] })
const ligne = (titre: string, sous: string, y: number, interactions: Interaction[], icone?: ComponentPropsMap['listTile']['leadingIcon'], fin: ComponentPropsMap['listTile']['trailingIcon'] = 'chevronRight') =>
  comp('listTile', { x: 0, y, w: W, h: 64 }, { title: titre, subtitle: sous, ...(icone ? { leadingIcon: icone } : {}), trailingIcon: fin }, { interactions, nom: `Ligne ${titre}` })
const champ = (label: string, y: number, props: Partial<ComponentPropsMap['textField']> = {}) => comp('textField', { x: 24, y, w: W - 48, h: 56 }, { label, ...props }, { nom: `Champ ${label}` })

function navBasse(actif: number): Node {
  const items = [
    { label: 'Accueil', icon: 'home' as const, target: id('accueil') },
    { label: 'Comptes', icon: 'list' as const, target: id('comptes') },
    { label: 'Paiements', icon: 'send' as const, target: id('paiements') },
    { label: 'Cartes', icon: 'cart' as const, target: id('cartes') },
    { label: 'Profil', icon: 'person' as const, target: id('profil') },
  ]
  return comp('bottomNav', { x: 0, y: TELEPHONE.height - 80, w: W, h: 80 }, { items, selectedIndex: actif }, { nom: 'Navigation basse' })
}

type Ecran = { cle: string; nom: string; fond?: Color; enfants: Node[]; interactions?: Interaction[] }

function ecrans(): Ecran[] {
  const accueil = id('accueil')
  const tabs = (i: number) => navBasse(i)
  return [
    // --- Splash puis onboarding ---
    {
      cle: 'splash', nom: 'Splash', fond: MARQUE,
      interactions: [{ trigger: { type: 'afterDelay', ms: 2000 }, action: { type: 'navigate', target: id('onboarding1') }, transition: fade }],
      enfants: [
        comp('icon', { x: 163, y: 300, w: 64, h: 64 }, { name: 'cart', size: 64, color: BLANC }, { nom: 'Logo' }),
        txt('Nom', 'Banque Exemple', 0, 390, W, 30, 700, BLANC, 'center'),
        txt('Accroche', 'Votre banque, dans votre poche', 0, 436, W, 16, 400, BLANC, 'center'),
        comp('spinner', { x: 175, y: 700, w: 40, h: 40 }, { color: BLANC }, { nom: 'Chargement' }),
      ],
    },
    {
      cle: 'onboarding1', nom: 'Onboarding 1',
      enfants: [
        comp('icon', { x: 145, y: 160, w: 100, h: 100 }, { name: 'home', size: 96, color: MARQUE }, { nom: 'Illustration' }),
        txt('Titre', 'Tout votre argent, au même endroit', 32, 330, W - 64, 26, 700, ENCRE, 'center'),
        txt('Texte', 'Consultez vos comptes et vos opérations en un coup d’œil.', 40, 410, W - 80, 16, 400, GRIS, 'center'),
        comp('progressBar', { x: 155, y: 560, w: 80, h: 8 }, { value: 0.5, indeterminate: false, color: MARQUE }, { nom: 'Progression' }),
        bouton('Suivant', 700, [tap(id('onboarding2'), slide)]),
        bouton('Passer', 760, [tap(id('connexion'), fade)], 'text'),
      ],
    },
    {
      cle: 'onboarding2', nom: 'Onboarding 2',
      enfants: [
        comp('icon', { x: 145, y: 160, w: 100, h: 100 }, { name: 'lock', size: 96, color: MARQUE }, { nom: 'Illustration' }),
        txt('Titre', 'Sécurisé, avec votre code PIN', 32, 330, W - 64, 26, 700, ENCRE, 'center'),
        txt('Texte', 'Chaque virement est confirmé par un code reçu par SMS.', 40, 410, W - 80, 16, 400, GRIS, 'center'),
        comp('progressBar', { x: 155, y: 560, w: 80, h: 8 }, { value: 1, indeterminate: false, color: MARQUE }, { nom: 'Progression' }),
        bouton('Commencer', 700, [tap(id('connexion'), slide)]),
        bouton('Retour', 760, [back(slide)], 'text'),
      ],
    },
    // --- Connexion, PIN ---
    {
      cle: 'connexion', nom: 'Connexion',
      enfants: [
        txt('Titre', 'Connexion', 24, 110, W - 48, 30, 700),
        txt('Sous-titre', 'Entrez vos identifiants (démonstration)', 24, 154, W - 48, 15, 400, GRIS),
        champ('Identifiant', 230, { value: 'alex.exemple', leadingIcon: 'person' }),
        champ('Mot de passe', 310, { password: true, value: 'motdepasse', leadingIcon: 'lock' }),
        bouton('Mot de passe oublié ?', 380, [overlay('bottomSheet', id('feuille-oubli'), modal)], 'text', 24, 220),
        bouton('Se connecter', 470, [tap(id('pin'), modal)]),
        txt('Mention', 'Données fictives — aucune vraie banque.', 24, 780, W - 48, 12, 400, GRIS, 'center'),
        cont('bottomSheet', { x: 0, y: 504, w: W, h: 340 }, {
          id: id('feuille-oubli'), nom: 'Mot de passe oublié', fill: BLANC, radius: 24,
          children: [
            txt('Titre', 'Mot de passe oublié', 24, 40, W - 48, 22, 700),
            txt('Texte', 'Un lien de réinitialisation sera envoyé à alex@exemple.invalid.', 24, 82, W - 48, 15, 400, GRIS),
            bouton('Envoyer le lien', 160, [close], 'primary', 24, W - 48),
            bouton('Fermer', 220, [close], 'text', 24, W - 48),
          ],
        }),
      ],
    },
    {
      cle: 'pin', nom: 'PIN',
      enfants: [
        barre('Code PIN', true),
        txt('Titre', 'Saisissez votre code PIN', 24, 90, W - 48, 22, 700, ENCRE, 'center'),
        ...[0, 1, 2, 3, 4, 5].map((i) => comp('badge', { x: 105 + i * 32, y: 150, w: 14, h: 14 }, { text: '', color: i < 4 ? MARQUE : undefined }, { nom: `Point ${i + 1}` })),
        ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '✓'].map((t, i) =>
          t === ''
            ? comp('spacer', { x: 40, y: 230 + 3 * 100, w: 90, h: 80 }, {}, { nom: 'Vide' })
            : comp('button', { x: 40 + (i % 3) * 110, y: 230 + Math.floor(i / 3) * 100, w: 90, h: 80 }, { label: t, variant: t === '✓' ? 'primary' : 'secondary', color: MARQUE }, { nom: `Touche ${t}`, interactions: t === '✓' ? [tap(accueil, fade)] : [] }),
        ),
        bouton('Utiliser la biométrie', 700, [tap(accueil, fade)], 'text', 24, W - 48, { icon: 'person' }),
      ],
    },
    // --- Accueil ---
    {
      cle: 'accueil', nom: 'Accueil',
      enfants: [
        comp('appBar', { x: 0, y: 0, w: W, h: 56 }, { title: 'Bonjour, Alex', leading: 'none', actions: ['notifications'], centerTitle: false, color: BLANC }, { nom: 'Barre Accueil', interactions: [] }),
        cont('card', { x: 16, y: 72, w: W - 32, h: 110 }, {
          nom: 'Solde total', fill: MARQUE, radius: 16, spec: { elevation: 2 }, interactions: [tap(id('comptes'), fade)],
          children: [txt('Libellé', 'Solde total', 20, 16, 200, 14, 400, BLANC), txt('Montant', '10 570,32 €', 20, 44, 300, 32, 700, BLANC)],
        }),
        cont('card', { x: 16, y: 198, w: 175, h: 96 }, { nom: 'Compte courant', fill: BLANC, radius: 12, spec: { elevation: 1 }, interactions: [tap(id('compte'))], children: [txt('Type', 'Compte courant', 12, 12, 150, 13, 400, GRIS), txt('Solde', '2 450,32 €', 12, 44, 150, 20, 700)] }),
        cont('card', { x: 199, y: 198, w: 175, h: 96 }, { nom: 'Livret épargne', fill: BLANC, radius: 12, spec: { elevation: 1 }, interactions: [tap(id('compte'))], children: [txt('Type', 'Livret épargne', 12, 12, 150, 13, 400, GRIS), txt('Solde', '8 120,00 €', 12, 44, 150, 20, 700)] }),
        txt('Raccourcis', 'Raccourcis', 16, 316, 200, 16, 700),
        ...[
          ['Virement', 'send', [tap(id('virement1'))]],
          ['Payer', 'cart', [tap(id('factures'))]],
          ['Recharger', 'phone', [tap(id('recharge'))]],
          ['Plus', 'moreVert', [overlay('bottomSheet', id('feuille-plus'), modal)]],
        ].flatMap(([label, icone, inter], i) => [
          comp('iconButton', { x: 28 + i * 90, y: 346, w: 52, h: 52 }, { icon: icone as 'send', variant: 'filled', color: MARQUE }, { nom: `Raccourci ${label}`, interactions: inter as Interaction[] }),
          txt(`Libellé ${label}`, label as string, 16 + i * 90, 404, 76, 12, 400, ENCRE, 'center'),
        ]),
        txt('Dernières opérations', 'Dernières opérations', 16, 440, 250, 16, 700),
        ligne('Supermarché Exemple', 'Aujourd’hui · −54,20 €', 468, [tap(id('operation'))], 'cart'),
        ligne('Salaire Société Exemple', 'Hier · +2 100,00 €', 532, [tap(id('operation'))], 'send'),
        ligne('Café du coin', '28 sept. · −3,50 €', 596, [tap(id('operation'))], 'star'),
        navBasse(0),
        cont('bottomSheet', { x: 0, y: 504, w: W, h: 340 }, {
          id: id('feuille-plus'), nom: 'Plus d’actions', fill: BLANC, radius: 24,
          children: [
            txt('Titre', 'Plus d’actions', 24, 36, W - 48, 20, 700),
            ligne('Bénéficiaires', 'Gérer mes bénéficiaires', 76, [tap(id('paiements'))], 'person'),
            ligne('Notifications', 'Alertes et messages', 140, [tap(id('notifications'))], 'notifications'),
            ligne('États de l’application', 'Chargement, erreur, liste vide', 204, [tap(id('etats'))], 'info'),
          ],
        }),
      ],
    },
    {
      cle: 'comptes', nom: 'Comptes',
      enfants: [
        barre('Mes comptes', false),
        cont('card', { x: 16, y: 72, w: W - 32, h: 96 }, { nom: 'Compte courant', fill: BLANC, radius: 12, spec: { elevation: 1 }, interactions: [tap(id('compte'))], children: [txt('Type', 'Compte courant', 16, 14, 250, 14, 400, GRIS), txt('IBAN', 'FR76 XXXX XXXX XXXX XXXX XXXX 123', 16, 38, 320, 13), txt('Solde', '2 450,32 €', 16, 60, 250, 22, 700)] }),
        cont('card', { x: 16, y: 184, w: W - 32, h: 96 }, { nom: 'Livret épargne', fill: BLANC, radius: 12, spec: { elevation: 1 }, interactions: [tap(id('compte'))], children: [txt('Type', 'Livret épargne', 16, 14, 250, 14, 400, GRIS), txt('IBAN', 'FR76 XXXX XXXX XXXX XXXX XXXX 456', 16, 38, 320, 13), txt('Solde', '8 120,00 €', 16, 60, 250, 22, 700)] }),
        bouton('Ouvrir un compte (bientôt)', 300, [overlay('snackbar', id('snack-bientot'))], 'secondary'),
        tabs(1),
        comp('snackbar', { x: 16, y: 690, w: W - 32, h: 48 }, { message: 'Bientôt disponible', actionLabel: 'OK' }, { id: id('snack-bientot'), nom: 'Bientôt disponible' }),
      ],
    },
    {
      cle: 'compte', nom: 'Détail du compte',
      enfants: [
        barre('Compte courant', true, ['search']),
        txt('Solde', '2 450,32 €', 24, 76, 300, 30, 700),
        txt('IBAN', 'FR76 XXXX XXXX XXXX XXXX XXXX 123', 24, 124, 280, 13, 400, GRIS),
        comp('iconButton', { x: 318, y: 114, w: 48, h: 40 }, { icon: 'share', variant: 'standard', color: MARQUE }, { nom: 'Copier l’IBAN', interactions: [overlay('snackbar', id('snack-iban'))] }),
        champ('Rechercher une opération', 168, { leadingIcon: 'search' }),
        comp('chip', { x: 24, y: 238, w: 80, h: 36 }, { label: 'Tout', variant: 'filter', selected: true }, { nom: 'Filtre Tout' }),
        comp('chip', { x: 114, y: 238, w: 96, h: 36 }, { label: 'Entrées', variant: 'filter', selected: false }, { nom: 'Filtre Entrées' }),
        comp('chip', { x: 220, y: 238, w: 90, h: 36 }, { label: 'Sorties', variant: 'filter', selected: false }, { nom: 'Filtre Sorties' }),
        ligne('Supermarché Exemple', 'Aujourd’hui · −54,20 €', 290, [tap(id('operation'))], 'cart'),
        ligne('Salaire Société Exemple', 'Hier · +2 100,00 €', 354, [tap(id('operation'))], 'send'),
        ligne('Café du coin', '28 sept. · −3,50 €', 418, [tap(id('operation'))], 'star'),
        ligne('Loyer Exemple', '27 sept. · −780,00 €', 482, [tap(id('operation'))], 'home'),
        ligne('Abonnement Exemple', '25 sept. · −9,99 €', 546, [tap(id('operation'))], 'refresh'),
        comp('snackbar', { x: 16, y: 760, w: W - 32, h: 48 }, { message: 'IBAN copié', actionLabel: '' }, { id: id('snack-iban'), nom: 'IBAN copié' }),
      ],
    },
    {
      cle: 'operation', nom: 'Détail de l’opération',
      enfants: [
        barre('Opération', true),
        comp('avatar', { x: 167, y: 80, w: 56, h: 56 }, { initials: 'SE', src: '', color: undefined }, { nom: 'Commerçant' }),
        txt('Libellé', 'Supermarché Exemple', 0, 150, W, 20, 700, ENCRE, 'center'),
        txt('Montant', '−54,20 €', 0, 184, W, 30, 700, ROUGE, 'center'),
        cont('card', { x: 16, y: 244, w: W - 32, h: 260 }, {
          nom: 'Détails', fill: BLANC, radius: 12, spec: { elevation: 1 },
          children: [
            txt('Date', 'Date', 16, 16, 120, 13, 400, GRIS), txt('Date valeur', 'Mardi 30 septembre 2026', 16, 36, 300, 15),
            txt('Compte', 'Compte', 16, 80, 120, 13, 400, GRIS), txt('Compte valeur', 'Compte courant · FR76 XXXX … 123', 16, 100, 300, 15),
            txt('Catégorie', 'Catégorie', 16, 144, 120, 13, 400, GRIS), txt('Catégorie valeur', 'Courses', 16, 164, 300, 15),
            txt('Référence', 'Référence', 16, 208, 120, 13, 400, GRIS), txt('Référence valeur', 'REF-000000-EXEMPLE', 16, 228, 300, 15),
          ],
        }),
        bouton('Signaler un problème', 540, [overlay('snackbar', id('snack-signalement'))], 'secondary'),
        comp('snackbar', { x: 16, y: 760, w: W - 32, h: 48 }, { message: 'Signalement envoyé (démo)', actionLabel: '' }, { id: id('snack-signalement'), nom: 'Signalement envoyé' }),
      ],
    },
    // --- Virement en 4 etapes ---
    {
      cle: 'virement1', nom: 'Virement 1 · Bénéficiaire',
      enfants: [
        barre('Virement · 1/4', true),
        txt('Titre', 'À qui envoyer de l’argent ?', 24, 80, W - 48, 20, 700),
        ligne('Camille Exemple', 'FR76 XXXX XXXX XXXX XXXX XXXX 701', 120, [tap(id('virement2'))], 'person'),
        ligne('Dominique Exemple', 'FR76 XXXX XXXX XXXX XXXX XXXX 702', 184, [tap(id('virement2'))], 'person'),
        ligne('Loyer — Agence Exemple', 'FR76 XXXX XXXX XXXX XXXX XXXX 703', 248, [tap(id('virement2'))], 'home'),
        bouton('Nouveau bénéficiaire', 340, [tap(id('ajout'), modal)], 'secondary', 24, W - 48, { icon: 'add' }),
      ],
    },
    {
      cle: 'virement2', nom: 'Virement 2 · Montant',
      enfants: [
        barre('Virement · 2/4', true),
        txt('Titre', 'Combien et pourquoi ?', 24, 80, W - 48, 20, 700),
        champ('Montant (€)', 130, { value: '120,00', leadingIcon: 'edit' }),
        champ('Motif', 206, { value: 'Remboursement' }),
        comp('datePicker', { x: 24, y: 282, w: W - 48, h: 56 }, { label: 'Date d’exécution', value: '2026-10-05', disabled: false }, { nom: 'Date' }),
        comp('checkbox', { x: 24, y: 358, w: W - 48, h: 40 }, { label: 'Virement instantané', checked: true, disabled: false }, { nom: 'Instantané' }),
        bouton('Continuer', 700, [tap(id('virement3'))]),
      ],
    },
    {
      cle: 'virement3', nom: 'Virement 3 · Récapitulatif',
      enfants: [
        barre('Virement · 3/4', true),
        txt('Titre', 'Vérifiez avant de confirmer', 24, 80, W - 48, 20, 700),
        cont('card', { x: 16, y: 124, w: W - 32, h: 240 }, {
          nom: 'Récapitulatif', fill: BLANC, radius: 12, spec: { elevation: 1 },
          children: [
            txt('Montant', '120,00 €', 16, 16, 300, 28, 700, MARQUE),
            txt('De', 'De', 16, 70, 100, 13, 400, GRIS), txt('De valeur', 'Compte courant', 16, 90, 300, 15),
            txt('Vers', 'Vers', 16, 126, 100, 13, 400, GRIS), txt('Vers valeur', 'Camille Exemple', 16, 146, 300, 15),
            txt('Motif', 'Motif', 16, 182, 100, 13, 400, GRIS), txt('Motif valeur', 'Remboursement', 16, 202, 300, 15),
          ],
        }),
        bouton('Confirmer le virement', 700, [overlay('dialog', id('dialogue-otp'), fade)]),
        comp('dialog', { x: 40, y: 280, w: W - 80, h: 220 }, { title: 'Code de confirmation', message: 'Saisissez le code reçu par SMS (démonstration : 123456).', confirmLabel: 'Valider', cancelLabel: '' }, { id: id('dialogue-otp'), nom: 'Confirmation OTP', interactions: [tap(id('virement4'), modal)] }),
      ],
    },
    {
      cle: 'virement4', nom: 'Virement 4 · Succès',
      enfants: [
        comp('icon', { x: 145, y: 200, w: 100, h: 100 }, { name: 'check', size: 96, color: VERT }, { nom: 'Succès' }),
        txt('Titre', 'Virement effectué', 0, 330, W, 26, 700, ENCRE, 'center'),
        txt('Texte', '120,00 € envoyés à Camille Exemple.', 40, 380, W - 80, 16, 400, GRIS, 'center'),
        bouton('Retour à l’accueil', 700, [tap(accueil, fade)]),
      ],
    },
    {
      cle: 'ajout', nom: 'Ajout d’un bénéficiaire',
      enfants: [
        barre('Nouveau bénéficiaire', true),
        champ('Nom du bénéficiaire', 100, { leadingIcon: 'person' }),
        champ('IBAN', 180, { value: 'FR76 XXXX XXXX XXXX XXXX XXXX 999', helperText: 'Format FR76, 27 caractères' }),
        comp('checkbox', { x: 24, y: 270, w: W - 48, h: 40 }, { label: 'Ajouter aux favoris', checked: false, disabled: false }, { nom: 'Favori' }),
        bouton('Enregistrer', 700, [back(modal)]),
      ],
    },
    // --- Paiements ---
    {
      cle: 'paiements', nom: 'Paiements',
      enfants: [
        barre('Paiements', false),
        ligne('Faire un virement', 'Vers un bénéficiaire', 72, [tap(id('virement1'))], 'send'),
        ligne('Payer une facture', '3 factures à régler', 136, [tap(id('factures'))], 'cart'),
        ligne('Recharge mobile', 'Forfaits et cartes prépayées', 200, [tap(id('recharge'))], 'phone'),
        ligne('Ajouter un bénéficiaire', 'IBAN d’un proche', 264, [tap(id('ajout'), modal)], 'person', 'add'),
        txt('Bénéficiaires', 'Bénéficiaires', 16, 350, 250, 16, 700),
        ligne('Camille Exemple', 'FR76 XXXX XXXX XXXX XXXX XXXX 701', 380, [tap(id('virement2'))], 'person'),
        ligne('Dominique Exemple', 'FR76 XXXX XXXX XXXX XXXX XXXX 702', 444, [tap(id('virement2'))], 'person'),
        navBasse(2),
      ],
    },
    {
      cle: 'factures', nom: 'Factures',
      enfants: [
        barre('Payer une facture', true),
        ligne('Électricité Exemple', 'Échéance 12 oct. · 64,80 €', 72, [], 'info', 'check'),
        ligne('Internet Exemple', 'Échéance 15 oct. · 29,99 €', 136, [], 'info', 'check'),
        ligne('Eau Exemple', 'Échéance 20 oct. · 38,40 €', 200, [], 'info', 'check'),
        comp('progressBar', { x: 24, y: 300, w: W - 48, h: 8 }, { value: 0.66, indeterminate: false, color: MARQUE }, { nom: 'Budget du mois' }),
        txt('Budget', 'Budget du mois : 66 % utilisé', 24, 318, W - 48, 14, 400, GRIS),
        bouton('Payer les 3 factures', 700, [overlay('snackbar', id('snack-factures'))]),
        comp('snackbar', { x: 16, y: 760, w: W - 32, h: 48 }, { message: 'Paiement effectué (démo)', actionLabel: 'Annuler' }, { id: id('snack-factures'), nom: 'Paiement effectué' }),
      ],
    },
    {
      cle: 'recharge', nom: 'Recharge mobile',
      enfants: [
        barre('Recharge mobile', true),
        comp('dropdown', { x: 24, y: 80, w: W - 48, h: 56 }, { label: 'Opérateur', options: ['Opérateur Exemple A', 'Opérateur Exemple B'], selectedIndex: 0, disabled: false }, { nom: 'Opérateur' }),
        champ('Numéro de téléphone', 156, { value: '06 00 00 00 00', leadingIcon: 'phone' }),
        txt('Montant', 'Montant', 24, 246, 200, 14, 400, GRIS),
        comp('chip', { x: 24, y: 272, w: 80, h: 40 }, { label: '10 €', variant: 'filter', selected: false }, { nom: '10 €' }),
        comp('chip', { x: 114, y: 272, w: 80, h: 40 }, { label: '20 €', variant: 'filter', selected: true }, { nom: '20 €' }),
        comp('chip', { x: 204, y: 272, w: 80, h: 40 }, { label: '50 €', variant: 'filter', selected: false }, { nom: '50 €' }),
        comp('radio', { x: 24, y: 340, w: W - 48, h: 40 }, { label: 'Depuis le compte courant', selected: true, disabled: false }, { nom: 'Compte' }),
        bouton('Recharger', 700, [overlay('snackbar', id('snack-recharge'))]),
        comp('snackbar', { x: 16, y: 760, w: W - 32, h: 48 }, { message: 'Recharge effectuée (démo)', actionLabel: '' }, { id: id('snack-recharge'), nom: 'Recharge effectuée' }),
      ],
    },
    // --- Cartes ---
    {
      cle: 'cartes', nom: 'Cartes',
      enfants: [
        barre('Mes cartes', false),
        cont('card', { x: 20, y: 76, w: W - 40, h: 200 }, {
          nom: 'Carte Visa Exemple', fill: MARQUE, radius: 18, spec: { elevation: 4 },
          children: [
            txt('Réseau', 'EXEMPLE', 20, 18, 150, 16, 700, BLANC),
            txt('Numéro', '•••• •••• •••• 0000', 20, 100, 300, 20, 500, BLANC),
            txt('Titulaire', 'ALEX EXEMPLE', 20, 150, 200, 14, 400, BLANC),
            txt('Expiration', '12/29', 270, 150, 60, 14, 400, BLANC),
          ],
        }),
        comp('switch', { x: 24, y: 300, w: W - 48, h: 48 }, { label: 'Carte verrouillée', checked: false, disabled: false }, { nom: 'Verrouiller', interactions: [overlay('dialog', id('dialogue-blocage'), fade)] }),
        txt('Plafond', 'Plafond de paiement mensuel', 24, 370, W - 48, 15, 700),
        comp('slider', { x: 24, y: 400, w: W - 48, h: 40 }, { value: 1500, min: 0, max: 3000, disabled: false }, { nom: 'Plafond' }),
        txt('Plafond valeur', '1 500 € / mois', 24, 446, W - 48, 14, 400, GRIS),
        bouton('Afficher le PIN', 520, [overlay('bottomSheet', id('feuille-pin'), modal)], 'secondary'),
        navBasse(3),
        comp('dialog', { x: 40, y: 300, w: W - 80, h: 220 }, { title: 'Bloquer la carte ?', message: 'Les paiements seront refusés jusqu’au déblocage.', confirmLabel: 'Bloquer', cancelLabel: 'Annuler' }, { id: id('dialogue-blocage'), nom: 'Confirmer le blocage' }),
        cont('bottomSheet', { x: 0, y: 504, w: W, h: 340 }, {
          id: id('feuille-pin'), nom: 'PIN de la carte', fill: BLANC, radius: 24,
          children: [
            txt('Titre', 'Code PIN de la carte', 24, 40, W - 48, 20, 700),
            txt('PIN', '0 0 0 0', 0, 110, W, 44, 700, MARQUE, 'center'),
            txt('Texte', 'Données fictives. Ne partagez jamais votre vrai code.', 24, 190, W - 48, 14, 400, GRIS, 'center'),
            bouton('Masquer', 250, [close], 'primary', 24, W - 48),
          ],
        }),
      ],
    },
    // --- Notifications, profil ---
    {
      cle: 'notifications', nom: 'Notifications',
      enfants: [
        barre('Notifications', true),
        ligne('Virement reçu', 'Salaire Société Exemple · +2 100,00 €', 72, [tap(id('operation'))], 'send'),
        ligne('Paiement par carte', 'Supermarché Exemple · −54,20 €', 136, [tap(id('operation'))], 'cart'),
        ligne('Nouvel appareil', 'Connexion depuis un téléphone exemple', 200, [], 'warning'),
        ligne('Facture à régler', 'Électricité Exemple · échéance 12 oct.', 264, [tap(id('factures'))], 'info'),
      ],
    },
    {
      cle: 'profil', nom: 'Profil',
      enfants: [
        barre('Profil', false),
        comp('avatar', { x: 167, y: 76, w: 56, h: 56 }, { initials: 'AE', src: '', color: undefined }, { nom: 'Alex' }),
        txt('Nom', 'Alex Exemple', 0, 144, W, 20, 700, ENCRE, 'center'),
        txt('Mail', 'alex@exemple.invalid', 0, 174, W, 14, 400, GRIS, 'center'),
        comp('dropdown', { x: 24, y: 212, w: W - 48, h: 56 }, { label: 'Langue', options: ['Français', 'English'], selectedIndex: 0, disabled: false }, { nom: 'Langue' }),
        comp('switch', { x: 24, y: 284, w: W - 48, h: 48 }, { label: 'Thème sombre', checked: false, disabled: false }, { nom: 'Thème' }),
        comp('switch', { x: 24, y: 340, w: W - 48, h: 48 }, { label: 'Biométrie', checked: true, disabled: false }, { nom: 'Biométrie' }),
        comp('switch', { x: 24, y: 396, w: W - 48, h: 48 }, { label: 'Notifications', checked: true, disabled: false }, { nom: 'Notifications push' }),
        ligne('Notifications', 'Voir les alertes', 456, [tap(id('notifications'))], 'notifications'),
        ligne('États de l’application', 'Chargement, erreur, liste vide', 520, [tap(id('etats'))], 'info'),
        bouton('Déconnexion', 640, [overlay('dialog', id('dialogue-deconnexion'), fade)], 'secondary'),
        navBasse(4),
        comp('dialog', { x: 40, y: 300, w: W - 80, h: 220 }, { title: 'Se déconnecter ?', message: 'Vous devrez saisir à nouveau vos identifiants.', confirmLabel: 'Déconnexion', cancelLabel: 'Annuler' }, { id: id('dialogue-deconnexion'), nom: 'Confirmer la déconnexion', interactions: [tap(id('connexion'), fade)] }),
      ],
    },
    // --- Etats ---
    {
      cle: 'etats', nom: 'États',
      enfants: [
        barre('États de l’application', true),
        txt('Chargement', 'Chargement', 24, 80, 200, 16, 700),
        comp('spinner', { x: 175, y: 116, w: 40, h: 40 }, { color: MARQUE }, { nom: 'Chargement' }),
        txt('Erreur', 'Erreur réseau', 24, 190, 200, 16, 700),
        bouton('Simuler une erreur réseau', 222, [overlay('snackbar', id('snack-erreur'))], 'secondary'),
        txt('Liste vide', 'Liste vide', 24, 310, 200, 16, 700),
        comp('icon', { x: 175, y: 350, w: 40, h: 40 }, { name: 'list', size: 40, color: GRIS }, { nom: 'Vide' }),
        txt('Aucune opération', 'Aucune opération pour ce filtre', 0, 404, W, 15, 400, GRIS, 'center'),
        bouton('Réessayer', 700, [overlay('snackbar', id('snack-erreur'))]),
        comp('snackbar', { x: 16, y: 760, w: W - 32, h: 48 }, { message: 'Connexion impossible. Vérifiez votre réseau.', actionLabel: 'Réessayer' }, { id: id('snack-erreur'), nom: 'Erreur réseau' }),
      ],
    },
  ]
}

export function documentBanque(): MaquioDocument {
  const base = createDocument('Banque Exemple', TELEPHONE)
  const pageId = base.pages[0]!.id
  const history = new History(base)
  const run = (cmd: Parameters<typeof withAutoLayout>[0]) => history.execute(withAutoLayout(cmd))

  // Jetons de design : une couleur de marque, une typographie.
  run(setTokensCommand({
    colors: { marque: MARQUE, encre: ENCRE, gris: GRIS, fond: FOND, succes: VERT, erreur: ROUGE },
    typography: {
      titre: { fontFamily: 'Roboto', fontSize: 30, fontWeight: 700, lineHeight: 42, letterSpacing: 0, color: ENCRE, align: 'left' },
      corps: { fontFamily: 'Roboto', fontSize: 16, fontWeight: 400, lineHeight: 22, letterSpacing: 0, color: ENCRE, align: 'left' },
    },
    spacing: { s: 8, m: 16, l: 24 },
  }))

  const liste = ecrans()
  liste.forEach((e, i) => {
    const frame: Rect = { x: i * (W + 120), y: 0, w: W, h: TELEPHONE.height }
    const base = createScreenNode(e.nom, TELEPHONE, frame)
    const ecran: FrameNode = {
      ...base,
      id: id(e.cle),
      fills: [{ type: 'solid', color: e.fond ?? FOND }],
    }
    run(createScreenCommand(pageId, ecran))
    // Chaque element est cree PAR COMMANDE dans son ecran (annulable, valide).
    for (const enfant of e.enfants) {
      const sans = { ...enfant } as Node
      run(createNodeCommand(pageId, ecran.id, sans))
    }
  })
  // Interactions des ecrans (delai) puis des elements : posees apres creation de toutes les cibles.
  for (const e of liste) {
    if (e.interactions) run(setInteractionsCommand(pageId, id(e.cle), e.interactions))
  }
  return stabiliser(history.document)
}

export const BANQUE_ECRANS = (): string[] => ecrans().map((e) => e.nom)

// Identifiants STABLES (`bq-1`...) : le fichier livre doit etre reproductible
// octet pour octet. Les cibles de navigation, d'overlay et de barre basse suivent.
function stabiliser(doc: MaquioDocument): MaquioDocument {
  const map = new Map<string, string>()
  let n = 0
  const renum = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      const nid = `bq-${++n}`
      map.set(node.id, nid)
      return node.type === 'frame' ? { ...node, id: nid, children: renum(node.children) } : ({ ...node, id: nid } as Node)
    })
  const retarget = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      let next: Node = node
      if (next.interactions) {
        next = { ...next, interactions: next.interactions.map((i) => ('target' in i.action && i.action.target ? { ...i, action: { ...i.action, target: map.get(i.action.target) ?? i.action.target } } : i)) as Interaction[] }
      }
      if (next.type === 'component' && next.kind === 'bottomNav') {
        const items = (next.props.items as { target?: string }[]).map((it) => (it.target === undefined ? it : { ...it, target: map.get(it.target) ?? it.target }))
        next = { ...next, props: { ...next.props, items } } as Node
      }
      return next.type === 'frame' ? { ...next, children: retarget(next.children) } : next
    })
  const page = doc.pages[0]!
  return { ...doc, id: 'exemple-banque', pages: [{ ...page, id: 'page-1', nodes: retarget(renum(page.nodes)) }] }
}
