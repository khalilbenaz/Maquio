// Proprietes des composants mobiles semantiques (type `component`).
//
// Un composant est un noeud FEUILLE dont le `kind` designe un widget natif
// (bouton, champ de saisie, barre d'application...) et dont `props` porte
// ses proprietes metier. Les conteneurs (carte, liste, grille, defilement,
// zone sure, tiroir, feuille basse) restent des `frame` portant un champ
// `container` (voir ContainerSpec) : l'arbre, la mise en page et le
// reparentage n'ont donc qu'un seul type de conteneur a connaitre.
//
// Les types TypeScript sont DERIVES des schemas Zod (z.infer) : un schema
// et son type ne peuvent pas diverger, et `schema.test.ts` enumere les
// valeurs de chaque union de litteraux.
import { z } from 'zod'
import { ICON_NAMES } from './icons'

const colorValue = z
  .object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1),
  })
  .strict()

export const iconNameSchema = z.enum(ICON_NAMES)

// Entree d'une barre de navigation (BottomNavigationBar, TabBar) : `target`
// est l'identifiant d'un ECRAN de la meme page -- meme regle de validite
// que `NodeBase.link` (voir checkLinks dans schema.ts).
const navItemSchema = z
  .object({
    label: z.string(),
    icon: iconNameSchema,
    target: z.string().optional(),
  })
  .strict()

const tabItemSchema = z
  .object({
    label: z.string(),
    icon: iconNameSchema.optional(),
    target: z.string().optional(),
  })
  .strict()

const unit = z.number().min(0).max(1)

export const COMPONENT_PROPS_SCHEMAS = {
  button: z
    .object({
      label: z.string(),
      variant: z.enum(['primary', 'secondary', 'text']),
      disabled: z.boolean(),
      icon: iconNameSchema.optional(),
      color: colorValue.optional(),
      // Typographie du libelle (defaut : 14 / 500) et bouton plat (sans ombre).
      fontSize: z.number().min(8).max(48).optional(),
      fontWeight: z.number().int().min(100).max(900).optional(),
      flat: z.boolean().optional(),
    })
    .strict(),
  iconButton: z
    .object({
      icon: iconNameSchema,
      variant: z.enum(['standard', 'filled', 'outlined']),
      disabled: z.boolean(),
      color: colorValue.optional(),
    })
    .strict(),
  fab: z
    .object({
      icon: iconNameSchema,
      // Non vide : FAB etendu (icone + libelle).
      label: z.string(),
      size: z.enum(['small', 'regular', 'large']),
      color: colorValue.optional(),
    })
    .strict(),
  textField: z
    .object({
      label: z.string(),
      placeholder: z.string(),
      value: z.string(),
      password: z.boolean(),
      multiline: z.boolean(),
      helperText: z.string(),
      // Non vide : le champ est a l'etat d'erreur et affiche ce message.
      errorText: z.string(),
      disabled: z.boolean(),
      leadingIcon: iconNameSchema.optional(),
    })
    .strict(),
  checkbox: z.object({ label: z.string(), checked: z.boolean(), disabled: z.boolean() }).strict(),
  switch: z.object({ label: z.string(), checked: z.boolean(), disabled: z.boolean(), color: colorValue.optional() }).strict(),
  radio: z.object({ label: z.string(), selected: z.boolean(), disabled: z.boolean() }).strict(),
  slider: z
    .object({
      value: z.number(),
      min: z.number(),
      max: z.number(),
      disabled: z.boolean(),
    })
    .strict()
    .refine((p) => p.min < p.max, { message: 'min doit être strictement inférieur à max', path: ['max'] })
    .refine((p) => p.value >= p.min && p.value <= p.max, {
      message: 'value doit rester entre min et max',
      path: ['value'],
    }),
  dropdown: z
    .object({
      label: z.string(),
      options: z.array(z.string()).min(1),
      // -1 : aucune option choisie (le libelle sert d'indication).
      selectedIndex: z.number().int().min(-1),
      disabled: z.boolean(),
    })
    .strict()
    .refine((p) => p.selectedIndex < p.options.length, {
      message: 'selectedIndex dépasse la liste des options',
      path: ['selectedIndex'],
    }),
  datePicker: z
    .object({
      label: z.string(),
      // '' (aucune date) ou `yyyy-MM-dd`.
      value: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'format attendu : yyyy-MM-dd'),
      disabled: z.boolean(),
    })
    .strict(),
  icon: z.object({ name: iconNameSchema, size: z.number().min(1), color: colorValue.optional() }).strict(),
  avatar: z
    .object({
      initials: z.string(),
      // Source d'image (meme regles que `ImageNode.src`) ; vide : initiales.
      src: z.string(),
      color: colorValue.optional(),
    })
    .strict(),
  // `text` vide : pastille sans texte.
  badge: z.object({ text: z.string(), color: colorValue.optional() }).strict(),
  chip: z
    .object({
      label: z.string(),
      variant: z.enum(['assist', 'filter']),
      selected: z.boolean(),
      icon: iconNameSchema.optional(),
    })
    .strict(),
  divider: z
    .object({
      vertical: z.boolean(),
      thickness: z.number().min(0),
      indent: z.number().min(0),
      color: colorValue.optional(),
    })
    .strict(),
  progressBar: z
    .object({ value: unit, indeterminate: z.boolean(), color: colorValue.optional(), trackColor: colorValue.optional() })
    .strict(),
  spinner: z.object({ color: colorValue.optional() }).strict(),
  listTile: z
    .object({
      title: z.string(),
      subtitle: z.string(),
      leadingIcon: iconNameSchema.optional(),
      trailingIcon: iconNameSchema.optional(),
    })
    .strict(),
  spacer: z.object({ flex: z.number().int().min(1) }).strict(),
  appBar: z
    .object({
      title: z.string(),
      leading: z.enum(['none', 'back', 'menu']),
      actions: z.array(iconNameSchema),
      centerTitle: z.boolean(),
      color: colorValue.optional(),
    })
    .strict(),
  bottomNav: z
    .object({
      items: z.array(navItemSchema).min(2).max(5),
      selectedIndex: z.number().int().min(0),
      // Couleur d'accent de l'entree choisie. Definie : barre plate, sans pastille d'indicateur.
      color: colorValue.optional(),
    })
    .strict()
    .refine((p) => p.selectedIndex < p.items.length, {
      message: 'selectedIndex dépasse la liste des entrées',
      path: ['selectedIndex'],
    }),
  tabs: z
    .object({
      items: z.array(tabItemSchema).min(1),
      selectedIndex: z.number().int().min(0),
    })
    .strict()
    .refine((p) => p.selectedIndex < p.items.length, {
      message: 'selectedIndex dépasse la liste des onglets',
      path: ['selectedIndex'],
    }),
  dialog: z
    .object({
      title: z.string(),
      message: z.string(),
      confirmLabel: z.string(),
      // Vide : pas de bouton d'annulation.
      cancelLabel: z.string(),
    })
    .strict(),
  // `actionLabel` vide : pas d'action.
  snackbar: z.object({ message: z.string(), actionLabel: z.string() }).strict(),
} as const

