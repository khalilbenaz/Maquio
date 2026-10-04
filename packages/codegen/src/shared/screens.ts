// Plan d'export commun aux quatre cibles : QUELS ecrans sont exportes, sous
// quels noms, avec quelles routes, et comment un ecran se decompose en
// « Scaffold » (barre d'application, barre de navigation basse, bouton
// flottant, tiroir) et corps. Calcule une seule fois par document pour que
// les quatre generateurs nomment et relient les ecrans de la meme facon.
import { tapNavigation } from '@maquio/core'
import type { MaquioDocument, ComponentNode, FrameNode, Node, Page } from '@maquio/core'
import { createPageNamer } from './naming'
import { collectOverlays, resolveInteractions } from './interactions'
import type { OverlayRef } from './interactions'

export type ScreenRef = {
  id: string
  name: string
  pascal: string
  snake: string
  // Route de navigation : `/` + snake_case (« /accueil »).
  route: string
}

export type ExportUnit =
  // Un ecran (frame de premier niveau + `device`) : exporte avec navigation.
  | { kind: 'screen'; page: Page; screen: FrameNode; ref: ScreenRef }
  // Une page sans aucun ecran (document v1 non migre, page de mise en page
  // libre) : rendue telle quelle, sans navigation -- comportement historique.
  | { kind: 'page'; page: Page; names: { pascal: string; snake: string } }

export type ExportPlan = {
  units: ExportUnit[]
  screens: ScreenRef[]
  byId: Map<string, ScreenRef>
  // Ecran de depart : l'ecran actif demande, a defaut le premier.
  initial: ScreenRef | null
  // Compose : paquet de l'application (pour `R.drawable`).
  androidPackage?: string
  // Overlays (dialogue, feuille basse, snackbar) ouvertes par une interaction :
  // rendues a la demande, jamais en place dans l'ecran.
  overlays: Map<string, OverlayRef>
}

export function isScreen(node: Node): node is FrameNode {
  return node.type === 'frame' && node.device !== undefined
}

// Tous les ecrans de toutes les pages sont exportes ; un meme attributeur
// de noms garantit l'absence de collision entre eux.
export function planExport(doc: MaquioDocument, activeScreenId: string | undefined): ExportPlan {
  const nameFor = createPageNamer()
  const units: ExportUnit[] = []
  const screens: ScreenRef[] = []
  const byId = new Map<string, ScreenRef>()

  for (const page of doc.pages) {
    const pageScreens = page.nodes.filter(isScreen)
    if (pageScreens.length === 0) {
      units.push({ kind: 'page', page, names: nameFor(page.name) })
      continue
    }
    for (const screen of pageScreens) {
      const names = nameFor(screen.name)
      const ref: ScreenRef = { id: screen.id, name: screen.name, ...names, route: `/${names.snake}` }
      screens.push(ref)
      byId.set(screen.id, ref)
      // L'ecran reste la RACINE du rendu (il porte la taille de l'appareil,
      // le fond et la mise en page) ; sa position sur le plan de travail
      // n'a aucun sens a l'export.
      units.push({ kind: 'screen', page, screen: { ...screen, frame: { ...screen.frame, x: 0, y: 0 } }, ref })
    }
  }

  const initial = (activeScreenId !== undefined ? byId.get(activeScreenId) : undefined) ?? screens[0] ?? null
  const overlays = collectOverlays(doc.pages.map((p) => p.nodes))
  return { units, screens, byId, initial, overlays }
}

// --- Decomposition d'un ecran en Scaffold + corps ---

type OfKind<K extends ComponentNode['kind']> = Extract<ComponentNode, { kind: K }>

export type ScreenParts = {
  appBar: OfKind<'appBar'> | null
  bottomNav: OfKind<'bottomNav'> | null
  fab: OfKind<'fab'> | null
  drawer: FrameNode | null
  // Tout le reste, dans l'ordre du document.
  body: Node[]
  // Hauteur occupee en haut (barre d'application) : les enfants du corps sont
  // positionnes relativement au bas de cette barre.
  topInset: number
  bottomInset: number
}

function isComponent<K extends ComponentNode['kind']>(node: Node, kind: K): node is Extract<ComponentNode, { kind: K }> {
  return node.type === 'component' && node.kind === kind
}

// Le PREMIER composant de chaque role, enfant direct de l'ecran, devient un
// emplacement du Scaffold (le suivant, s'il existe, reste dans le corps). Les
// noeuds invisibles sont ignores.
export function splitScreen(screen: FrameNode): ScreenParts {
  const visible = screen.children.filter((c) => c.visible)
  const appBar = visible.find((n): n is OfKind<'appBar'> => isComponent(n, 'appBar')) ?? null
  const bottomNav = visible.find((n): n is OfKind<'bottomNav'> => isComponent(n, 'bottomNav')) ?? null
  const fab = visible.find((n): n is OfKind<'fab'> => isComponent(n, 'fab')) ?? null
  const drawer = visible.find((n): n is FrameNode => n.type === 'frame' && n.container?.kind === 'drawer') ?? null
  const taken = new Set<string>()
  for (const n of [appBar, bottomNav, fab, drawer]) if (n !== null) taken.add(n.id)
  return {
    appBar,
    bottomNav,
    fab,
    drawer,
    body: visible.filter((n) => !taken.has(n.id)),
    topInset: appBar === null ? 0 : appBar.frame.h,
    bottomInset: bottomNav === null ? 0 : bottomNav.frame.h,
  }
}

export function hasScaffoldParts(parts: ScreenParts): boolean {
  return parts.appBar !== null || parts.bottomNav !== null || parts.fab !== null || parts.drawer !== null
}

// Cible de navigation d'un noeud (clic), ou null.
export function linkTargetOf(node: Node, plan: ExportPlan): ScreenRef | null {
  const nav = tapNavigation(node.interactions)
  if (nav === null) return null
  return plan.byId.get(nav.target) ?? null
}

// Entrees d'une barre (bottomNav / tabs) : cible resolue ou null.
export function itemTargets(node: ComponentNode, plan: ExportPlan): (ScreenRef | null)[] {
  if (node.kind !== 'bottomNav' && node.kind !== 'tabs') return []
  return node.props.items.map((item) => (item.target === undefined ? null : (plan.byId.get(item.target) ?? null)))
}

// Y a-t-il au moins une interaction (navigation, retour, overlay...) ou une
// entree de barre qui navigue dans ce sous-arbre ? Sert a n'ajouter un
// parametre de navigation qu'aux ecrans qui s'en servent.
export function usesNavigation(nodes: Node[], plan: ExportPlan): boolean {
  for (const n of nodes) {
    if (resolveInteractions(n, plan).length > 0) return true
    if (n.type === 'component' && itemTargets(n, plan).some((t) => t !== null)) return true
    if (n.type === 'component' && n.kind === 'appBar' && n.props.leading === 'back') return true
    if (n.type === 'frame' && usesNavigation(n.children, plan)) return true
  }
  return false
}

// Contenu des ecrans a l'echelle du document.
export function allScreenNodes(plan: ExportPlan): FrameNode[] {
  return plan.units.flatMap((u) => (u.kind === 'screen' ? [u.screen] : []))
}
