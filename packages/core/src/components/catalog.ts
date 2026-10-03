// Catalogue des composants mobiles : source UNIQUE de ce que la palette
// propose, de ce que l'inspecteur sait editer et de la valeur par defaut de
// chaque composant. Donnees pures (aucun React, aucun DOM) : le renderer, les
// exportateurs et les tests lisent le meme tableau, donc un composant
// ajoute ici apparait partout ou ne peut pas apparaitre a moitie.
import type { Color, FrameNode, Layout, Node, Rect } from '../model/types'
import { ICON_NAMES } from './icons'
import type { IconName } from './icons'
import type { ComponentKind, ComponentPropsMap, ContainerKind, ContainerSpec } from './props'

export const PALETTE_CATEGORIES = [
  'Actions',
  'Saisie',
  'Affichage',
  'Listes',
  'Navigation',
  'Mise en page',
  'Overlays',
] as const

export type PaletteCategory = (typeof PALETTE_CATEGORIES)[number]

// --- Champs editables (l'inspecteur en derive ses controles) ---

type FieldBase = { key: string; label: string }

export type FieldDef = FieldBase &
  (
    | { type: 'text'; multiline?: boolean }
    | { type: 'number'; min?: number; max?: number; integer?: boolean }
    | { type: 'boolean' }
    | { type: 'select'; options: { value: string; label: string }[] }
    // Icone du jeu commun ; `optional` : peut etre retiree (champ absent).
    | { type: 'icon'; optional?: boolean }
    // Couleur de remplacement ; absente = couleur du theme de la cible.
    | { type: 'color' }
    // Liste de chaines, une par ligne.
    | { type: 'strings' }
    // Liste d'icones (actions d'une barre d'application).
    | { type: 'icons' }
    // Entrees de navigation (libelle + icone + ecran cible).
    | { type: 'navItems'; iconOptional: boolean }
  )

const text = (key: string, label: string, multiline = false): FieldDef => ({ key, label, type: 'text', multiline })
const bool = (key: string, label: string): FieldDef => ({ key, label, type: 'boolean' })
const num = (key: string, label: string, min?: number, max?: number, integer = false): FieldDef => ({
  key,
  label,
  type: 'number',
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
  integer,
})
const select = (key: string, label: string, options: [string, string][]): FieldDef => ({
  key,
  label,
  type: 'select',
  options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
})
const icon = (key: string, label: string, optional = false): FieldDef => ({ key, label, type: 'icon', optional })
const color = (): FieldDef => ({ key: 'color', label: 'Couleur', type: 'color' })

// --- Definitions ---

export type Preset<P> = { id: string; label: string; props: Partial<P>; size?: { w: number; h: number }; keywords?: string[] }

export type ComponentDefinition<K extends ComponentKind = ComponentKind> = {
  kind: K
  label: string
  category: PaletteCategory
  // Mots-cles de recherche (nom natif, synonymes anglais).
  keywords: string[]
  // Taille a la creation, en points de l'ecran.
  size: { w: number; h: number }
  props: ComponentPropsMap[K]
  fields: FieldDef[]
  // Variantes proposees comme entrees distinctes de la palette.
  presets: Preset<ComponentPropsMap[K]>[]
}

function def<K extends ComponentKind>(d: ComponentDefinition<K>): ComponentDefinition<K> {
  return d
}

const sizeField = select('size', 'Taille', [
  ['small', 'Petit'],
  ['regular', 'Normal'],
  ['large', 'Grand'],
])

