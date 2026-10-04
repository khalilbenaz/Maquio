// Theme de l'editeur : systeme / clair / sombre. Le chrome change, le canevas et
// les ecrans du document NON. Memorise entre deux lancements, applique sans
// redemarrage, fond de fenetre aligne (pas de flash).
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profil = mkdtempSync(path.join(tmpdir(), 'maquio-theme-'))
const out = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), 'maquio-e2e-'))
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`) }
const lancer = async () => {
  const app = await electron.launch({ env: { ...process.env, MAQUIO_E2E_HIDDEN: '1', MAQUIO_CLAUDE_DISCOVERY: 'off' }, args: [path.resolve('apps/desktop'), `--user-data-dir=${profil}`], colorScheme: null })
  const win = await app.firstWindow()
  await win.waitForTimeout(900)
  return { app, win }
}
const menu = (app, label) => app.evaluate(({ Menu }, label) => {
  const find = (items) => { for (const i of items) { if (i.label === label) return i; if (i.submenu) { const r = find(i.submenu.items); if (r) return r } } }
  find(Menu.getApplicationMenu().items).click()
}, label)
const css = (win, sel, prop) => win.locator(sel).first().evaluate((e, p) => getComputedStyle(e)[p], prop)
const token = (win, nom) => win.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), nom)
const fond = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase())
const rgb = (hex) => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})` }

let { app, win } = await lancer()
await win.getByRole('button', { name: 'Nouvel écran', exact: true }).click(); await win.waitForTimeout(250)
await win.getByRole('button', { name: 'Rectangle', exact: true }).click()
const sc = await win.getByTestId('canvas-scene').boundingBox()
await win.mouse.move(sc.x + 300, sc.y + 250); await win.mouse.down(); await win.mouse.move(sc.x + 420, sc.y + 330, { steps: 4 }); await win.mouse.up()

// systeme : suit nativeTheme
const systemeSombre = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
check('theme systeme par defaut : suit l apparence de l ordinateur', (await css(win, 'body', 'backgroundColor')) === rgb(systemeSombre ? '#16131f' : '#f4efe6'), `systeme sombre=${systemeSombre}`)

// sombre
await menu(app, 'Thème sombre'); await win.waitForTimeout(300)
const canvasSombre = await css(win, '[data-testid=canvas-scene]', 'backgroundColor')
const ecranSombre = await css(win, '[data-testid=canvas-background]', 'backgroundColor')
check('sombre : chrome encre (#16131F), texte papier', (await css(win, 'body', 'backgroundColor')) === rgb('#16131f') && (await css(win, 'body', 'color')) === rgb('#f4efe6'))
check('sombre : fond de fenetre aligne', (await fond(app)).startsWith('#16131f'), await fond(app))
await win.screenshot({ path: path.join(out, '90-theme-sombre.png') })

// clair, sans redemarrage
await menu(app, 'Thème clair'); await win.waitForTimeout(300)
check('clair : chrome papier (#F4EFE6), texte encre, applique sans redemarrage', (await css(win, 'body', 'backgroundColor')) === rgb('#f4efe6') && (await css(win, 'body', 'color')) === rgb('#16131f'))
check('clair : les panneaux, la barre d outils et l inspecteur suivent', (await css(win, '.toolbar', 'backgroundColor')) !== rgb('#16131f') && (await css(win, '.layers-panel', 'color')) !== rgb('#f4efe6'))
check('clair : le CANEVAS ne change pas (meme fond sombre, ecrans blancs)', (await css(win, '[data-testid=canvas-scene]', 'backgroundColor')) === canvasSombre && (await css(win, '[data-testid=canvas-background]', 'backgroundColor')) === ecranSombre)
check('clair : les elements du document gardent leurs couleurs', (await win.locator('[data-node-type=rect]').first().evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(217, 217, 230)')
check('clair : fond de fenetre aligne', (await fond(app)).startsWith('#f4efe6'), await fond(app))
check('clair : accent de texte fonce (contraste) et accent de remplissage corail', (await token(win, '--maquio-accent-text')) === '#c2370f' && (await token(win, '--maquio-accent')) === '#ff5a36')
await win.screenshot({ path: path.join(out, '91-theme-clair.png') })

// reglages : selection reflete le choix, changement depuis le dialogue
await win.getByRole('button', { name: 'Réglages', exact: true }).click()
check('reglages : « Apparence » reflete le theme choisi dans le menu', (await win.getByLabel("Thème de l'éditeur").inputValue()) === 'light')
await win.getByLabel("Thème de l'éditeur").selectOption('dark'); await win.waitForTimeout(300)
check('reglages : choisir « Sombre » l applique aussitot', (await css(win, 'body', 'backgroundColor')) === rgb('#16131f'))
await win.getByLabel("Thème de l'éditeur").selectOption('light'); await win.waitForTimeout(300)
await win.screenshot({ path: path.join(out, '92-theme-clair-reglages.png') })
await win.getByRole('button', { name: 'Fermer les réglages', exact: true }).click()
await app.close()

// persistance
;({ app, win } = await lancer())
check('persistance : le theme clair est retrouve apres relance', (await css(win, 'body', 'backgroundColor')) === rgb('#f4efe6'))
check('persistance : le fond de fenetre est deja clair (pas de flash)', (await fond(app)).startsWith('#f4efe6'))
await menu(app, 'Thème : système'); await win.waitForTimeout(300)
check('retour au theme systeme', (await css(win, 'body', 'backgroundColor')) === rgb(systemeSombre ? '#16131f' : '#f4efe6'))
await menu(app, 'Thème sombre'); await win.waitForTimeout(250)
await app.close()
;({ app, win } = await lancer())
check('persistance : le theme sombre est retrouve apres relance, fond de fenetre sombre', (await css(win, 'body', 'backgroundColor')) === rgb('#16131f') && (await fond(app)).startsWith('#16131f'))
await menu(app, 'Thème : système')
await app.close()
process.exit(results.every(Boolean) ? 0 : 1)
