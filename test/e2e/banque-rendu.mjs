// Rend chaque ecran du prototype bancaire tel que Maquio l'affiche (mode
// prototype, 1:1) et l'enregistre en PNG (`OUT/rendu/<Ecran>.png`), pour la
// planche maquette / rendu. Ne verifie rien : outil de revue visuelle.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

const t = await lancer()
const { win, work, setNext, menu, out } = t
const pause = (ms = 150) => win.waitForTimeout(ms)
const copie = path.join(work, 'banque.maquio')
copyFileSync(path.resolve('exemples/banque.maquio'), copie)
const doc = JSON.parse(readFileSync(copie, 'utf8'))
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(1500); await t.shot('rendu-ouverture')
mkdirSync(path.join(out, 'rendu'), { recursive: true })
for (const e of doc.pages[0].nodes.slice(0, 16)) {
  await win.getByTestId(`layer-${e.id}`).click(); await pause(100)
  await win.getByRole('button', { name: 'Lancer le prototype', exact: true }).click(); await pause(450)
  await win.getByTestId(`proto-screen-${e.id}`).screenshot({ path: path.join(out, 'rendu', `${e.name.slice(0, 2)}.png`) })
  await win.keyboard.press('Escape'); await pause(150)
}
await t.fin()
