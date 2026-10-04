// Mode prototype : interactions posees par l'inspecteur, jouees en apercu plein
// ecran avec leurs transitions animees (clic, appui long, delai, retour,
// overlays), puis fermeture par Echap.
import { lancer } from './helpers.mjs'

const t = await lancer()
const { win, check, shot, ids, box, nodes } = t
const pause = (ms = 150) => win.waitForTimeout(ms)
const btn = (name) => win.getByRole('button', { name, exact: true })
const calques = () => win.evaluate(() => [...document.querySelectorAll('[role=treeitem]')].map((e) => ({ id: e.dataset.testid.replace('layer-', ''), name: e.querySelector('.layers-row-name')?.textContent })))
const selectLayer = async (id) => { await win.getByTestId(`layer-${id}`).click(); await pause(80) }
const proto = () => win.getByTestId('proto-stage')
const courant = () => win.getByTestId('proto-current').innerText()

await btn('Nouvel écran').click(); await pause(); await btn('Nouvel écran').click(); await pause()
const [e1, e2] = (await calques()).map((c) => c.id)
const typeId = async (type, exclude = []) => (await nodes()).find((n) => n.type === type && !exclude.includes(n.id))?.id

// --- elements : un bouton, un dialogue, un texte « retour » dans l'ecran 2
await selectLayer(e1)
await win.getByRole('tab', { name: 'Composants' }).click()
await win.getByTestId('palette-item-button').click(); await pause(200)
const bouton = await typeId('button')
await win.getByTestId('palette-item-dialog').click(); await pause(200)
const dialogue = await typeId('dialog')
await win.getByTestId('palette-item-button').click(); await pause(200)
const bouton2 = await typeId('button', [bouton])
await win.getByRole('tab', { name: 'Calques' }).click()
// le second bouton est range plus bas pour ne pas masquer le premier
await selectLayer(bouton2)
{ const y = win.getByLabel('Y', { exact: true }); await y.fill('600'); await y.press('Enter'); await pause() }

const ajouter = async (id, { trigger, action, ecran, overlay, transition, direction, duree, delai }) => {
  await selectLayer(id)
  await btn('Ajouter une interaction').click(); await pause()
  const row = win.getByRole('group', { name: /^Interaction \d/ }).last()
  if (trigger) await row.getByLabel('Déclencheur', { exact: true }).selectOption(trigger)
  if (delai !== undefined) { const d = row.getByLabel('Délai (ms)', { exact: true }); await d.fill(String(delai)); await d.press('Enter') }
  if (action) await row.getByLabel('Action', { exact: true }).selectOption(action)
  if (ecran) await row.getByLabel('Écran cible', { exact: true }).selectOption({ label: ecran })
  if (overlay) await row.getByLabel('Overlay', { exact: true }).selectOption({ index: 0 })
  if (transition) await row.getByLabel('Transition', { exact: true }).selectOption(transition)
  if (direction) await row.getByLabel('Direction', { exact: true }).selectOption(direction)
  if (duree !== undefined) { const d = row.getByLabel('Durée (ms)', { exact: true }); await d.fill(String(duree)); await d.press('Enter') }
  await pause()
}

await ajouter(bouton, { action: 'navigate', ecran: 'Écran 2', transition: 'slide', direction: 'left', duree: 600 })
await ajouter(bouton2, { action: 'openOverlay', overlay: true, transition: 'fade', duree: 300, trigger: 'longPress' })
await ajouter(dialogue, { trigger: 'tap', action: 'closeOverlay' })
check('interactions : poser slide, appui long + overlay et fermeture par l inspecteur', (await win.getByRole('group', { name: /^Interaction 1$/ }).count()) === 1)
// ecran 2 : un texte avec « retour »
await selectLayer(e2)
await win.getByRole('tab', { name: 'Composants' }).click()
await win.getByTestId('palette-item-button').click(); await pause(200)
const retour = await typeId('button', [bouton, bouton2])
await win.getByRole('tab', { name: 'Calques' }).click()
await ajouter(retour, { action: 'back' })
// ecran 1 : navigation automatique apres un delai vers l'ecran 2 desactivee ; on la teste sur un 3e ecran
await btn('Nouvel écran').click(); await pause()
const e3 = (await calques()).find((c) => !['', e1, e2].includes(c.id) && /Écran 3/.test(c.name))?.id
await ajouter(e2, { trigger: 'afterDelay', delai: 1500, action: 'navigate', ecran: 'Écran 3', transition: 'fade', duree: 300 })
await shot('70-proto-edition')

