// Parcours reel de l'application Electron (Playwright _electron).
// Usage : npm run build && node test/e2e/parcours.mjs  (OUT=dossier de captures)
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const out = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), 'calque-e2e-'))
const work = mkdtempSync(path.join(tmpdir(), 'calque-work-'))
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`) }

const app = await electron.launch({ args: [path.resolve('apps/desktop')] })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(e.message))
win.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) errors.push(m.text()) })
await win.waitForTimeout(1000)
const shot = (n) => win.screenshot({ path: path.join(out, `${n}.png`) })

// Dialogues natifs : pilotes par une variable globale du processus main.
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

const state = () => win.evaluate(async () => {
  // Lit le document via les calques du DOM : ids de noeuds.
  return [...document.querySelectorAll('[data-testid^="node-"]')].map((e) => e.dataset.testid.slice(5))
})
const nodeBox = (id) => win.getByTestId(`node-${id}`).boundingBox()
const draw = async (tool, x1, y1, x2, y2) => {
  await win.getByRole('button', { name: tool, exact: true }).click()
  const bg = await win.getByTestId('canvas-background').boundingBox()
  await win.mouse.move(bg.x + x1, bg.y + y1); await win.mouse.down()
  await win.mouse.move(bg.x + x2, bg.y + y2, { steps: 6 }); await win.mouse.up()
  await win.waitForTimeout(200)
}

// 1. ecran
await win.getByRole('button', { name: 'Nouvel écran' }).click()
await win.waitForTimeout(200)
const ids0 = await state()
check('creer un ecran', ids0.length === 1)

// 2. creation des composants (dans l'ecran : 393x852 a ~64%)
await draw('Rectangle', 20, 40, 120, 100)
await draw('Ellipse', 130, 40, 220, 120)
await draw('Texte', 20, 150, 140, 190)
await win.keyboard.type('Bonjour')
await win.keyboard.press('Escape')
await draw('Frame', 20, 220, 200, 330)
let ids = await state()
check('4 composants traces', ids.length === 5, `(${ids.length - 1})`)
await shot('10-composants')
const imgPath = path.join(work, 'logo.png')
writeFileSync(imgPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
await setNext({ open: imgPath })
await draw('Image', 20, 360, 100, 420)
ids = await state()
check('image tracee', ids.length === 6, `(${ids.length})`)
await shot('11-image')

// 3. deplacer / redimensionner / selectionner
await win.getByRole('button', { name: 'Sélection' }).click()
const rectId = ids[1]
let b = await nodeBox(rectId)
await win.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await win.mouse.down()
await win.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 5 }); await win.mouse.up()
let b2 = await nodeBox(rectId)
check('deplacer', Math.abs(b2.x - b.x - 40) < 3 && Math.abs(b2.y - b.y - 30) < 3, `dx=${b2.x - b.x} dy=${b2.y - b.y}`)
const h = await win.getByTestId('handle-se').boundingBox()
await win.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await win.mouse.down()
await win.mouse.move(h.x + h.width / 2 + 30, h.y + h.height / 2 + 20, { steps: 5 }); await win.mouse.up()
let b3 = await nodeBox(rectId)
check('redimensionner', Math.abs(b3.width - b2.width - 30) < 3 && Math.abs(b3.height - b2.height - 20) < 3, `dw=${b3.width - b2.width}`)
// selection multiple : shift+clic
const ellId = ids[2]
const be = await nodeBox(ellId)
await win.keyboard.down('Shift')
await win.mouse.click(be.x + be.width / 2, be.y + be.height / 2)
await win.keyboard.up('Shift')
const nSel = await win.locator('[role=treeitem][aria-selected=true]').count()
check('selection multiple', nSel === 2, `(${nSel} calques selectionnes)`)
await shot('12-multi')
// deplacer la selection multiple
const bm1 = await nodeBox(rectId), be1 = await nodeBox(ellId)
await win.mouse.move(be1.x + be1.width / 2, be1.y + be1.height / 2); await win.mouse.down()
await win.mouse.move(be1.x + be1.width / 2 + 20, be1.y + be1.height / 2 + 20, { steps: 4 }); await win.mouse.up()
const bm2 = await nodeBox(rectId)
check('deplacer la multi-selection', Math.abs(bm2.x - bm1.x - 20) < 3, `dx=${bm2.x - bm1.x}`)

// 4. proprietes
await win.mouse.click(b3.x + 5, b3.y + 5) // selection simple du rect (apres deplacement)
await win.keyboard.press('Escape')
const bx = await nodeBox(rectId)
await win.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2)
const w = win.getByLabel('Largeur', { exact: true })
await w.fill('222'); await w.press('Enter')
await win.waitForTimeout(150)
const bw = await nodeBox(rectId)
check('editer largeur (inspecteur)', Math.abs(bw.width - 222 * 0.64) < 3 || Math.abs(bw.width / bx.width - 222 / (bx.width / 0.64)) < 0.1, `w=${bw.width}`)
const fill = win.getByLabel('Couleur de remplissage')
await fill.evaluate((el) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, '#ff0000'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) })
await win.waitForTimeout(150)
const bg = await win.getByTestId(`node-${rectId}`).evaluate((e) => getComputedStyle(e).backgroundColor)
check('editer couleur', /255, 0, 0/.test(bg), bg)
await shot('13-props')

// 5. annuler / retablir
const before = await nodeBox(rectId)
await win.getByRole('button', { name: 'Annuler' }).click()
const bgU = await win.getByTestId(`node-${rectId}`).evaluate((e) => getComputedStyle(e).backgroundColor)
check('annuler (bouton)', !/255, 0, 0/.test(bgU), bgU)
await win.getByRole('button', { name: 'Rétablir' }).click()
const bgR = await win.getByTestId(`node-${rectId}`).evaluate((e) => getComputedStyle(e).backgroundColor)
check('retablir (bouton)', /255, 0, 0/.test(bgR), bgR)
await win.keyboard.press('Meta+z')
const bgK = await win.getByTestId(`node-${rectId}`).evaluate((e) => getComputedStyle(e).backgroundColor)
check('annuler (Cmd+Z)', !/255, 0, 0/.test(bgK), bgK)
await win.keyboard.press('Meta+Shift+z')

// 5b. contenu du texte
const textId = ids[3]
const bt = await nodeBox(textId)
await win.mouse.click(bt.x + 3, bt.y + 3)
const contenu = win.getByLabel('Contenu', { exact: true })
await contenu.fill('Bonjour Éric'); await contenu.press('Enter')
await win.waitForTimeout(150)
check('editer le contenu du texte', (await win.getByTestId(`node-${textId}`).innerText()).includes('Bonjour Éric'))

// 6. enregistrer / rouvrir
const docPath = path.join(work, 'projet.calque')
await setNext({ save: docPath })
await menu('Enregistrer')
await win.waitForTimeout(500)
check('fichier .calque ecrit', existsSync(docPath))
const saved = existsSync(docPath) ? JSON.parse(readFileSync(docPath, 'utf8')) : null
console.log('   ressources:', existsSync(path.join(work, 'projet.ressources')) ? readdirSync(path.join(work, 'projet.ressources')) : 'aucune')
const dirtyTitle = await win.title()
check('titre non modifie apres enregistrement', !/non enregistré/.test(dirtyTitle), dirtyTitle)
const idsSaved = await state()
await menu('Nouveau')
await win.waitForTimeout(200)
check('nouveau vide', (await state()).length === 0)
await setNext({ open: docPath })
await menu('Ouvrir...')
await win.waitForTimeout(500)
const idsReopen = await state()
check('rouvrir restitue les noeuds', JSON.stringify(idsReopen) === JSON.stringify(idsSaved), `${idsReopen.length}/${idsSaved.length}`)
const imgNode = idsReopen.length ? await win.getByTestId(`node-${ids[5]}`).locator('img').count() : 0
check('image rechargee affichee', imgNode >= 1, `img=${imgNode}`)
await shot('14-rouvert')

// 7. export 4 cibles
for (const [label, dirName] of [['Flutter', 'flutter'], ['React Native', 'rn'], ['SwiftUI', 'swift'], ['Jetpack Compose', 'compose']]) {
  const dir = path.join(work, 'export-' + dirName)
  await setNext({ open: dir, box: 1 })
  mkdirSync(dir, { recursive: true })
  await win.getByRole('button', { name: 'Exporter', exact: true }).click()
  await win.getByRole('menuitem', { name: new RegExp(label) }).click()
  await win.getByRole('button', { name: "Lancer l'export" }).click()
  await win.waitForTimeout(800)
  const txt = await win.locator('.dialog-panel').innerText()
  const files = existsSync(dir) ? readdirSync(dir, { recursive: true }).filter((f) => !f.includes('.dart_tool')) : []
  check(`export ${label}`, files.length > 0, `${files.length} fichiers ; ${txt.replace(/\n/g, ' | ').slice(0, 160)}`)
  await shot(`20-export-${dirName}`)
  await win.getByRole('button', { name: "Fermer l'export" }).click()
}
// 7b. le Swift genere compile (macOS uniquement)
if (process.platform === 'darwin') {
  try {
    execFileSync('xcrun', ['swiftc', '-typecheck', '-parse-as-library', path.join(work, 'export-swift/Sources/Screens/Ecran1.swift')], { stdio: 'pipe' })
    check('SwiftUI genere : swiftc -typecheck', true)
  } catch (e) { check('SwiftUI genere : swiftc -typecheck', false, String(e.stderr ?? e)) }
}

// 8. securite : un .calque hostile ne peut pas faire copier un fichier local
const evil = JSON.parse(readFileSync(docPath, 'utf8'))
const jsonEvil = JSON.stringify(evil).replace('"src":"logo.png"', '"src":"/etc/hosts"')
const evilPath = path.join(work, 'evil.calque')
writeFileSync(evilPath, jsonEvil)
await setNext({ open: evilPath, save: path.join(work, 'evil-copie.calque') })
await menu('Ouvrir...')
await win.waitForTimeout(400)
await menu('Enregistrer sous...')
await win.waitForTimeout(500)
const alerte = await win.getByRole('alert').innerText().catch(() => '')
check('document hostile : enregistrement refuse avec message', /refus/i.test(alerte), alerte)
check('document hostile : rien copie', !existsSync(path.join(work, 'evil-copie.ressources', 'hosts')))
await shot('30-hostile')
// fichier invalide
const badPath = path.join(work, 'bad.calque'); writeFileSync(badPath, '{"nope":true}')
await setNext({ open: badPath })
await menu('Ouvrir...')
await win.waitForTimeout(400)
check('fichier invalide : message affiche', (await win.getByRole('alert').innerText().catch(() => '')).length > 0)
// navigation
const popup = await win.evaluate(() => window.open('https://example.com') === null)
check('window.open bloque', popup)
check('aucune erreur de page', errors.length === 0, errors.join(';'))
console.log('WORK=' + work)
await app.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
