// Export SVG : un fichier autonome par ecran (images embarquees en data URI
// quand l'application fournit leur contenu). Le rendu suit le modele apres
// mise en page automatique ; les composants mobiles sont dessines par leur
// croquis (voir @calque/core, sketch.ts), identique a celui du plugin Figma.
import { componentSketch, containerSketch, hexOf, layoutPage } from '@calque/core'
import type { Color, CalqueDocument, FrameNode, Node, SketchPrim, TextNode } from '@calque/core'
import { dataUri } from '../shared/image-data'
import { planExport } from '../shared/screens'
import type { Exporter, ExportOptions, ExportResult } from '../types'

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const num = (n: number): string => String(Math.round(n * 100) / 100)

function paint(c: Color | string): { fill: string; opacity?: number } {
  const hex = typeof c === 'string' ? c : hexOf(c)
  if (hex.length === 9) return { fill: hex.slice(0, 7), opacity: Math.round((parseInt(hex.slice(7), 16) / 255) * 1000) / 1000 }
  return { fill: hex }
}

function fillAttrs(fill: string | undefined): string {
  if (fill === undefined) return ' fill="none"'
  const p = paint(fill)
  return ` fill="${p.fill}"${p.opacity !== undefined ? ` fill-opacity="${p.opacity}"` : ''}`
}

function strokeAttrs(stroke: { color: string; width: number } | undefined): string {
  if (stroke === undefined || stroke.width <= 0) return ''
  const p = paint(stroke.color)
  return ` stroke="${p.fill}"${p.opacity !== undefined ? ` stroke-opacity="${p.opacity}"` : ''} stroke-width="${num(stroke.width)}"`
}

type Ctx = { loadImage: ExportOptions['loadImage']; warnings: string[]; defs: string[]; n: number }

function textEl(p: { x: number; y: number; w: number; h: number; text: string; size: number; weight: number; color: string; align: 'left' | 'center' | 'right'; family?: string; lineHeight?: number; letterSpacing?: number }): string {
  const lines = p.text.split('\n')
  const lh = p.lineHeight ?? Math.round(p.size * 1.25)
  const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start'
  const x = p.align === 'center' ? p.x + p.w / 2 : p.align === 'right' ? p.x + p.w : p.x
  // Un seul bloc : centre verticalement dans la boite quand elle est plus haute que le texte.
  const top = p.y + (lines.length === 1 ? Math.max(0, (p.h - lh) / 2) : 0)
  const col = paint(p.color)
  return lines
    .map((line, i) => {
      const y = top + i * lh + lh / 2 + p.size * 0.35
      return `<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" font-family="${esc(`${p.family ?? 'Roboto'}, Helvetica, Arial, sans-serif`)}" font-size="${num(p.size)}" font-weight="${p.weight}" fill="${col.fill}"${col.opacity !== undefined ? ` fill-opacity="${col.opacity}"` : ''}${p.letterSpacing ? ` letter-spacing="${num(p.letterSpacing)}"` : ''}>${esc(line)}</text>`
    })
    .join('')
}

function primSvg(p: SketchPrim, ctx: Ctx): string {
  switch (p.t) {
    case 'rect':
      return `<rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w)}" height="${num(p.h)}"${p.r ? ` rx="${num(p.r)}"` : ''}${fillAttrs(p.fill)}${strokeAttrs(p.stroke)}/>`
    case 'ellipse':
      return `<ellipse cx="${num(p.x + p.w / 2)}" cy="${num(p.y + p.h / 2)}" rx="${num(p.w / 2)}" ry="${num(p.h / 2)}"${fillAttrs(p.fill)}${strokeAttrs(p.stroke)}/>`
    case 'line':
      return `<line x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}"${strokeAttrs({ color: p.color, width: p.width })}/>`
    case 'text':
      return textEl(p)
    case 'image':
      return imageEl(p.x, p.y, p.w, p.h, p.src, p.fit, ctx, p.radius)
  }
}

function imageEl(x: number, y: number, w: number, h: number, src: string, fit: 'cover' | 'contain' | 'fill', ctx: Ctx, radius?: number): string {
  const remote = /^https?:\/\//.test(src)
  const href = remote ? src : dataUri(src, ctx.loadImage)
  if (href === null) {
    ctx.warnings.push(`image « ${src} » introuvable : remplacée par un cadre vide`)
    return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="#E7E0EC" stroke="#CAC4D0"/>`
  }
  const par = fit === 'cover' ? 'xMidYMid slice' : fit === 'contain' ? 'xMidYMid meet' : 'none'
  let clip = ''
  if (radius !== undefined && radius > 0) {
    const id = `c${ctx.n++}`
    ctx.defs.push(`<clipPath id="${id}"><rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}"/></clipPath>`)
    clip = ` clip-path="url(#${id})"`
  }
  return `<image x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" href="${esc(href)}" preserveAspectRatio="${par}"${clip}/>`
}

function wrap(node: Node, inner: string): string {
  const tf: string[] = [`translate(${num(node.frame.x)} ${num(node.frame.y)})`]
  if (node.rotation !== 0) tf.push(`rotate(${num(node.rotation)} ${num(node.frame.w / 2)} ${num(node.frame.h / 2)})`)
  return `<g data-name="${esc(node.name)}" transform="${tf.join(' ')}"${node.opacity < 1 ? ` opacity="${num(node.opacity)}"` : ''}>${inner}</g>`
}