// --- lecture
await selectLayer(e1)
await btn('Lancer le prototype').click(); await pause(300)
check('prototype : s ouvre plein ecran sur l ecran actif', (await courant()) === 'Écran 1' && await proto().isVisible())
await shot('71-proto-ecran1')
const pb = await win.getByTestId(`proto-node-${bouton}`).boundingBox()
const avant = await proto().boundingBox()
await win.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2)
await pause(120)
check('prototype : un clic lance la transition (anime)', (await proto().getAttribute('data-animating')) === 'true' && (await proto().getAttribute('data-current')) === e2)
check('prototype : pendant la transition, les deux ecrans sont montes', (await win.locator('[data-testid^="proto-screen-"]').count()) === 2)
await shot('72-proto-transition')
const mid = await win.getByTestId(`proto-screen-${e2}`).evaluate((el) => getComputedStyle(el).transform)
check('prototype : le nouvel ecran glisse (transform en cours)', mid !== 'none', mid)
await pause(800)
check('prototype : la transition se termine, un seul ecran reste', (await courant()) === 'Écran 2' && (await proto().getAttribute('data-animating')) === 'false' && (await win.locator('[data-testid^="proto-screen-"]').count()) === 1)
void avant
// retour
const rb = await win.getByTestId(`proto-node-${retour}`).boundingBox()
await win.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2)
await pause(900)
check('prototype : l action « retour » revient a l ecran precedent', (await courant()) === 'Écran 1')
// overlay : appui long sur bouton2
const pb2 = await win.getByTestId(`proto-node-${bouton2}`).boundingBox()
check('prototype : un dialogue reference par une interaction est cache au depart', (await win.getByTestId(`proto-node-${dialogue}`).count()) === 0)
await win.mouse.move(pb2.x + pb2.width / 2, pb2.y + pb2.height / 2); await win.mouse.down(); await pause(750); await win.mouse.up(); await pause(450)
check('prototype : un appui long ouvre le dialogue avec son voile', (await win.getByTestId(`proto-node-${dialogue}`).count()) === 1 && (await win.getByTestId('proto-scrim').count()) === 1)
await shot('73-proto-dialogue')
const pd = await win.getByTestId(`proto-node-${dialogue}`).boundingBox()
await win.mouse.click(pd.x + pd.width / 2, pd.y + pd.height - 10)
await pause(300)
check('prototype : un clic sur le dialogue le ferme (closeOverlay)', (await win.getByTestId(`proto-node-${dialogue}`).count()) === 0)
// delai : retour a l'ecran 2 puis attente
await win.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2); await pause(900)
check('prototype : (avant le delai) ecran 2', (await courant()) === 'Écran 2')
await pause(1900)
check('prototype : « apres un delai » enchaine seul sur l ecran 3 (fondu)', (await courant()) === 'Écran 3')
await shot('74-proto-ecran3')
await btn('Revenir au départ').click(); await pause(200)
check('prototype : « Départ » rejoue depuis le debut', (await courant()) === 'Écran 1')
await win.keyboard.press('Escape'); await pause(200)
check('prototype : Echap quitte et l edition est intacte', (await proto().count()) === 0 && (await ids()).length >= 3)
await t.fin()
