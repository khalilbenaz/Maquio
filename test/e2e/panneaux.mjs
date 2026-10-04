// Panneaux repliables : gauche, inspecteur, Claude, mode focus, redimensionnement,
// accessibilite (inert / aria-hidden / focus clavier), persistance entre deux lancements.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profil = mkdtempSync(path.join(tmpdir(), 'maquio-panneaux-'))
const out = process.env.OUT ?? mkdtempSync(path.join(tmpdir(), 'maquio-e2e-'))
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`) }
const lancer = async () => {
  const app = await electron.launch({ args: [path.resolve('apps/desktop'), `--user-data-dir=${profil}`] })
  const win = await app.firstWindow()
  await win.waitForTimeout(900)
  return { app, win }
}
const larg = async (win, id) => (await win.getByTestId(id).boundingBox())?.width ?? 0
const attente = (win, ms = 320) => win.waitForTimeout(ms) // transition 160 ms
const menu = (app, label) => app.evaluate(({ Menu }, label) => {
  const find = (items) => { for (const i of items) { if (i.label === label) return i; if (i.submenu) { const r = find(i.submenu.items); if (r) return r } } }
  find(Menu.getApplicationMenu().items).click()
}, label)

let { app, win } = await lancer()
await win.getByRole('button', { name: 'Nouvel écran' }).click(); await attente(win, 250)
const ecranId = await win.evaluate(() => document.querySelector('[data-testid^="node-"]').dataset.testid)
const boite = () => win.getByTestId(ecranId).boundingBox()
const scene = () => win.getByTestId('canvas-scene').boundingBox()

check('panneaux : etat initial, gauche 248 px, droite 300 px', Math.abs((await larg(win, 'left-column')) - 248) < 2 && Math.abs((await larg(win, 'right-column')) - 300) < 2)

// --- captures de chaque panneau, deplie puis replie, dans les deux themes
await win.emulateMedia({ colorScheme: null })
for (const theme of ['light', 'dark']) {
  await app.evaluate(({ nativeTheme }, t) => { nativeTheme.themeSource = t }, theme)
  await attente(win, 250)
  await shotPuis(win, `${theme}-tout-deplie`)
  for (const [id, nom] of [['left', 'gauche'], ['inspector', 'inspecteur'], ['claude', 'claude']]) {
    await win.getByTestId(`toggle-${id}`).click(); await attente(win)
    await shotPuis(win, `${theme}-${nom}-replie`)
    await controleOrphelin(win, `${nom}, theme ${theme}`)
    await win.getByTestId(`toggle-${id}`).click(); await attente(win)
  }
}
await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'system' })

// --- panneau gauche
const s0 = await scene(); const e0 = await boite()
await win.getByRole('button', { name: 'Replier le panneau de gauche' }).click(); await attente(win)
const s1 = await scene(); const e1 = await boite()
check('gauche : replie, largeur nulle, rien sur le bord (ni barre ni bouton)', (await larg(win, 'left-column')) < 2 && !(await win.getByRole('button', { name: 'Replier le panneau de gauche' }).isVisible()) && (await win.getByTestId('toggle-left').getAttribute('aria-pressed')) === 'false')
check('gauche : le canevas recupere la place liberee', s1.width > s0.width + 180, `${s0.width} -> ${s1.width}`)
check('gauche : l ecran ne saute pas (meme position a l ecran, meme zoom)', Math.abs(e1.x - e0.x) < 2 && Math.abs(e1.width - e0.width) < 1, `dx=${e1.x - e0.x}`)
check('accessibilite : le contenu replie est inert et aria-hidden', (await win.getByTestId('left-panel').getAttribute('aria-hidden')) === 'true' && await win.getByTestId('left-panel').evaluate((e) => e.inert))
let dedans = false
for (let i = 0; i < 25; i++) { await win.keyboard.press('Tab'); dedans ||= await win.evaluate(() => !!document.activeElement?.closest('[data-testid="left-panel"]')) }
check('accessibilite : le focus clavier ne tombe jamais dans le panneau replie', !dedans)
await win.getByTestId('toggle-left').click(); await attente(win)
check('gauche : le bouton de la barre d outils rouvre le panneau (248 px) et la vue revient', Math.abs((await larg(win, 'left-column')) - 248) < 2 && Math.abs((await boite()).x - e0.x) < 2)

// --- inspecteur et Claude
await win.getByRole('button', { name: "Replier l'inspecteur" }).click(); await attente(win, 200)
check('inspecteur : replie sans laisser d en-tete, Claude reste visible, la colonne garde sa largeur', !(await win.getByText('Inspecteur', { exact: true }).first().isVisible()) && Math.abs((await larg(win, 'right-column')) - 300) < 2 && await win.getByRole('button', { name: 'Demander à Claude' }).isVisible())
check('inspecteur : contenu inert', await win.getByTestId('inspector-panel').evaluate((e) => e.inert))
await win.getByRole('button', { name: 'Replier le panneau Claude' }).click(); await attente(win)
check('inspecteur + Claude replies : la colonne de droite disparait (largeur nulle)', (await larg(win, 'right-column')) < 2)
await shotPuis(win, 'droite-repliee')
await controleOrphelin(win, 'inspecteur + Claude replies')
const s2 = await scene()
check('droite : le canevas recupere la place', s2.width > s0.width + 200, `${s2.width}`)
check('droite : les bascules de la barre d outils ont leur infobulle et leur etat', (await win.getByTestId('toggle-inspector').getAttribute('title')).includes('+') && (await win.getByTestId('toggle-claude').getAttribute('title')).includes('J') && (await win.getByTestId('toggle-claude').getAttribute('aria-pressed')) === 'false')
await win.getByTestId('toggle-inspector').click(); await attente(win)
check('barre d outils : rouvrir l inspecteur rouvre la colonne', Math.abs((await larg(win, 'right-column')) - 300) < 2)
await win.getByTestId('toggle-claude').click(); await attente(win, 200)

// --- raccourcis
await win.keyboard.press('Meta+Alt+1'); await attente(win)
check('raccourci Cmd+Alt+1 : replie le panneau gauche', (await larg(win, 'left-column')) < 2)
await win.keyboard.press('Meta+Alt+1'); await attente(win)
check('raccourci Cmd+Alt+1 : le rouvre', Math.abs((await larg(win, 'left-column')) - 248) < 2)
await win.keyboard.press('Meta+Alt+2'); await attente(win, 200)
check('raccourci Cmd+Alt+2 : replie l inspecteur', await win.getByTestId('inspector-panel').evaluate((e) => e.inert))
await win.keyboard.press('Meta+Alt+2'); await attente(win, 200)
await win.keyboard.press('Meta+j'); await attente(win, 200)
check('raccourci Cmd+J : replie Claude', (await win.getByRole('button', { name: 'Demander à Claude' }).count()) === 0)
await win.keyboard.press('Meta+j'); await attente(win, 200)

// --- mode focus
const avantFocus = await scene()
await win.keyboard.press('Meta+.'); await attente(win)
const focus = await scene()
check('mode focus : tout est masque, le canevas est seul', (await larg(win, 'left-column')) < 2 && (await larg(win, 'right-column')) < 2 && !(await win.locator('.maquio-chrome').isVisible()) && focus.width > avantFocus.width + 500, `${avantFocus.width} -> ${focus.width}`)
check('mode focus : une pastille permet d en sortir', await win.getByRole('button', { name: 'Quitter le mode focus' }).isVisible())
await shotPuis(win, 'focus')
await win.keyboard.press('Meta+.'); await attente(win)
check('mode focus : le meme raccourci restaure l etat precedent', Math.abs((await larg(win, 'left-column')) - 248) < 2 && Math.abs((await larg(win, 'right-column')) - 300) < 2 && await win.locator('.maquio-chrome').isVisible())
await menu(app, 'Mode focus'); await attente(win)
check('menu Affichage : « Mode focus » fonctionne', (await larg(win, 'left-column')) < 2)
await menu(app, 'Mode focus'); await attente(win)
await menu(app, 'Panneau de gauche'); await attente(win)
check('menu Affichage : « Panneau de gauche » replie', (await larg(win, 'left-column')) < 2)
await menu(app, 'Panneau de gauche'); await attente(win)
await menu(app, 'Inspecteur'); await menu(app, 'Panneau Claude'); await attente(win)
check('menu Affichage : « Inspecteur » et « Panneau Claude » replient la colonne de droite', (await larg(win, 'right-column')) < 2)
await menu(app, 'Inspecteur'); await menu(app, 'Panneau Claude'); await attente(win)

// --- redimensionnement
const sep = await win.getByTestId('left-resizer').boundingBox()
await win.mouse.move(sep.x + 3, sep.y + 200); await win.mouse.down(); await win.mouse.move(sep.x + 63, sep.y + 200, { steps: 5 }); await win.mouse.up(); await attente(win, 260)
check('gauche : redimensionnable au glisser', Math.abs((await larg(win, 'left-column')) - 308) < 3, `${await larg(win, 'left-column')}`)
await win.mouse.move(sep.x + 63, sep.y + 200); await win.mouse.down(); await win.mouse.move(sep.x + 900, sep.y + 200, { steps: 5 }); await win.mouse.up(); await attente(win, 260)
check('gauche : largeur maximale (480 px)', Math.abs((await larg(win, 'left-column')) - 480) < 3)
await win.getByTestId('left-resizer').dblclick(); await attente(win, 260)
check('gauche : double-clic = largeur par defaut', Math.abs((await larg(win, 'left-column')) - 248) < 3)
await win.getByTestId('left-resizer').focus(); await win.keyboard.press('ArrowRight'); await win.keyboard.press('ArrowRight'); await attente(win, 260)
check('gauche : separateur utilisable au clavier (fleches)', Math.abs((await larg(win, 'left-column')) - 280) < 3)
await win.getByTestId('right-resizer').dblclick(); await attente(win, 260)
const rsep = await win.getByTestId('right-resizer').boundingBox()
await win.mouse.move(rsep.x + 3, rsep.y + 300); await win.mouse.down(); await win.mouse.move(rsep.x - 1200, rsep.y + 300, { steps: 5 }); await win.mouse.up(); await attente(win, 260)
check('droite : largeur maximale (560 px)', Math.abs((await larg(win, 'right-column')) - 560) < 3)
await win.getByTestId('right-resizer').dblclick(); await attente(win, 260)
check('droite : double-clic = largeur par defaut', Math.abs((await larg(win, 'right-column')) - 300) < 3)

// --- mouvement reduit
await win.emulateMedia({ reducedMotion: 'reduce' })
check('prefers-reduced-motion : aucune transition', (await win.getByTestId('left-column').evaluate((e) => getComputedStyle(e).transitionDuration)) === '0s')
await win.emulateMedia({ reducedMotion: 'no-preference' })
check('sinon : transition courte (160 ms)', (await win.getByTestId('left-column').evaluate((e) => getComputedStyle(e).transitionDuration)) ?.startsWith('0.16s'))

// --- persistance : etat personnalise puis relance
await win.getByTestId('left-resizer').focus(); for (let i = 0; i < 4; i++) await win.keyboard.press('ArrowRight')   // 248 + 64 + (280 deja) -> on lit la valeur
await attente(win, 300)
const largeurGauche = await larg(win, 'left-column')
await win.getByRole('button', { name: "Replier l'inspecteur" }).click(); await attente(win, 200)
await app.close()
;({ app, win } = await lancer())
check('persistance : la largeur du panneau gauche est retrouvee', Math.abs((await larg(win, 'left-column')) - largeurGauche) < 3, `${largeurGauche}`)
check('persistance : l inspecteur replie le reste', await win.getByTestId('inspector-panel').evaluate((e) => e.inert))
await win.getByTestId('toggle-inspector').click(); await attente(win, 200)
await win.getByRole('button', { name: 'Replier le panneau de gauche' }).click(); await attente(win)
await win.keyboard.press('Meta+.'); await attente(win)
await app.close()
;({ app, win } = await lancer())
check('persistance : le mode focus ET l etat replie du panneau gauche survivent a la relance', (await larg(win, 'left-column')) < 2 && await win.getByRole('button', { name: 'Quitter le mode focus' }).isVisible())
await win.keyboard.press('Meta+.'); await attente(win)
check('persistance : quitter le focus restaure (gauche encore replie)', (await larg(win, 'left-column')) < 2 && Math.abs((await larg(win, 'right-column')) - 300) < 2)
await win.getByTestId('toggle-left').click(); await attente(win)
check('tout est restaure', Math.abs((await larg(win, 'left-column')) - largeurGauche) < 3)
await app.close()
process.exit(results.every(Boolean) ? 0 : 1)

// Aucun bouton de panneau (repli, bascule, ancienne barre) ne doit etre visible dans la zone du canevas.
async function controleOrphelin(w, quand) {
  const zone = await w.locator('.maquio-column-canvas').boundingBox()
  const boutons = await w.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.closest('.maquio-chrome') && !b.closest('.maquio-column-canvas') && !b.closest('[inert]')).map((b) => ({ label: b.getAttribute('aria-label') || b.textContent, r: b.getBoundingClientRect().toJSON(), visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length) })).filter((b) => b.visible && b.r.width > 0))
  const dansZone = boutons.filter((b) => b.r.x < zone.x + zone.width - 1 && b.r.x + b.r.width > zone.x + 1 && b.r.y > 70)
  const flottants = boutons.filter((b) => /Déplier|Replier|panneau|Inspecteur|Claude/i.test(b.label ?? '') && b.r.x > zone.x - 1 && b.r.x + b.r.width < zone.x + zone.width + 1)
  check(`panneaux replies (${quand}) : aucun bouton de panneau dans la zone du canevas`, flottants.length === 0, flottants.map((b) => b.label).join(','))
  void dansZone
}

async function shotPuis(w, nom) { await w.screenshot({ path: path.join(out, `80-${nom}.png`) }) }
