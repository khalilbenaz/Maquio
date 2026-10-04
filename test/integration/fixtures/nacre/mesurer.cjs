// Electron (hors ecran) : rend chaque ecran de la maquette « nacre » developpee
// (expand.mjs), enregistre une capture de reference (PNG) et mesure chaque
// element du DOM (boite, couleurs, texte, icones) dans `mesures.json`.
// Usage : npx electron test/integration/fixtures/nacre/mesurer.cjs <dossier-sortie>
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const OUT = process.argv[2]
const DUMP = `(() => {
  const root = document.body.firstElementChild
  // Les rotations sont relevees puis neutralisees : les enfants d'un element
  // tourne sont ainsi mesures dans son repere local (ce que Maquio attend).
  for (const el of document.querySelectorAll('*')) {
    const t = getComputedStyle(el).transform
    if (t !== 'none') { const m = new DOMMatrix(t); if (Math.abs(m.b) > 1e-6) { el.dataset.rot = String(Math.round(Math.atan2(m.b, m.a) * 18000 / Math.PI) / 100); el.style.transform = 'none' } }
  }
  const base = root.getBoundingClientRect()
  const rgb = (c) => c
  const out = []
  const walk = (el, depth) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim() !== '')
    const textRects = own.map((n) => { const g = document.createRange(); g.selectNodeContents(n); const lead = n.textContent.length - n.textContent.trimStart().length; const trail = n.textContent.length - n.textContent.trimEnd().length; g.setStart(n, lead); g.setEnd(n, n.textContent.length - trail); const b = g.getBoundingClientRect(); return { text: n.textContent.replace(/\\s+/g, ' ').trim(), x: b.x - base.x, y: b.y - base.y, w: b.width, h: b.height } })
    const tf = el.dataset.rot ? parseFloat(el.dataset.rot) : 0
    out.push({
      depth, tag: el.tagName.toLowerCase(), id: el.id || undefined,
      x: r.x - base.x, y: r.y - base.y, w: r.width, h: r.height,
      rot: tf, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, radiusBR: cs.borderBottomRightRadius, radiusTL: cs.borderTopLeftRadius, color: cs.color, size: cs.fontSize, weight: cs.fontWeight,
      ls: cs.letterSpacing, lh: cs.lineHeight, align: cs.textAlign, opacity: cs.opacity, overflow: cs.overflow, pos: cs.position, shadow: cs.boxShadow, borderBottom: cs.borderBottomWidth !== '0px' ? cs.borderBottomColor : undefined,
      aria: el.getAttribute('aria-label') || undefined, role: el.getAttribute('role') || undefined, checked: el.getAttribute('aria-checked') || undefined,
      href: el.getAttribute('href') || undefined, value: el.tagName === 'INPUT' ? el.value : undefined, placeholder: el.getAttribute('placeholder') || undefined,
      d: el.tagName.toLowerCase() === 'path' ? el.getAttribute('d') : undefined, stroke: el.tagName.toLowerCase() === 'svg' ? el.getAttribute('stroke') : undefined, svgw: el.tagName.toLowerCase() === 'svg' ? el.getAttribute('width') : undefined,
      texts: textRects, hidden: cs.position === 'absolute' && parseInt(cs.left) < -1000 ? true : undefined,
      br: cs.borderTopLeftRadius + '|' + cs.borderTopRightRadius + '|' + cs.borderBottomRightRadius + '|' + cs.borderBottomLeftRadius,
    })
    for (const c of el.children) walk(c, depth + 1)
  }
  walk(root, 0)
  return out
})()`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const { BOARDS, pageHtml } = await import('./expand.mjs')
  fs.mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({ show: false, width: 390, height: 844, useContentSize: true, webPreferences: { offscreen: false, backgroundThrottling: false } })
  const all = {}
  for (const name of BOARDS) {
    const file = path.join(OUT, `${name}.html`)
    fs.writeFileSync(file, pageHtml(name))
    await win.loadFile(file)
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 200))
    all[name] = await win.webContents.executeJavaScript(DUMP)
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 390, height: 844 })
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
    console.log('ok', name, all[name].length)
  }
  fs.writeFileSync(path.join(OUT, 'mesures.json'), JSON.stringify(all))
  app.quit()
})