export const COMPONENT_DEFINITIONS: { [K in ComponentKind]: ComponentDefinition<K> } = {
  // --- Actions ---
  button: def({
    kind: 'button',
    label: 'Bouton',
    category: 'Actions',
    keywords: ['button', 'elevatedbutton', 'pressable', 'cta', 'action'],
    size: { w: 160, h: 48 },
    props: { label: 'Bouton', variant: 'primary', disabled: false },
    fields: [
      text('label', 'Libellé'),
      select('variant', 'Variante', [
        ['primary', 'Primaire'],
        ['secondary', 'Secondaire'],
        ['text', 'Texte'],
      ]),
      bool('disabled', 'Désactivé'),
      icon('icon', 'Icône', true),
      color(),
    ],
    presets: [
      { id: 'button-secondary', label: 'Bouton secondaire', props: { variant: 'secondary' } },
      { id: 'button-text', label: 'Bouton texte', props: { variant: 'text' } },
      { id: 'button-disabled', label: 'Bouton désactivé', props: { disabled: true } },
    ],
  }),
  iconButton: def({
    kind: 'iconButton',
    label: 'Bouton icône',
    category: 'Actions',
    keywords: ['iconbutton', 'icon button', 'bouton rond'],
    size: { w: 48, h: 48 },
    props: { icon: 'favorite', variant: 'standard', disabled: false },
    fields: [
      icon('icon', 'Icône'),
      select('variant', 'Variante', [
        ['standard', 'Standard'],
        ['filled', 'Plein'],
        ['outlined', 'Contour'],
      ]),
      bool('disabled', 'Désactivé'),
      color(),
    ],
    presets: [{ id: 'iconButton-filled', label: 'Bouton icône plein', props: { variant: 'filled' } }],
  }),
  fab: def({
    kind: 'fab',
    label: 'FAB',
    category: 'Actions',
    keywords: ['fab', 'floating action button', 'floatingactionbutton', 'bouton flottant'],
    size: { w: 56, h: 56 },
    props: { icon: 'add', label: '', size: 'regular' },
    fields: [icon('icon', 'Icône'), text('label', 'Libellé (étendu)'), sizeField, color()],
    presets: [{ id: 'fab-extended', label: 'FAB étendu', props: { label: 'Créer' }, size: { w: 120, h: 56 } }],
  }),

  // --- Saisie ---
  textField: def({
    kind: 'textField',
    label: 'Champ de texte',
    category: 'Saisie',
    keywords: ['textfield', 'text field', 'input', 'textinput', 'outlinedtextfield', 'saisie', 'champ'],
    size: { w: 328, h: 56 },
    props: {
      label: 'Libellé',
      placeholder: '',
      value: '',
      password: false,
      multiline: false,
      helperText: '',
      errorText: '',
      disabled: false,
    },
    fields: [
      text('label', 'Libellé'),
      text('placeholder', 'Indication'),
      text('value', 'Valeur'),
      bool('password', 'Mot de passe'),
      bool('multiline', 'Multiligne'),
      text('helperText', 'Aide'),
      text('errorText', 'Erreur'),
      bool('disabled', 'Désactivé'),
      icon('leadingIcon', 'Icône', true),
    ],
    presets: [
      { id: 'textField-password', label: 'Mot de passe', props: { label: 'Mot de passe', password: true, leadingIcon: 'lock' }, keywords: ['password'] },
      { id: 'textField-multiline', label: 'Texte multiligne', props: { label: 'Message', multiline: true }, size: { w: 328, h: 120 }, keywords: ['textarea'] },
      { id: 'textField-error', label: 'Champ en erreur', props: { label: 'E-mail', value: 'nom@', errorText: 'Adresse invalide' }, size: { w: 328, h: 76 }, keywords: ['error', 'erreur'] },
    ],
  }),
  checkbox: def({
    kind: 'checkbox',
    label: 'Case à cocher',
    category: 'Saisie',
    keywords: ['checkbox', 'check'],
    size: { w: 200, h: 40 },
    props: { label: 'Option', checked: true, disabled: false },
    fields: [text('label', 'Libellé'), bool('checked', 'Cochée'), bool('disabled', 'Désactivée')],
    presets: [],
  }),
  switch: def({
    kind: 'switch',
    label: 'Interrupteur',
    category: 'Saisie',
    keywords: ['switch', 'toggle', 'bascule'],
    size: { w: 240, h: 48 },
    props: { label: 'Activer', checked: true, disabled: false },
    fields: [text('label', 'Libellé'), bool('checked', 'Activé'), bool('disabled', 'Désactivé')],
    presets: [],
  }),
  radio: def({
    kind: 'radio',
    label: 'Bouton radio',
    category: 'Saisie',
    keywords: ['radio', 'radiobutton', 'choix unique'],
    size: { w: 200, h: 40 },
    props: { label: 'Choix', selected: true, disabled: false },
    fields: [text('label', 'Libellé'), bool('selected', 'Sélectionné'), bool('disabled', 'Désactivé')],
    presets: [],
  }),
  slider: def({
    kind: 'slider',
    label: 'Curseur',
    category: 'Saisie',
    keywords: ['slider', 'range', 'curseur'],
    size: { w: 328, h: 40 },
    props: { value: 40, min: 0, max: 100, disabled: false },
    fields: [num('value', 'Valeur'), num('min', 'Minimum'), num('max', 'Maximum'), bool('disabled', 'Désactivé')],
    presets: [],
  }),
  dropdown: def({
    kind: 'dropdown',
    label: 'Liste déroulante',
    category: 'Saisie',
    keywords: ['dropdown', 'select', 'picker', 'menu déroulant', 'dropdownbutton'],
    size: { w: 328, h: 56 },
    props: { label: 'Choisir', options: ['Option 1', 'Option 2', 'Option 3'], selectedIndex: 0, disabled: false },
    fields: [
      text('label', 'Libellé'),
      { key: 'options', label: 'Options', type: 'strings' },
      num('selectedIndex', 'Option choisie (-1 : aucune)', -1, undefined, true),
      bool('disabled', 'Désactivée'),
    ],
    presets: [],
  }),
  datePicker: def({
    kind: 'datePicker',
    label: 'Sélecteur de date',
    category: 'Saisie',
    keywords: ['datepicker', 'date picker', 'calendar', 'calendrier', 'date'],
    size: { w: 328, h: 56 },
    props: { label: 'Date', value: '', disabled: false },
    fields: [text('label', 'Libellé'), text('value', 'Date (aaaa-mm-jj)'), bool('disabled', 'Désactivé')],
    presets: [],
  }),

  // --- Affichage ---
  icon: def({
    kind: 'icon',
    label: 'Icône',
    category: 'Affichage',
    keywords: ['icon', 'symbol', 'material icons', 'sf symbols', 'pictogramme'],
    size: { w: 24, h: 24 },
    props: { name: 'star', size: 24 },
    fields: [icon('name', 'Icône'), num('size', 'Taille', 1), color()],
    presets: [],
  }),
  avatar: def({
    kind: 'avatar',
    label: 'Avatar',
    category: 'Affichage',
    keywords: ['avatar', 'circleavatar', 'profil', 'photo'],
    size: { w: 48, h: 48 },
    props: { initials: 'AB', src: '' },
    fields: [text('initials', 'Initiales'), text('src', 'Image (chemin ou URL)'), color()],
    presets: [],
  }),
  badge: def({
    kind: 'badge',
    label: 'Badge',
    category: 'Affichage',
    keywords: ['badge', 'pastille', 'compteur'],
    size: { w: 24, h: 20 },
    props: { text: '3' },
    fields: [text('text', 'Texte (vide : pastille)'), color()],
    presets: [{ id: 'badge-dot', label: 'Badge pastille', props: { text: '' }, size: { w: 10, h: 10 } }],
  }),
  chip: def({
    kind: 'chip',
    label: 'Chip',
    category: 'Affichage',
    keywords: ['chip', 'tag', 'étiquette', 'filterchip'],
    size: { w: 96, h: 32 },
    props: { label: 'Chip', variant: 'assist', selected: false },
    fields: [
      text('label', 'Libellé'),
      select('variant', 'Variante', [
        ['assist', 'Action'],
        ['filter', 'Filtre'],
      ]),
      bool('selected', 'Sélectionné'),
      icon('icon', 'Icône', true),
    ],
    presets: [{ id: 'chip-filter', label: 'Chip filtre', props: { variant: 'filter', selected: true } }],
  }),
  divider: def({
    kind: 'divider',
    label: 'Séparateur',
    category: 'Affichage',
    keywords: ['divider', 'separator', 'hr', 'ligne'],
    size: { w: 328, h: 1 },
    props: { vertical: false, thickness: 1, indent: 0 },
    fields: [bool('vertical', 'Vertical'), num('thickness', 'Épaisseur', 0), num('indent', 'Retrait', 0), color()],
    presets: [{ id: 'divider-vertical', label: 'Séparateur vertical', props: { vertical: true }, size: { w: 1, h: 48 } }],
  }),
  progressBar: def({
    kind: 'progressBar',
    label: 'Barre de progression',
    category: 'Affichage',
    keywords: ['progress', 'progressbar', 'linearprogressindicator', 'avancement'],
    size: { w: 328, h: 4 },
    props: { value: 0.6, indeterminate: false },
    fields: [num('value', 'Valeur (0 à 1)', 0, 1), bool('indeterminate', 'Indéterminée'), color()],
    presets: [],
  }),
  spinner: def({
    kind: 'spinner',
    label: 'Indicateur de chargement',
    category: 'Affichage',
    keywords: ['spinner', 'loader', 'activity indicator', 'circularprogressindicator', 'chargement'],
    size: { w: 40, h: 40 },
    props: {},
    fields: [color()],
    presets: [],
  }),

  // --- Listes ---
  listTile: def({
    kind: 'listTile',
    label: 'Élément de liste',
    category: 'Listes',
    keywords: ['listtile', 'list tile', 'row item', 'cell', 'ligne de liste'],
    size: { w: 360, h: 72 },
    props: { title: 'Titre', subtitle: 'Sous-titre', leadingIcon: 'person', trailingIcon: 'chevronRight' },
    fields: [
      text('title', 'Titre'),
      text('subtitle', 'Sous-titre'),
      icon('leadingIcon', 'Icône de début', true),
      icon('trailingIcon', 'Icône de fin', true),
    ],
    presets: [],
  }),

  // --- Mise en page ---
  spacer: def({
    kind: 'spacer',
    label: 'Espaceur',
    category: 'Mise en page',
    keywords: ['spacer', 'espace', 'flex', 'gap'],
    size: { w: 48, h: 48 },
    props: { flex: 1 },
    fields: [num('flex', 'Poids (flex)', 1, undefined, true)],
    presets: [],
  }),

  // --- Navigation ---
  appBar: def({
    kind: 'appBar',
    label: 'Barre d’application',
    category: 'Navigation',
    keywords: ['appbar', 'app bar', 'toolbar', 'navigation bar', 'topappbar', 'scaffold', 'header', 'en-tête'],
    size: { w: 393, h: 56 },
    props: { title: 'Titre', leading: 'back', actions: ['search'], centerTitle: false },
    fields: [
      text('title', 'Titre'),
      select('leading', 'Bouton de début', [
        ['none', 'Aucun'],
        ['back', 'Retour'],
        ['menu', 'Menu (tiroir)'],
      ]),
      { key: 'actions', label: 'Actions', type: 'icons' },
      bool('centerTitle', 'Titre centré'),
      color(),
    ],
    presets: [],
  }),
  bottomNav: def({
    kind: 'bottomNav',
    label: 'Barre de navigation basse',
    category: 'Navigation',
    keywords: ['bottomnavigationbar', 'bottom navigation', 'navigationbar', 'tabview', 'tab bar basse', 'scaffold'],
    size: { w: 393, h: 80 },
    props: {
      items: [
        { label: 'Accueil', icon: 'home' },
        { label: 'Recherche', icon: 'search' },
        { label: 'Profil', icon: 'person' },
      ],
      selectedIndex: 0,
    },
    fields: [{ key: 'items', label: 'Entrées', type: 'navItems', iconOptional: false }, num('selectedIndex', 'Entrée active', 0, undefined, true)],
    presets: [],
  }),
  tabs: def({
    kind: 'tabs',
    label: 'Onglets',
    category: 'Navigation',
    keywords: ['tabs', 'tabbar', 'tab bar', 'onglets'],
    size: { w: 393, h: 48 },
    props: { items: [{ label: 'Onglet 1' }, { label: 'Onglet 2' }, { label: 'Onglet 3' }], selectedIndex: 0 },
    fields: [{ key: 'items', label: 'Onglets', type: 'navItems', iconOptional: true }, num('selectedIndex', 'Onglet actif', 0, undefined, true)],
    presets: [],
  }),

  // --- Overlays ---
  dialog: def({
    kind: 'dialog',
    label: 'Boîte de dialogue',
    category: 'Overlays',
    keywords: ['dialog', 'alert', 'alertdialog', 'modal', 'popup'],
    size: { w: 280, h: 190 },
    props: { title: 'Titre', message: 'Message de la boîte de dialogue.', confirmLabel: 'OK', cancelLabel: 'Annuler' },
    fields: [
      text('title', 'Titre'),
      text('message', 'Message', true),
      text('confirmLabel', 'Bouton de validation'),
      text('cancelLabel', 'Bouton d’annulation (vide : aucun)'),
    ],
    presets: [],
  }),
  snackbar: def({
    kind: 'snackbar',
    label: 'Snackbar',
    category: 'Overlays',
    keywords: ['snackbar', 'toast', 'message temporaire'],
    size: { w: 360, h: 48 },
    props: { message: 'Enregistré', actionLabel: 'Annuler' },
    fields: [text('message', 'Message'), text('actionLabel', 'Action (vide : aucune)')],
    presets: [],
  }),
}