export type ComponentKind = keyof typeof COMPONENT_PROPS_SCHEMAS

export const COMPONENT_KINDS = Object.keys(COMPONENT_PROPS_SCHEMAS) as [ComponentKind, ...ComponentKind[]]

export type ComponentPropsMap = { [K in ComponentKind]: z.infer<(typeof COMPONENT_PROPS_SCHEMAS)[K]> }

export type NavItem = z.infer<typeof navItemSchema>
export type TabItem = z.infer<typeof tabItemSchema>

// Conteneurs : une `frame` qui porte `container` est un widget de mise en
// page natif (Card, ListView, GridView, ScrollView, SafeArea, Drawer,
// feuille basse). La mise en page de ses enfants reste celle de
// `layout` (sauf `grid`, voir autolayout.ts).
export const containerSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('card'), elevation: z.number().min(0) }).strict(),
  z.object({ kind: z.literal('listView'), axis: z.enum(['vertical', 'horizontal']), dividers: z.boolean() }).strict(),
  z.object({ kind: z.literal('grid'), columns: z.number().int().min(1).max(12) }).strict(),
  z.object({ kind: z.literal('scrollView'), axis: z.enum(['vertical', 'horizontal']) }).strict(),
  z.object({ kind: z.literal('safeArea') }).strict(),
  z.object({ kind: z.literal('bottomSheet'), handle: z.boolean() }).strict(),
  z.object({ kind: z.literal('drawer') }).strict(),
])

export type ContainerSpec = z.infer<typeof containerSpecSchema>
export type ContainerKind = ContainerSpec['kind']
export const CONTAINER_KINDS = [
  'card',
  'listView',
  'grid',
  'scrollView',
  'safeArea',
  'bottomSheet',
  'drawer',
] as const satisfies readonly ContainerKind[]

// Cles declarees par le schema d'un kind (raffinements `.refine` compris) :
// permet de verifier qu'un champ d'inspecteur designe une vraie propriete,
// y compris une propriete optionnelle absente des valeurs par defaut.
export function componentPropKeys(kind: ComponentKind): string[] {
  let schema: z.ZodTypeAny = COMPONENT_PROPS_SCHEMAS[kind]
  while (schema instanceof z.ZodEffects) schema = schema.innerType()
  return Object.keys((schema as z.ZodObject<z.ZodRawShape>).shape)
}
