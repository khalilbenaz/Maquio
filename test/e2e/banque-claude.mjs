// UNE passe Claude reelle sur le prototype bancaire (opt-in, appel payant) :
// « ajoute un ecran Epargne avec un objectif et une barre de progression ».
import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

if (process.env.MAQUIO_E2E_CLAUDE !== '1') { console.log('ignore (MAQUIO_E2E_CLAUDE=1 pour lancer, appel payant)'); process.exit(0) }
const t = await lancer()
const { win, work, check, shot, setNext, menu, out } = t
const pause = (ms = 200) => win.waitForTimeout(ms)
const copie = path.join(work, 'banque.maquio')
copyFileSync(path.resolve('exemples/banque.maquio'), copie)
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(900)
const noms = () => win.evaluate(() => [...document.querySelectorAll('.layers-row-name')].map((e) => e.textContent))
const avant = (await noms()).length
await win.getByLabel('Instruction', { exact: true }).fill('ajoute un écran Épargne avec un objectif et une barre de progression, dans le style des autres écrans')
const debut = Date.now()
await win.getByRole('button', { name: 'Demander à Claude', exact: true }).click()
await win.locator('.claude-panel-result, .claude-panel-alert').first().waitFor({ timeout: 280_000 })
const resultat = await win.locator('.claude-panel-result, .claude-panel-alert').first().innerText()
console.log(`   [1] ${Math.round((Date.now() - debut) / 1000)}s : ${resultat.slice(0, 300)}`)
await pause(500)
const apres = await noms()
check('claude : un ecran « Épargne » apparait', /Instruction envoyée/.test(resultat) && apres.some((n) => /pargne/i.test(n)) && apres.length > avant, `${avant} -> ${apres.length}`)
const types = await win.evaluate(() => [...document.querySelectorAll('[data-testid^="node-"]')].map((e) => e.dataset.nodeType))
check('claude : le document reste affichable (aucun noeud invalide)', types.length > 0)
await shot('b0-claude-epargne')
await t.fin()