// --- Conteneurs semantiques (frames portant `container`) ---

export type ContainerDefinition<K extends ContainerKind = ContainerKind> = {
  kind: K
  label: string
  category: PaletteCategory
  keywords: string[]
  size: { w: number; h: number }
  spec: Extract<ContainerSpec, { kind: K }>
  layout: Partial<Layout>
  fill: Color | null
  cornerRadius: number
  clipsContent: boolean
  fields: FieldDef[]
  presets: Preset<Extract<ContainerSpec, { kind: K }>>[]
}

const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 }
const axisField = select('axis', 'Axe', [
  ['vertical', 'Vertical'],
  ['horizontal', 'Horizontal'],
])

function cdef<K extends ContainerKind>(d: ContainerDefinition<K>): ContainerDefinition<K> {
  return d
}

export const CONTAINER_DEFINITIONS: { [K in ContainerKind]: ContainerDefinition<K> } = {
  card: cdef({
    kind: 'card',
    label: 'Carte',
    category: 'Affichage',
    keywords: ['card', 'carte', 'surface'],
    size: { w: 328, h: 160 },
    spec: { kind: 'card', elevation: 2 },
    layout: { mode: 'column', gap: 8, padding: { top: 16, right: 16, bottom: 16, left: 16 } },
    fill: WHITE,
    cornerRadius: 12,
    clipsContent: false,
    fields: [num('elevation', 'Élévation', 0)],
    presets: [],
  }),
  listView: cdef({
    kind: 'listView',
    label: 'Liste',
    category: 'Listes',
    keywords: ['listview', 'list', 'lazycolumn', 'flatlist', 'liste défilante'],
    size: { w: 360, h: 300 },
    spec: { kind: 'listView', axis: 'vertical', dividers: false },
    layout: { mode: 'column', gap: 0, alignCross: 'stretch' },
    fill: null,
    cornerRadius: 0,
    clipsContent: true,
    fields: [axisField, bool('dividers', 'Séparateurs')],
    presets: [{ id: 'listView-horizontal', label: 'Liste horizontale', props: { axis: 'horizontal' }, size: { w: 360, h: 120 } }],
  }),
  grid: cdef({
    kind: 'grid',
    label: 'Grille',
    category: 'Listes',
    keywords: ['grid', 'gridview', 'lazyverticalgrid', 'lazyvgrid', 'grille'],
    size: { w: 360, h: 300 },
    spec: { kind: 'grid', columns: 2 },
    layout: { mode: 'absolute', gap: 8, padding: { top: 8, right: 8, bottom: 8, left: 8 } },
    fill: null,
    cornerRadius: 0,
    clipsContent: true,
    fields: [num('columns', 'Colonnes', 1, 12, true)],
    presets: [],
  }),
  scrollView: cdef({
    kind: 'scrollView',
    label: 'Zone défilante',
    category: 'Listes',
    keywords: ['scrollview', 'singlechildscrollview', 'scroll', 'défilement', 'verticalscroll'],
    size: { w: 360, h: 400 },
    spec: { kind: 'scrollView', axis: 'vertical' },
    layout: { mode: 'column', gap: 12 },
    fill: null,
    cornerRadius: 0,
    clipsContent: true,
    fields: [axisField],
    presets: [],
  }),
  safeArea: cdef({
    kind: 'safeArea',
    label: 'Zone sûre',
    category: 'Mise en page',
    keywords: ['safearea', 'safe area', 'notch', 'encoche'],
    size: { w: 393, h: 852 },
    spec: { kind: 'safeArea' },
    layout: { mode: 'absolute' },
    fill: null,
    cornerRadius: 0,
    clipsContent: false,
    fields: [],
    presets: [],
  }),
  bottomSheet: cdef({
    kind: 'bottomSheet',
    label: 'Feuille basse',
    category: 'Overlays',
    keywords: ['bottomsheet', 'bottom sheet', 'modalbottomsheet', 'sheet'],
    size: { w: 393, h: 280 },
    spec: { kind: 'bottomSheet', handle: true },
    layout: { mode: 'column', gap: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 } },
    fill: WHITE,
    cornerRadius: 24,
    clipsContent: true,
    fields: [bool('handle', 'Poignée')],
    presets: [],
  }),
  drawer: cdef({
    kind: 'drawer',
    label: 'Tiroir de navigation',
    category: 'Navigation',
    keywords: ['drawer', 'navigationdrawer', 'tiroir', 'menu latéral', 'sidebar'],
    size: { w: 304, h: 852 },
    spec: { kind: 'drawer' },
    layout: { mode: 'column', gap: 0, padding: { top: 16, right: 0, bottom: 16, left: 0 }, alignCross: 'stretch' },
    fill: WHITE,
    cornerRadius: 0,
    clipsContent: true,
    fields: [],
    presets: [],
  }),
}

