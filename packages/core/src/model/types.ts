// Types du modele de document Calque (Tache 2).
// Ce sont les formes canoniques : les schemas Zod de schema.ts en sont le miroir exact.

export type Rect = { x: number; y: number; w: number; h: number }

// Composantes 0..1 (pas 0..255) pour rester independant du rendu.
export type Color = { r: number; g: number; b: number; a: number }

export type Fill = { type: 'solid'; color: Color } | { type: 'none' }

export type Stroke = { color: Color; width: number }

export type LayoutMode = 'absolute' | 'row' | 'column'

export type Layout = {
  mode: LayoutMode
  gap: number
  padding: { top: number; right: number; bottom: number; left: number }
  alignMain: 'start' | 'center' | 'end' | 'space-between'
  alignCross: 'start' | 'center' | 'end' | 'stretch'
}

export type NodeBase = {
  id: string
  name: string
  frame: Rect
  visible: boolean
  locked: boolean
  opacity: number
  // Degres (pas radians), sens horaire, comme dans l'inspecteur des outils
  // de ce type (Figma, etc.) : c'est cet inspecteur (Tache 16) qui lit et
  // ecrit ce champ directement, donc l'unite naturelle pour la saisie/
  // l'affichage prime sur le confort d'un seul generateur de code. Les
  // exportateurs (ex. @calque/codegen/flutter) convertissent en radians
  // quand leur cible l'exige.
  rotation: number
}

export type FrameNode = NodeBase & {
  type: 'frame'
  layout: Layout
  fills: Fill[]
  strokes: Stroke[]
  cornerRadius: number
  clipsContent: boolean
  children: Node[]
}

export type TextStyle = {
  fontFamily: string
  fontSize: number
  fontWeight: number
  // Pixels (pas un multiplicateur de fontSize), comme dans l'inspecteur
  // Figma qui le remplit (packages/figma/src/translate.ts, depuis
  // `style.lineHeightPx`) -- meme raisonnement que `rotation` ci-dessus :
  // l'unite naturelle de l'outil source prime sur le confort d'un seul
  // generateur de code. Le `height` de Flutter (TextStyle.height) est en
  // revanche un MULTIPLICATEUR de fontSize ; l'exportateur Flutter
  // (packages/codegen/src/flutter/flutter.ts, packages/codegen/src/
  // flutter/theme.ts) convertit donc via `lineHeight / fontSize` avant
  // emission. Ne pas y ecrire un multiplicateur directement (ex. `1.2`
  // en croyant deja convertir) : la conversion produirait alors une
  // valeur ecrasee (`height: 0.075` pour un fontSize de 16), verifie en
  // reproduisant l'erreur.
  lineHeight: number
  letterSpacing: number
  color: Color
  align: 'left' | 'center' | 'right'
}

export type TextNode = NodeBase & { type: 'text'; characters: string; style: TextStyle }

export type RectNode = NodeBase & { type: 'rect'; fills: Fill[]; strokes: Stroke[]; cornerRadius: number }

export type EllipseNode = NodeBase & { type: 'ellipse'; fills: Fill[]; strokes: Stroke[] }

export type ImageNode = NodeBase & { type: 'image'; src: string; fit: 'cover' | 'contain' | 'fill' }

export type LineNode = NodeBase & { type: 'line'; stroke: Stroke }

export type Node = FrameNode | TextNode | RectNode | EllipseNode | ImageNode | LineNode

export type DevicePreset = { id: string; label: string; width: number; height: number; pixelRatio: number }

export type Page = { id: string; name: string; device: DevicePreset; nodes: Node[] }

export type DesignTokens = {
  colors: Record<string, Color>
  typography: Record<string, TextStyle>
  spacing: Record<string, number>
}

export type CalqueDocument = {
  version: number
  id: string
  name: string
  pages: Page[]
  tokens: DesignTokens
}
