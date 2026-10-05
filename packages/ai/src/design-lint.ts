// Controle geometrique du resultat d'un patch (boucle de correction, voir
// service.ts). Claude Code place les noeuds sans voir le rendu : il produit
// des textes rognes par un cadre trop petit, des textes ou composants freres
// superposes, des elements qui sortent de leur ecran. Ce controle les
// detecte apres application (auto-layout compris) et les decrit pour que
// Claude les corrige. Il est CONSULTATIF : un patch valide n'est jamais
// rejete pour ces seuls defauts (voir AiService.ask).
//
// Seuls les noeuds crees ou modifies par le patch sont controles : le
// contenu existant de l'utilisateur n'est pas a la charge de Claude.
import { componentPropKeys, layoutPage } from '@maquio/core'
import type { Color, ComponentKind, FrameNode, MaquioDocument, Node, Rect, TextNode } from '@maquio/core'
import type { DocumentPatch } from './patch'

const MAX_ISSUES = 15

// Composants qui se superposent par construction (surcouches, pastilles,
// separateurs) : jamais signales comme chevauchement.
const OVERLAY_KINDS = new Set(['dialog', 'snackbar', 'badge', 'icon', 'spacer', 'divider'])
const TAPPABLE_KINDS = new Set(['button', 'iconButton', 'fab', 'textField', 'dropdown', 'listTile'])
// 44 (iOS) ; 40 pour un bouton-icone, sa taille Material standard.
const MIN_TOUCH = 44
const MIN_TOUCH_ICON = 40

// Composants d'action qui, sans "color", gardent le violet par defaut de
// Material au lieu de l'accent du document. Pas les boutons-icones : une icone
// neutre (cloche, retour) est un choix de design legitime, et la relancer
// coute un appel complet a Claude.
const TINTED_KINDS = ['button', 'fab', 'checkbox', 'switch', 'radio', 'slider', 'progressBar', 'bottomNav', 'tabs']
  .filter((k) => componentPropKeys(k as ComponentKind).includes('color'))

function accentOf(document: MaquioDocument): Color | null {
  const entry = Object.entries(document.tokens.colors).find(([k]) => /^(accent|primary|brand)$/i.test(k))
  return entry ? entry[1] : null
}

function collectIds(node: Node, out: Set<string>): void {
  out.add(node.id)
  if (node.type === 'frame') for (const c of node.children) collectIds(c, out)
}

export function touchedNodeIds(patch: DocumentPatch): Set<string> {
  const ids = new Set<string>()
  for (const op of patch.ops) {
    if (op.op === 'insertNode') collectIds(op.node, ids)
    else if (op.op === 'updateNode' || op.op === 'moveNode') ids.add(op.nodeId)
  }
  return ids
}

// Largeur moyenne d'un glyphe d'une sans-serif courante, en fraction de la
// taille de police (Inter / SF : ~0,47 em en graisse normale, calibre sur
// des sorties reelles de Claude). On ne signale qu'au-dela d'une demi-ligne
// manquante, avec 15 % de tolerance sur la largeur : chaque signalement
// coute une relance de Claude (~2 min), un faux positif est cher.
function estimateWidth(word: string, node: TextNode): number {
  const factor = node.style.fontWeight >= 600 ? 0.51 : 0.47
  return word.length * (node.style.fontSize * factor + node.style.letterSpacing)
}

function estimateLines(node: TextNode): number {
  const width = Math.max(node.frame.w * 1.15, 1)
  const space = estimateWidth(' ', node)
  let lines = 0
  for (const paragraph of node.characters.split('\n')) {
    let current = 0
    lines += 1
    for (const word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
      const w = estimateWidth(word, node)
      if (current === 0) {
        current = w
        // Un mot plus large que le cadre occupe plusieurs lignes.
        lines += Math.max(0, Math.ceil(w / width) - 1)
      } else if (current + space + w <= width) {
        current += space + w
      } else {
        lines += 1
        current = w
      }
    }
  }
  return lines
}

