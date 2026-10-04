// Sous-ensemble typé de la réponse REST Figma (GET /v1/files/:key), limité
// strictement aux champs que le traducteur (translate.ts) lit réellement.
// N'ajouter un champ ici qu'accompagné d'une fixture qui l'exerce.

export type FigmaColor = { r: number; g: number; b: number; a: number }

// Une "peinture" Figma (fill ou stroke). `type` couvre en realite bien plus
// que SOLID (GRADIENT_LINEAR, IMAGE, ...) : seul SOLID est traduit, le reste
// produit un avertissement (voir translate.ts).
export type FigmaPaint = {
  type: string
  visible?: boolean
  color?: FigmaColor
}

export type FigmaTextAlign = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'

export type FigmaTextStyle = {
  fontFamily: string
  fontSize: number
  fontWeight: number
  lineHeightPx?: number
  letterSpacing?: number
  textAlignHorizontal?: FigmaTextAlign
}

export type FigmaRect = { x: number; y: number; width: number; height: number }

export type FigmaLayoutMode = 'HORIZONTAL' | 'VERTICAL' | 'NONE'
export type FigmaAlignMain = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
export type FigmaAlignCross = 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'

// `type` reste `string` (pas une union litterale) : la liste des types de
// noeud Figma est plus longue que celle geree explicitement par
// translate.ts (STAR, POLYGON, SLICE, ...), et un type inconnu doit rester
// representable (pour devenir un espace reserve) plutot que rejete par le
// systeme de types.
export type FigmaNode = {
  id: string
  name: string
  type: string
  visible?: boolean
  opacity?: number
  // Degres, comme dans le modele Maquio (voir NodeBase.rotation).
  rotation?: number
  absoluteBoundingBox?: FigmaRect
  fills?: FigmaPaint[]
  strokes?: FigmaPaint[]
  strokeWeight?: number
  cornerRadius?: number
  characters?: string
  style?: FigmaTextStyle
  children?: FigmaNode[]
  layoutMode?: FigmaLayoutMode
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlignItems?: FigmaAlignMain
  counterAxisAlignItems?: FigmaAlignCross
  clipsContent?: boolean
  // Liaisons de styles publies de ce noeud, par categorie ('fill', 'text',
  // 'stroke', ...) vers l'id d'un style de `FigmaFileResponse.styles`.
  styles?: Record<string, string>
}

export type FigmaStyleType = 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'

export type FigmaStyle = {
  name: string
  styleType: FigmaStyleType
}

export type FigmaFileResponse = {
  document: FigmaNode
  styles?: Record<string, FigmaStyle>
}
