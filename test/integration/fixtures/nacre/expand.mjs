// Developpe les gabarits `.dc.html` de la maquette de reference « nacre »
// (sc-for, sc-if, {{valeurs}}, dc-import) en HTML statique, pour la rendre
// dans un navigateur et mesurer chaque element.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
class DCLogic { constructor(props) { this.props = props } }

function load(name) {
  const src = readFileSync(path.join(DIR, `${name}.dc.html`), 'utf8')
  const body = /<x-dc>([\s\S]*?)<\/x-dc>/.exec(src)?.[1] ?? ''
  const script = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src)?.[1] ?? ''
  const html = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '')
  return { html, script }
}

function vals(script, props) {
  const Component = new Function('DCLogic', `${script}\nreturn Component`)(DCLogic)
  return new Component(props).renderVals()
}

const get = (scope, expr) => expr.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope)

// Retrouve la fin d'une balise ouvrante `tag` (imbrication comprise).
function block(s, start, tag) {
  const open = new RegExp(`<${tag}[\\s>]`, 'g')
  const close = `</${tag}>`
  let depth = 0
  let i = start
  for (;;) {
    open.lastIndex = i
    const o = open.exec(s)
    const c = s.indexOf(close, i)
    if (c === -1) throw new Error(`balise ${tag} non fermee`)
    if (o && o.index < c) { depth += 1; i = o.index + 1; continue }
    depth -= 1
    if (depth === 0) return c + close.length
    i = c + close.length
  }
}

function render(html, scope) {
  let out = ''
  let i = 0
  while (i < html.length) {
    const m = /<(sc-for|sc-if|dc-import)\b([^>]*)>/.exec(html.slice(i))
    if (!m) { out += sub(html.slice(i), scope); break }
    out += sub(html.slice(i, i + m.index), scope)
    const start = i + m.index
    const attrs = m[2]
    const attr = (n) => new RegExp(`${n}="([^"]*)"`).exec(attrs)?.[1]
    if (m[1] === 'dc-import') {
      const end = block(html, start, 'dc-import')
      const name = attr('name')
      const props = {}
      for (const a of attrs.matchAll(/(\w[\w-]*)="([^"]*)"/g)) props[a[1]] = a[2]
      const sub1 = load(name)
      out += render(sub1.html, vals(sub1.script, props))
      i = end
      continue
    }
    const end = block(html, start, m[1])
    const inner = html.slice(start + m[0].length, end - `</${m[1]}>`.length)
    if (m[1] === 'sc-for') {
      const list = get(scope, /\{\{(.*)\}\}/.exec(attr('list'))[1])
      for (const item of list) out += render(inner, { ...scope, [attr('as')]: item })
    } else {
      const v = get(scope, /\{\{(.*)\}\}/.exec(attr('value'))[1])
      if (v) out += render(inner, scope)
    }
    i = end
  }
  return out
}
const sub = (s, scope) => s.replace(/\{\{([^}]+)\}\}/g, (_, e) => String(get(scope, e) ?? ''))

export function expandBoard(name, props = {}) {
  const { html, script } = load(name)
  return render(html, vals(script, props))
}

export const BOARDS = [
  'Bienvenue', 'Connexion', 'Main', 'Comptes', 'Transaction', 'Historique', 'Envoyer', 'Montant', 'Recap', 'Succes', 'Change', 'Cartes', 'Depenses', 'Coffres', 'Notifications', 'Profil',
]

export function pageHtml(name) {
  const fonts = [400, 500, 600, 700, 800].map((w) => `@font-face{font-family:Geist;font-weight:${w};src:url(file://${path.resolve(DIR, '../../../../node_modules/@fontsource/geist/files/geist-latin-${w}-normal.woff2')})}`.replace('${w}', w)).join('')
  return `<!doctype html><meta charset="utf-8"><style>${fonts}body{margin:0}a{color:inherit}</style>${expandBoard(name)}`
}