// --- Fabriques de noeuds ---

const BASE_LAYOUT: Layout = {
  mode: 'absolute',
  gap: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  alignMain: 'start',
  alignCross: 'start',
}

function nodeBase(name: string, frame: Rect) {
  return {
    id: crypto.randomUUID(),
    name,
    frame,
    visible: true,
    locked: false,
    opacity: 1,
    rotation: 0,
  }
}

function cloneProps<T>(props: T): T {
  return structuredClone(props)
}

// Fabrique un composant feuille a partir de sa definition, de surcharges de
// proprietes eventuelles et d'un cadre. Les props sont CLONEES : deux
// noeuds ne partagent jamais le meme tableau `items`/`options`.
export function createComponentNode<K extends ComponentKind>(
  kind: K,
  frame: Rect,
  overrides: Partial<ComponentPropsMap[K]> = {},
  name?: string,
): Node {
  const definition = COMPONENT_DEFINITIONS[kind]
  return {
    ...nodeBase(name ?? definition.label, frame),
    type: 'component',
    kind,
    props: { ...cloneProps(definition.props), ...cloneProps(overrides) },
  } as Node
}

export function createContainerNode<K extends ContainerKind>(
  kind: K,
  frame: Rect,
  overrides: Partial<Extract<ContainerSpec, { kind: K }>> = {},
  name?: string,
): FrameNode {
  const definition = CONTAINER_DEFINITIONS[kind] as ContainerDefinition
  return {
    ...nodeBase(name ?? definition.label, frame),
    type: 'frame',
    layout: { ...BASE_LAYOUT, ...cloneProps(definition.layout) },
    fills: definition.fill === null ? [{ type: 'none' }] : [{ type: 'solid', color: { ...definition.fill } }],
    strokes: [],
    cornerRadius: definition.cornerRadius,
    clipsContent: definition.clipsContent,
    children: [],
    container: { ...cloneProps(definition.spec), ...cloneProps(overrides) } as ContainerSpec,
  }
}

