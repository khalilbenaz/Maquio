// Outils communs des parcours reels Electron (Playwright _electron).
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function lancer(env = {}) {
  const out = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), 'calque-e2e-'))
  mkdirSync(out, { recursive: true })
  const work = mkdtempSync(path.join(tmpdir(), 'calque-work-'))
  const results = []
  const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`) }
  const app = await electron.launch({ args: [path.resolve('apps/desktop')], env: { ...process.env, ...env } })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(e.message))
  win.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()) })
  await win.waitForTimeout(1000)
  const shot = (n) => win.screenshot({ path: path.join(out, `${n}.png`) })

  // Dialogues natifs pilotes par une variable globale du processus main.
  await app.evaluate(({ dialog }) => {
    globalThis.__next = { open: null, save: null, box: 1 }
    dialog.showOpenDialog = async () => ({ canceled: globalThis.__next.open === null, filePaths: [globalThis.__next.open] })
    dialog.showSaveDialog = async () => ({ canceled: globalThis.__next.save === null, filePath: globalThis.__next.save })
    dialog.showMessageBox = async () => ({ response: globalThis.__next.box })
  })
  const setNext = (v) => app.evaluate((_, v) => Object.assign(globalThis.__next, v), v)
  const menu = (label) => app.evaluate(({ Menu }, label) => {
    const find = (items) => { for (const i of items) { if (i.label === label) return i; if (i.submenu) { const r = find(i.submenu.items); if (r) return r } } }
    find(Menu.getApplicationMenu().items).click()
  }, label)
  const nodes = () => win.evaluate(() => [...document.querySelectorAll('[data-testid^="node-"]')].map((e) => ({ id: e.dataset.testid.slice(5), type: e.dataset.nodeType })))
  const ids = async () => (await nodes()).map((n) => n.id)
  const box = (id) => win.getByTestId(`node-${id}`).boundingBox()
  const sceneBox = () => win.getByTestId('canvas-scene').boundingBox()
  const selected = () => win.evaluate(() => [...document.querySelectorAll('[role=treeitem][aria-selected=true]')].map((e) => e.dataset.testid.replace('layer-', '')))
  const drag = async (x1, y1, x2, y2, opts = {}) => {
    await win.mouse.move(x1, y1)
    await win.mouse.down()
    await win.mouse.move(x2, y2, { steps: opts.steps ?? 8 })
    await win.mouse.up()
    await win.waitForTimeout(120)
  }
  // Trace un element avec un outil de creation, en coordonnees relatives a la scene.
  const draw = async (tool, x1, y1, x2, y2) => {
    await win.getByRole('button', { name: tool, exact: true }).click()
    const sc = await sceneBox()
    await drag(sc.x + x1, sc.y + y1, sc.x + x2, sc.y + y2, { steps: 6 })
  }
  async function fin() {
    check('aucune erreur de page', errors.length === 0, errors.join(';'))
    await app.close()
    process.exit(results.every((r) => r.ok) ? 0 : 1)
  }
  return { app, win, out, work, check, shot, setNext, menu, nodes, ids, box, sceneBox, selected, drag, draw, errors, fin, results }
}
