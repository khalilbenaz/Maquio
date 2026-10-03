// Assistance Claude REELLE (opt-in : CALQUE_E2E_CLAUDE=1) : le vrai binaire
// `claude` est appele depuis le panneau de l'application lancee. Trois appels
// seulement (chacun coute de l'ordre de 0,5 $). Verifie que le document est
// modifie, de facon valide, et annulable en un geste.
import { lancer } from './helpers.mjs'

if (process.env.CALQUE_E2E_CLAUDE !== '1') { console.log('ignore (CALQUE_E2E_CLAUDE=1 pour lancer, appels payants)'); process.exit(0) }

const t = await lancer()
const { win, check, shot, box, ids, nodes, sceneBox, drag, selected } = t
const pause = (ms = 200) => win.waitForTimeout(ms)
const btn = (name) => win.getByRole('button', { name, exact: true })

async function demander(instruction) {
  const champ = win.getByLabel('Instruction', { exact: true })
  await champ.fill(instruction)
  const debut = Date.now()
  await btn('Demander à Claude').click()
  await win.locator('.claude-panel-result, .claude-panel-alert').first().waitFor({ timeout: 170_000 })
  const resultat = await win.locator('.claude-panel-result, .claude-panel-alert').first().innerText()
  return { resultat, secondes: Math.round((Date.now() - debut) / 1000) }
}

await btn('Nouvel écran').click(); await pause()
const [ecran] = await ids()

// 1. creation d'un ecran de connexion
let r = await demander('ajoute un écran de connexion avec un champ email, un champ mot de passe et un bouton "Se connecter"')
console.log(`   [1] ${r.secondes}s : ${r.resultat.slice(0, 220)}`)
await shot('60-claude-connexion')
const types = (await nodes()).map((n) => n.type)
check('claude : « écran de connexion » modifie le document (champs et bouton)', /Instruction envoyée/.test(r.resultat) && types.includes('textField') && types.includes('button'), types.join(','))
const nApres = (await ids()).length
await win.keyboard.press('Meta+z'); await pause(250)
check('claude : annulable en un seul geste', (await ids()).length < nApres && (await ids()).length <= 1, `${nApres} -> ${(await ids()).length}`)
await win.keyboard.press('Meta+Shift+z'); await pause(250)
check('claude : rétablir restitue la modification', (await ids()).length === nApres)

// 2. alignement de la selection
await win.getByRole('tab', { name: 'Composants' }).click().catch(() => {})
await win.getByRole('tab', { name: 'Calques' }).click().catch(() => {})
const eb = await box(ecran)
const k = eb.width / 393
const avant = new Set(await ids())
for (const [x, y, w, h] of [[30, 560, 80, 50], [150, 640, 80, 50], [70, 720, 80, 50]]) {
  await btn('Rectangle').click()
  await drag(eb.x + x * k, eb.y + y * k, eb.x + (x + w) * k, eb.y + (y + h) * k, { steps: 5 })
}
const rects = (await ids()).filter((i) => !avant.has(i))
await win.keyboard.press('Escape')
const sc = await sceneBox()
await drag(Math.max(sc.x + 4, eb.x - 30), eb.y + 540 * k, eb.x + 300 * k, eb.y + 790 * k)
check('claude : trois rectangles selectionnes', (await selected()).length === 3, (await selected()).join())
r = await demander('aligne ces éléments sur leur bord gauche')
console.log(`   [2] ${r.secondes}s : ${r.resultat.slice(0, 220)}`)
const xs = []
for (const id of rects) xs.push(Math.round(((await box(id)).x - eb.x) / k))
check('claude : « aligne ces éléments » aligne vraiment la selection', /Instruction envoyée/.test(r.resultat) && xs.every((x) => Math.abs(x - xs[0]) <= 1), xs.join(','))

// 3. traduction des textes
await win.keyboard.press('Escape')
for (const [i, mot] of [['a', 'Bonjour le monde'], ['b', 'Bienvenue']].entries()) {
  await btn('Texte').click()
  const y = 20 + i * 40
  await drag(eb.x + 150 * k, eb.y + (y + 300) * k, eb.x + 360 * k, eb.y + (y + 330) * k, { steps: 5 })
  const ed = win.getByTestId('inline-text-editor')
  await ed.fill(mot[1] ?? mot); await ed.press('Enter'); await pause()
}
await win.keyboard.press('Escape')
r = await demander('traduis tous les textes du document en anglais')
console.log(`   [3] ${r.secondes}s : ${r.resultat.slice(0, 220)}`)
const textes = await win.evaluate(() => [...document.querySelectorAll('[data-node-type="text"]')].map((e) => e.textContent))
check('claude : « traduis les textes en anglais » modifie les textes', /Instruction envoyée/.test(r.resultat) && !textes.includes('Bonjour le monde') && !textes.includes('Bienvenue'), JSON.stringify(textes))
await shot('61-claude-traduction')
await t.fin()