// Row / Column / Stack : de simples frames en mise en page automatique, pas
// de nouveau type -- exportees vers Row, Column et Stack natifs.
export const LAYOUT_PRESETS = {
  row: { label: 'Rangée (Row)', mode: 'row', keywords: ['row', 'hstack', 'horizontal', 'rangée', 'ligne'] },
  column: { label: 'Colonne (Column)', mode: 'column', keywords: ['column', 'vstack', 'vertical', 'colonne'] },
  stack: { label: 'Pile (Stack)', mode: 'absolute', keywords: ['stack', 'zstack', 'box', 'pile', 'superposition'] },
} as const

export type LayoutPresetId = keyof typeof LAYOUT_PRESETS

export function createLayoutNode(id: LayoutPresetId, frame: Rect): FrameNode {
  const preset = LAYOUT_PRESETS[id]
  return {
    ...nodeBase(preset.label.replace(/ \(.*\)$/, ''), frame),
    type: 'frame',
    layout: {
      ...BASE_LAYOUT,
      mode: preset.mode,
      gap: preset.mode === 'absolute' ? 0 : 8,
      alignCross: preset.mode === 'absolute' ? 'start' : 'center',
    },
    // Voile tres leger : une Row/Column vide doit rester visible au canevas.
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 0.04 } }],
    strokes: [],
    cornerRadius: 0,
    clipsContent: false,
    children: [],
  }
}

