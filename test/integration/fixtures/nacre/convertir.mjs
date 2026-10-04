// Convertit les mesures du DOM de la maquette « nacre » (mesurer.cjs) en une
// SPECIFICATION d'ecrans (`nacre-spec.json`) : arbre de frames, textes,
// pictogrammes et composants semantiques, aux coordonnees mesurees. Le fichier
// `banque.maquio` est ensuite construit a partir de cette specification par
// les COMMANDES du document (voir fixtures/banque.ts).
// Usage : node convertir.mjs <mesures.json> > nacre-spec.json
import { readFileSync } from 'node:fs'

const [, , file] = process.argv
const MES = JSON.parse(readFileSync(file, 'utf8'))

const col = (s) => {
  const m = /rgba?\(([^)]+)\)/.exec(s ?? '')
  if (!m) return null
  const [r, g, b, a = 1] = m[1].split(',').map((v) => parseFloat(v))
  return a === 0 ? null : { r: r / 255, g: g / 255, b: b / 255, a }
}
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
const r1 = (n) => Math.round(n * 10) / 10
const px = (s) => (typeof s === 'string' && s.endsWith('px') ? parseFloat(s) : 0)

// pictogrammes : trace SVG -> nom du jeu d'icones de Maquio (indices = ordre de premiere apparition)
const ICON_BY_PATH = new Map([
  [0, 'face'], [1, 'backspace'], [2, 'search'], [3, 'notifications'], [4, 'chevronDown'], [5, 'add'], [6, 'arrowForward'], [7, 'swap'],
  [8, 'moreHoriz'], [9, 'home'], [10, 'card'], [11, 'vault'], [12, 'person'], [13, 'chevronLeft'], [14, 'copy'], [15, 'close'], [16, 'upload'],
  [17, 'coffee'], [18, 'arrowBack'], [19, 'chevronRight'], [20, 'shieldCheck'], [21, 'check'], [22, 'arrowDown'],
  [24, 'snowflake'], [25, 'eye'], [26, 'lock'], [27, 'sliders'], [28, 'plane'], [29, 'shield'], [30, 'bike'], [31, 'arrowUp'],
  [32, 'warning'], [33, 'star'], [34, 'document'], [35, 'document'], [36, 'globe'], [37, 'contrast'], [38, 'face'], [39, 'smartphone'], [40, 'logout'],
])
const allPaths = []
for (const els of Object.values(MES)) for (const e of els) if (e.d && !allPaths.includes(e.d)) allPaths.push(e.d)
const iconOf = (d) => ICON_BY_PATH.get(allPaths.indexOf(d))

function tree(list) {
  const root = { children: [] }
  const stack = [root]
  for (const e of list) {
    const n = { ...e, children: [] }
    stack.length = e.depth + 1
    stack[e.depth].children.push(n)
    stack[e.depth + 1] = n
  }
  // Ordre de peinture CSS : les elements positionnes passent au-dessus des elements en flux.
  const order = (n) => {
    n.children.forEach(order)
    n.children = [...n.children.filter((c) => c.pos === 'static' || !c.pos), ...n.children.filter((c) => c.pos && c.pos !== 'static')]
  }
  order(root)
  return root.children[0]
}

const screenHref = (h) => (h ? h.replace('.dc.html', '') : undefined)
const visible = (n) => !n.hidden
const hasBg = (n) => col(n.bg) !== null
const ring = (n) => {
  const sh = n.shadow ?? ''
  if (!/inset/.test(sh)) return null
  const m = /0px 0px 0px (\d+)px/.exec(sh)
  const c = /rgb[a]?\([^)]*\)/.exec(sh)
  return m && c ? { width: +m[1], color: hex(col(c[0])), inset: true } : null
}
const outerRing = (n) => {
  const m = /rgb[a]?\([^)]*\) 0px 0px 0px (\d+)px/.exec(n.shadow ?? '')
  const c = /rgb[a]?\([^)]*\)/.exec(n.shadow ?? '')
  return m && c && !/inset/.test(n.shadow) ? { width: +m[1], color: hex(col(c[0])) } : null
}
const descendants = (n) => n.children.flatMap((c) => [c, ...descendants(c)])
const firstText = (n) => descendants(n).find((d) => d.texts.length)?.texts[0].text

function textItem(n, t, o) {
  const size = px(n.size)
  const lh = px(n.lh)
  const single = t.h < size * 1.6
  return {
    t: 'text', text: t.text, x: r1(t.x - o.x), y: r1(t.y - o.y), w: r1(t.w), h: r1(t.h), size, weight: +n.weight,
    color: hex(col(n.color) ?? { r: 0, g: 0, b: 0 }), ls: px(n.ls) ? r1(px(n.ls)) : 0, align: n.align === 'center' ? 'center' : n.align === 'right' || n.align === 'end' ? 'right' : 'left',
    lh: single ? r1(t.h) : r1(lh || size * 1.2), ...(single ? {} : { multi: true }),
  }
}