// Chevauchement d'au moins 30 % du plus petit des deux : les
// superpositions voulues (lignes de titre serrees, montant et decimales
// accoles) restent sous ce seuil, des textes poses au meme endroit non.
function overlaps(a: Rect, b: Rect): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (ox <= 0 || oy <= 0) return false
  return ox * oy >= 0.3 * Math.min(a.w * a.h, b.w * b.h)
}

const OVERFLOW_TOLERANCE = 8

function isContent(node: Node): boolean {
  if (!node.visible) return false
  if (node.type === 'text') return node.characters.trim().length > 0
  return node.type === 'component' && !OVERLAY_KINDS.has(node.kind)
}

function lintFrame(frame: FrameNode, touched: Set<string>, out: string[], accent: Color | null): void {
  const scrolls = frame.container?.kind === 'scrollView' || frame.container?.kind === 'listView'
  const children = frame.children

  for (const child of children) {
    if (!touched.has(child.id)) continue

    if (child.type === 'text') {
      const needed = estimateLines(child) * child.style.lineHeight
      if (needed - child.frame.h >= child.style.lineHeight / 2) {
        out.push(`- texte "${child.id}" (« ${child.characters.slice(0, 40)} ») rogné : ${child.frame.w} x ${child.frame.h} est trop petit pour son contenu, il faut h >= ${Math.ceil(needed)} (ou élargir w, ou raccourcir le texte)`)
      }
    }

    if (child.type === 'component' && TAPPABLE_KINDS.has(child.kind)) {
      const min = child.kind === 'iconButton' ? MIN_TOUCH_ICON : MIN_TOUCH
      if (child.frame.h < min) {
        out.push(`- composant "${child.id}" (${child.kind}) : hauteur ${child.frame.h} < ${min}, cible tactile trop petite`)
      }
    }

    if (accent !== null && child.type === 'component' && TINTED_KINDS.includes(child.kind) && (child.props as { color?: unknown }).color === undefined) {
      out.push(`- composant "${child.id}" (${child.kind}) sans "color" : renseigne "color" avec l'accent de "tokens.colors" (${JSON.stringify(accent)}), sinon il reste violet par défaut`)
    }

    const f = child.frame
    if (!scrolls && (f.x < -OVERFLOW_TOLERANCE || f.y < -OVERFLOW_TOLERANCE || f.x + f.w > frame.frame.w + OVERFLOW_TOLERANCE || f.y + f.h > frame.frame.h + OVERFLOW_TOLERANCE)) {
      out.push(`- "${child.id}" (${f.x}, ${f.y}, ${f.w} x ${f.h}) dépasse de son parent "${frame.id}" (${frame.frame.w} x ${frame.frame.h})`)
    }
  }

  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i]!
      const b = children[j]!
      if (!touched.has(a.id) && !touched.has(b.id)) continue
      if (!isContent(a) || !isContent(b)) continue
      if (overlaps(a.frame, b.frame)) {
        out.push(`- "${a.id}" et "${b.id}" se chevauchent dans "${frame.id}" : déplace-les ou range-les dans une frame "column"/"row" avec un "gap"`)
      }
    }
  }

  for (const child of children) if (child.type === 'frame') lintFrame(child, touched, out, accent)
}

export function lintDesign(document: MaquioDocument, pageId: string, touched: Set<string>): string[] {
  const page = document.pages.find((p) => p.id === pageId)
  if (page === undefined || touched.size === 0) return []
  const laidOut = layoutPage(page)
  const out: string[] = []
  const accent = accentOf(document)
  for (const node of laidOut.nodes) if (node.type === 'frame') lintFrame(node, touched, out, accent)
  if (out.length <= MAX_ISSUES) return out
  return [...out.slice(0, MAX_ISSUES), `- ... et ${out.length - MAX_ISSUES} autre(s) défaut(s) de mise en page`]
}