// --- Palette ---

export type PaletteItem = {
  id: string
  label: string
  category: PaletteCategory
  keywords: string[]
  size: { w: number; h: number }
  // Fabrique le noeud (id neuf a chaque appel) dans le cadre donne.
  build(frame: Rect): Node
}

function componentItems(): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const definition of Object.values(COMPONENT_DEFINITIONS) as ComponentDefinition[]) {
    items.push({
      id: definition.kind,
      label: definition.label,
      category: definition.category,
      keywords: definition.keywords,
      size: definition.size,
      build: (frame) => createComponentNode(definition.kind, frame),
    })
    for (const preset of definition.presets as Preset<ComponentPropsMap[ComponentKind]>[]) {
      items.push({
        id: preset.id,
        label: preset.label,
        category: definition.category,
        keywords: [...definition.keywords, ...(preset.keywords ?? [])],
        size: preset.size ?? definition.size,
        build: (frame) => createComponentNode(definition.kind, frame, preset.props as never, preset.label),
      })
    }
  }
  return items
}

function containerItems(): PaletteItem[] {
  const items: PaletteItem[] = []
  for (const definition of Object.values(CONTAINER_DEFINITIONS) as ContainerDefinition[]) {
    items.push({
      id: definition.kind,
      label: definition.label,
      category: definition.category,
      keywords: definition.keywords,
      size: definition.size,
      build: (frame) => createContainerNode(definition.kind, frame),
    })
    for (const preset of definition.presets as Preset<ContainerSpec>[]) {
      items.push({
        id: preset.id,
        label: preset.label,
        category: definition.category,
        keywords: definition.keywords,
        size: preset.size ?? definition.size,
        build: (frame) => {
          const node = createContainerNode(definition.kind, frame, preset.props as never, preset.label)
          return node
        },
      })
    }
  }
  return items
}