function solid(fills: { type: string; color?: Color }[]): string | undefined {
  const f = fills.find((x) => x.type === 'solid' && x.color !== undefined)
  return f?.color === undefined ? undefined : hexOf(f.color)
}

function nodeSvg(node: Node, ctx: Ctx): string {
  if (!node.visible) return ''
  const w = node.frame.w
  const h = node.frame.h
  switch (node.type) {
    case 'frame': {
      const { under, over } = containerSketch(node as FrameNode)
      const f = node as FrameNode
      const stroke = f.strokes[0] !== undefined ? { color: hexOf(f.strokes[0].color), width: f.strokes[0].width } : undefined
      let body = `<rect width="${num(w)}" height="${num(h)}"${f.cornerRadius ? ` rx="${num(f.cornerRadius)}"` : ''}${fillAttrs(solid(f.fills))}${strokeAttrs(stroke)}/>`
      body += under.map((p) => primSvg(p, ctx)).join('')
      let kids = f.children.map((c) => nodeSvg(c, ctx)).join('') + over.map((p) => primSvg(p, ctx)).join('')
      if (f.clipsContent) {
        const id = `c${ctx.n++}`
        ctx.defs.push(`<clipPath id="${id}"><rect width="${num(w)}" height="${num(h)}"${f.cornerRadius ? ` rx="${num(f.cornerRadius)}"` : ''}/></clipPath>`)
        kids = `<g clip-path="url(#${id})">${kids}</g>`
      }
      return wrap(node, body + kids)
    }
    case 'rect': {
      const stroke = node.strokes[0] !== undefined ? { color: hexOf(node.strokes[0].color), width: node.strokes[0].width } : undefined
      return wrap(node, `<rect width="${num(w)}" height="${num(h)}"${node.cornerRadius ? ` rx="${num(node.cornerRadius)}"` : ''}${fillAttrs(solid(node.fills))}${strokeAttrs(stroke)}/>`)
    }
    case 'ellipse': {
      const stroke = node.strokes[0] !== undefined ? { color: hexOf(node.strokes[0].color), width: node.strokes[0].width } : undefined
      return wrap(node, `<ellipse cx="${num(w / 2)}" cy="${num(h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}"${fillAttrs(solid(node.fills))}${strokeAttrs(stroke)}/>`)
    }
    case 'line':
      return wrap(node, `<line x1="0" y1="0" x2="${num(w)}" y2="${num(h)}"${strokeAttrs({ color: hexOf(node.stroke.color), width: node.stroke.width })}/>`)
    case 'text': {
      const t = node as TextNode
      return wrap(node, textEl({ x: 0, y: 0, w, h, text: t.characters, size: t.style.fontSize, weight: t.style.fontWeight, color: hexOf(t.style.color), align: t.style.align, family: t.style.fontFamily, lineHeight: t.style.lineHeight, letterSpacing: t.style.letterSpacing }))
    }
    case 'image':
      return wrap(node, node.src === '' ? `<rect width="${num(w)}" height="${num(h)}" fill="#E7E0EC" stroke="#CAC4D0"/>` : imageEl(0, 0, w, h, node.src, node.fit, ctx))
    case 'component':
      return wrap(node, componentSketch(node).map((p) => primSvg(p, ctx)).join(''))
  }
}

export function screenToSvg(screen: FrameNode, ctx: Ctx): string {
  const { w, h } = screen.frame
  const bg = solid(screen.fills) ?? '#FFFFFF'
  const kids = screen.children.map((c) => nodeSvg(c, ctx)).join('\n  ')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}">`,
    `  <title>${esc(screen.name)}</title>`,
    ctx.defs.length > 0 ? `  <defs>${ctx.defs.join('')}</defs>` : '',
    `  <rect width="${num(w)}" height="${num(h)}"${fillAttrs(bg)}/>`,
    `  ${kids}`,
    '</svg>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

function exportSvg(doc: CalqueDocument, opts: ExportOptions): ExportResult {
  const warnings: string[] = []
  const files: { path: string; contents: string }[] = []
  const plan = planExport(doc, opts.activeScreenId)
  for (const unit of plan.units) {
    const ctx: Ctx = { loadImage: opts.loadImage, warnings, defs: [], n: 0 }
    if (unit.kind === 'screen') {
      const laid = layoutPage({ ...unit.page, nodes: [unit.screen] }).nodes[0] as FrameNode
      files.push({ path: `svg/${unit.ref.snake}.svg`, contents: screenToSvg(laid, ctx) })
    } else {
      // Page sans ecran (v1) : un SVG de la taille de l'appareil, tous les noeuds a plat.
      const page = layoutPage(unit.page)
      const body = page.nodes.map((n) => nodeSvg(n, ctx)).join('\n  ')
      files.push({
        path: `svg/${unit.names.snake}.svg`,
        contents: `<svg xmlns="http://www.w3.org/2000/svg" width="${unit.page.device.width}" height="${unit.page.device.height}" viewBox="0 0 ${unit.page.device.width} ${unit.page.device.height}">\n  <rect width="100%" height="100%" fill="#FFFFFF"/>\n  ${body}\n</svg>\n`,
      })
    }
  }
  return { files, warnings }
}

export const svgExporter: Exporter = { id: 'svg', label: 'SVG (un fichier par écran)', maturity: 'complete', export: exportSvg }