function convertNode(n, o) {
  if (n.hidden || n.tag === 'label' || n.tag === 'path') return []
  const tag = n.tag
  // pictogramme
  if (tag === 'svg') {
    const p = n.children.find((c) => c.tag === 'path')
    if (!p) return []
    const name = iconOf(p.d)
    if (name === undefined) {
      const pts = [...p.d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [r1(+m[1] + n.x - o.x), r1(+m[2] + n.y - o.y)])
      return [{ t: 'chart', points: pts, color: n.stroke, width: 2.5, name: n.aria ?? 'Courbe' }]
    }
    return [{ t: 'icon', name, x: r1(n.x - o.x), y: r1(n.y - o.y), size: Math.round(n.w), color: n.stroke && n.stroke !== 'none' ? n.stroke : '#0B0C10' }]
  }
  if (tag === 'input') {
    return [{
      t: 'input', x: r1(n.x - o.x), y: r1(n.y - o.y), w: r1(n.w), h: r1(n.h), value: n.value ?? '', placeholder: n.placeholder ?? '',
      fill: hex(col(n.bg) ?? { r: 1, g: 1, b: 1 }), radius: px(n.radius), ring: outerRing(n), color: hex(col(n.color)), size: px(n.size), align: n.align === 'center' ? 'center' : 'left',
      name: n.id === 'q' ? 'Recherche' : n.id === 'who' ? 'Destinataire' : 'Motif',
    }]
  }
  // barre d'onglets : composant semantique
  if (tag === 'nav' && n.aria === 'Navigation principale') {
    const items = n.children.map((a) => ({ label: a.texts[0]?.text ?? '', href: screenHref(a.href), weight: a.weight, color: hex(col(a.color)) }))
    const selected = items.findIndex((i) => +i.weight >= 700)
    return [{ t: 'tabbar', x: r1(n.x - o.x), y: r1(n.y - o.y), w: r1(n.w), h: r1(n.h), items, selected, accent: items[selected]?.color }]
  }
  // ligne de reglage avec interrupteur
  const sw = n.children.find((c) => c.role === 'switch')
  if (sw) {
    const label = n.children.find((c) => c.tag === 'span' && c !== sw)?.texts[0]?.text ?? ''
    const out = [{ t: 'switch', x: r1(n.x - o.x), y: r1(n.y - o.y), w: r1(n.w), h: r1(n.h), on: sw.checked === 'true', label, color: hex(col(sw.bg)), name: label }]
    if (n.borderBottom) out.push({ t: 'frame', name: 'Séparateur', x: r1(n.x - o.x), y: r1(n.y - o.y + n.h - 1), w: r1(n.w), h: 1, fill: '#F0F1F4', children: [] })
    return out
  }
  // barre de progression (piste + remplissage)
  if ((tag === 'div' || tag === 'span') && hasBg(n)) {
    const kids = n.children.filter(visible)
    if (n.h <= 8 && kids.length === 1 && hasBg(kids[0]) && kids[0].h === n.h && n.texts.length === 0) {
      return [{ t: 'progress', x: r1(n.x - o.x), y: r1(n.y - o.y), w: r1(n.w), h: r1(n.h), value: Math.round((kids[0].w / n.w) * 1000) / 1000, color: hex(col(kids[0].bg)), track: hex(col(n.bg)), name: 'Progression' }]
    }
  }
  const bg = col(n.bg)
  const asFrame = bg !== null || ring(n) || tag === 'a' || tag === 'button' || n.opacity !== '1' || n.rot !== 0 || (n.overflow === 'hidden' && n.depth <= 1)
  if (!asFrame) return [...n.texts.map((t) => textItem(n, t, o)), ...n.children.flatMap((c) => convertNode(c, o))]
  const corners = n.br.split('|').map(px)
  const frame = { x: n.x, y: n.y }
  return [{
    t: 'frame', x: r1(n.x - o.x), y: r1(n.y - o.y), w: r1(n.w), h: r1(n.h), name: n.aria ?? n.texts[0]?.text ?? firstText(n),
    ...(bg ? { fill: hex(bg), ...(bg.a < 1 ? { alpha: Math.round(bg.a * 100) / 100 } : {}) } : {}),
    ...(corners[0] ? { radius: corners[0] } : {}),
    ...(corners.some((v) => v !== corners[0]) ? { corners } : {}),
    ...(ring(n) ? { ring: ring(n) } : {}),
    ...(n.rot ? { rot: n.rot } : {}),
    ...(n.opacity !== '1' ? { opacity: +n.opacity } : {}),
    ...(n.overflow === 'hidden' ? { clip: true } : {}),
    ...(n.href ? { href: screenHref(n.href) } : {}),
    ...(tag === 'button' ? { button: true } : {}),
    ...(n.role === 'dialog' ? { sheet: true } : {}),
    color: hex(col(n.color) ?? { r: 0, g: 0, b: 0 }),
    children: [...n.texts.map((t) => textItem(n, t, frame)), ...n.children.flatMap((c) => convertNode(c, frame))],
  }]
}

const out = {}
for (const [name, list] of Object.entries(MES)) {
  const root = tree(list)
  const o = { x: root.x, y: root.y }
  out[name] = { w: root.w, h: root.h, fill: hex(col(root.bg)), children: root.children.flatMap((c) => convertNode(c, o)) }
}
process.stdout.write(JSON.stringify(out))