function layoutItems(): PaletteItem[] {
  const sizes: Record<LayoutPresetId, { w: number; h: number }> = {
    row: { w: 328, h: 80 },
    column: { w: 328, h: 200 },
    stack: { w: 328, h: 200 },
  }
  return (Object.keys(LAYOUT_PRESETS) as LayoutPresetId[]).map((id) => ({
    id,
    label: LAYOUT_PRESETS[id].label,
    category: 'Mise en page' as const,
    keywords: [...LAYOUT_PRESETS[id].keywords],
    size: sizes[id],
    build: (frame: Rect) => createLayoutNode(id, frame),
  }))
}

function ordered(items: PaletteItem[]): PaletteItem[] {
  return [...items].sort(
    (a, b) => PALETTE_CATEGORIES.indexOf(a.category) - PALETTE_CATEGORIES.indexOf(b.category),
  )
}

// Trie par famille (ordre de PALETTE_CATEGORIES) en conservant l'ordre de
// declaration a l'interieur d'une famille.
export const PALETTE_ITEMS: PaletteItem[] = ordered([...componentItems(), ...containerItems(), ...layoutItems()])

function fold(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Recherche insensible a la casse et aux accents, sur le libelle, la
// famille et les mots-cles (noms natifs : TextField, Pressable, Toggle...).
export function searchPalette(query: string, items: PaletteItem[] = PALETTE_ITEMS): PaletteItem[] {
  const needle = fold(query)
  if (needle === '') return items
  return items.filter((item) =>
    [item.label, item.category, ...item.keywords].some((haystack) => fold(haystack).includes(needle)),
  )
}

export const ALL_ICON_NAMES: readonly IconName[] = ICON_NAMES
