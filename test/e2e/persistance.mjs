// Preferences memorisees entre deux lancements : panneau Claude replie, largeur
// de la colonne de droite. Meme profil utilisateur pour les deux lancements.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const profil = mkdtempSync(path.join(tmpdir(), 'maquio-profil-'))
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${detail}`) }
const lancer = async () => {
  const app = await electron.launch({ env: { ...process.env, MAQUIO_E2E_HIDDEN: '1', MAQUIO_CLAUDE_DISCOVERY: 'off' }, args: [path.resolve('apps/desktop'), `--user-data-dir=${profil}`] })
  const win = await app.firstWindow()
  await win.waitForTimeout(800)
  return { app, win }
}

let { app, win } = await lancer()
check('Claude : le panneau est deplie au premier lancement', await win.getByRole('button', { name: 'Demander à Claude', exact: true }).isVisible())
const largeurAvant = (await win.locator('.maquio-column-right').boundingBox()).width
await win.getByRole('button', { name: 'Replier le panneau Claude', exact: true }).click()
await win.waitForTimeout(150)
check('Claude : replier masque le panneau', (await win.getByRole('button', { name: 'Demander à Claude', exact: true }).count()) === 0 && (await win.getByTestId('toggle-claude').getAttribute('aria-pressed')) === 'false')
const sep = await win.getByTestId('right-resizer').boundingBox()
await win.mouse.move(sep.x + 2, sep.y + 200); await win.mouse.down(); await win.mouse.move(sep.x - 100, sep.y + 200, { steps: 5 }); await win.mouse.up()
await win.waitForTimeout(150)
const largeurApres = (await win.locator('.maquio-column-right').boundingBox()).width
check('Claude : la colonne se redimensionne au glisser (bornee)', largeurApres > largeurAvant + 80 && largeurApres <= 560, `${largeurAvant} -> ${largeurApres}`)
await app.close()

;({ app, win } = await lancer())
check('Claude : replie, il le reste apres relance', (await win.getByRole('button', { name: 'Demander à Claude', exact: true }).count()) === 0)
const largeurRelance = (await win.locator('.maquio-column-right').boundingBox()).width
check('Claude : la largeur est memorisee apres relance', Math.abs(largeurRelance - largeurApres) < 2, `${largeurRelance}`)
await win.keyboard.press('Meta+j')
await win.waitForTimeout(150)
check('Claude : Cmd+J deplie', await win.getByRole('button', { name: 'Demander à Claude', exact: true }).isVisible())
await win.keyboard.press('Meta+j')
await win.waitForTimeout(150)
check('Claude : Cmd+J replie', (await win.getByRole('button', { name: 'Demander à Claude', exact: true }).count()) === 0)
await win.getByTestId('toggle-claude').click()
await win.waitForTimeout(150)
check('Claude : le bouton de la barre d outils deplie', await win.getByRole('button', { name: 'Demander à Claude', exact: true }).isVisible())
await app.close()
process.exit(results.every(Boolean) ? 0 : 1)
