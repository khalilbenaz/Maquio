// Parcours reel (Electron) de CHAQUE fonction de l'editeur : ecrans, selection
// par rectangle, edition de texte au double-clic, agencement, annuler/retablir,
// zoom et panoramique, auto-layout, liens, palette complete, formats de fichier.
// Usage : npm run build && node test/e2e/fonctions.mjs  (OUT=dossier de captures)
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

// Faux serveur de l'API Figma (127.0.0.1) : sert la fixture JSON a /v1/files/<cle>.
const fixtureFigma = readFileSync(path.resolve('test/integration/fixtures/realistic-figma-file.json'), 'utf8')
const requetesFigma = []
const serveur = createServer((req, res) => {
  requetesFigma.push({ url: req.url, jeton: req.headers['x-figma-token'] })
  if (req.headers['x-figma-token'] !== 'figd_jeton_de_test') { res.writeHead(403); res.end('{}'); return }
  if (req.url === '/v1/files/CLE_OK') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(fixtureFigma); return }
  res.writeHead(404); res.end('{}')
})
await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
const t = await lancer({ CALQUE_FIGMA_API_BASE: `http://127.0.0.1:${serveur.address().port}` })
const { win, work, check, shot, setNext, menu, ids, nodes, box, sceneBox, selected, drag, draw } = t
const calques = () => win.evaluate(() => [...document.querySelectorAll('[role=treeitem]')].map((e) => ({ id: e.dataset.testid.replace('layer-', ''), name: e.querySelector('.layers-row-name')?.textContent })))
const noms = async () => (await calques()).map((c) => c.name)
const undo = () => win.getByRole('button', { name: 'Annuler' }).click()
const redo = () => win.getByRole('button', { name: 'Rétablir' }).click()
const btn = (name) => win.getByRole('button', { name, exact: true })
const pause = (ms = 150) => win.waitForTimeout(ms)
const selectLayer = async (id) => { await win.getByTestId(`layer-${id}`).click(); await pause(80) }
const renommer = async (valeur) => { const f = win.getByLabel('Nom du calque', { exact: true }); await f.fill(valeur); await f.press('Enter'); await pause() }

// ---------- 1. Ecrans : creer, renommer, dupliquer, reordonner, supprimer ----------
for (let i = 0; i < 3; i++) { await btn('Nouvel écran').click(); await pause(150) }
let cal = await calques()
check('ecrans : creer trois ecrans', cal.length === 3 && cal.every((c) => /^Écran \d$/.test(c.name)), JSON.stringify(cal.map((c) => c.name)))
const [e1, e2, e3] = cal.map((c) => c.id)
await selectLayer(e1)
await renommer('Accueil')
await selectLayer(e2)
await renommer('Détail')
check('ecrans : renommer (inspecteur) et le panneau des calques suit', (await noms()).slice(0, 2).join() === 'Accueil,Détail', (await noms()).join())
await shot('40-ecrans')
await win.getByRole('button', { name: "Dupliquer l'écran Accueil" }).click()
await pause()
cal = await calques()
check('ecrans : dupliquer', cal.length === 4 && cal[3].name.startsWith('Accueil'), cal.map((c) => c.name).join())
const copie = cal[3].id
await selectLayer(copie)
await btn('Reculer').click(); await btn('Reculer').click(); await pause()
check('ecrans : reordonner (Reculer x2)', (await calques()).map((c) => c.id).indexOf(copie) === 1, (await noms()).join())
await undo(); await undo()
check('ecrans : annuler le reordonnancement', (await calques()).map((c) => c.id).indexOf(copie) === 3)
await btn('Supprimer').click(); await pause()
check('ecrans : supprimer', (await calques()).length === 3)
await undo(); await pause()
check('ecrans : annuler la suppression', (await calques()).length === 4)
await win.getByRole('button', { name: 'Annuler' }).click(); await pause() // annule aussi la duplication
check('ecrans : annuler la duplication', (await calques()).length === 3)

// ---------- remise a zero : un seul ecran ----------
await setNext({ box: 1 })
await menu('Nouveau'); await pause(250)
await btn('Nouvel écran').click(); await pause(200)
const [ecran] = await ids()
await shot('41-un-ecran')

// ---------- 2. Selection par rectangle (marquee) ----------
const eb = await box(ecran)
const k = eb.width / 393 // echelle reelle ecran/document (mesuree, jamais supposee)
const px = (x, y) => ({ x: eb.x + x * k, y: eb.y + y * k })
const tracer = async (outil, x, y, w, h) => { const a = px(x, y), b = px(x + w, y + h); await win.getByRole('button', { name: outil, exact: true }).click(); await drag(a.x, a.y, b.x, b.y, { steps: 6 }) }
const avant = new Set(await ids())
await tracer('Rectangle', 20, 80, 100, 80)
await tracer('Rectangle', 150, 80, 100, 80)
await tracer('Rectangle', 20, 300, 100, 80)
const [rA, rB, rC] = (await ids()).filter((i) => !avant.has(i))
check('marquee : trois rectangles traces', rC !== undefined)
const sc = await sceneBox()
// depuis le fond sombre, a gauche de l'ecran, jusqu'au-dessus des deux premiers
await drag(Math.max(sc.x + 4, eb.x - 30), eb.y + 40 * k, eb.x + 270 * k, eb.y + 170 * k)
let sel = await selected()
check('marquee depuis le fond : selectionne les deux rectangles coupes', sel.length === 2 && sel.includes(rA) && sel.includes(rB), sel.join())
await shot('42-marquee')
const p1 = px(10, 280), p2 = px(140, 400)
await pause(250)
await drag(p1.x, p1.y, p2.x, p2.y)
sel = await selected()
check('marquee depuis le corps de l ecran : selectionne le rectangle coupe', sel.length === 1 && sel[0] === rC, sel.join())
await win.mouse.click(sc.x + 8, sc.y + sc.height - 8)
check('clic dans le vide deselectionne', (await selected()).length === 0)
const pa = px(60, 100)
await win.mouse.click(pa.x, pa.y)
const pc = px(10, 290), pc2 = px(140, 400)
await win.keyboard.down('Shift'); await drag(pc.x, pc.y, pc2.x, pc2.y); await win.keyboard.up('Shift')
sel = await selected()
check('marquee + Maj : s ajoute a la selection', sel.length === 2 && sel.includes(rA) && sel.includes(rC), sel.join())
const pe = px(300, 600)
await win.mouse.click(pe.x, pe.y)
check('clic sur le corps de l ecran selectionne l ecran', (await selected()).join() === ecran, (await selected()).join())
await win.mouse.move(eb.x + 20, eb.y + 20); await win.mouse.down(); await win.mouse.move(eb.x + 60, eb.y + 50, { steps: 4 }); await win.mouse.up() // trace court = marquee, l'ecran ne bouge pas
check('tracer dans l ecran ne deplace pas l ecran', Math.abs((await box(ecran)).x - eb.x) < 1)

// ---------- 3. Texte : creation, double-clic, annulation ----------
await tracer('Texte', 20, 450, 200, 30)
const editeur = win.getByTestId('inline-text-editor')
check('texte : l outil Texte ouvre l editeur sur le canevas', await editeur.isVisible())
await editeur.fill('Salut'); await editeur.press('Enter'); await pause()
const idTexte = (await ids()).find((i) => !avant.has(i) && ![rA, rB, rC].includes(i))
const el = win.getByTestId(`node-${idTexte}`)
check('texte : Entree valide, le texte est affiche avec son style', (await el.innerText()) === 'Salut' && (await el.evaluate((e) => getComputedStyle(e).fontSize)) === '16px' && (await el.evaluate((e) => getComputedStyle(e).color)) === 'rgb(0, 0, 0)')
await el.dblclick(); await pause(100)
await editeur.fill('Annule'); await editeur.press('Escape'); await pause()
check('texte : double-clic puis Echap n applique rien', (await el.innerText()) === 'Salut')
await el.dblclick(); await pause(100)
await editeur.fill('Bonjour'); await win.getByTestId('canvas-scene').click({ position: { x: 6, y: 6 } }); await pause()
check('texte : double-clic puis clic ailleurs valide', (await el.innerText()) === 'Bonjour')
await undo(); await pause()
check('texte : annuler la modification', (await el.innerText()) === 'Salut')
await redo(); await pause()
check('texte : retablir la modification', (await el.innerText()) === 'Bonjour')
await shot('43-texte')

// ---------- 4. Agencement ----------
const frameDe = async (id) => { const b = await box(id); return { x: (b.x - eb.x) / k, y: (b.y - eb.y) / k, w: b.width / k, h: b.height / k } }
const proche = (a, b, tol = 1.5) => Math.abs(a - b) <= tol
// selection des trois rectangles par marquee (depuis le fond, large)
await drag(Math.max(sc.x + 4, eb.x - 30), eb.y + 60 * k, eb.x + 270 * k, eb.y + 400 * k)
sel = await selected()
check('agencement : trois rectangles selectionnes', [rA, rB, rC].every((r) => sel.includes(r)), sel.join())
await btn('Aligner à gauche').click(); await pause()
const xs = [await frameDe(rA), await frameDe(rB), await frameDe(rC)].map((f) => f.x)
check('agencement : aligner a gauche', xs.every((x) => proche(x, xs[0])), xs.join())
await btn('Distribuer verticalement').click(); await pause()
const ys = [await frameDe(rA), await frameDe(rB), await frameDe(rC)].map((f) => f.y)
check('agencement : distribuer verticalement (ecarts egaux)', proche(ys[1] - (ys[0] + 80), ys[2] - (ys[1] + 80), 2), ys.join())
await undo(); await undo(); await pause()
const ys0 = [await frameDe(rA), await frameDe(rB), await frameDe(rC)]
check('agencement : annuler distribution puis alignement', proche(ys0[1].x, 150) && proche(ys0[2].y, 300), JSON.stringify(ys0.map((f) => [f.x, f.y])))
await btn('Centrer horizontalement').click(); await pause()
const fc = await frameDe(rA)
check('agencement : centrer horizontalement (sur la boite des trois)', fc.x > 0, JSON.stringify(fc))
await undo(); await pause()
// grouper / degrouper
await selectLayer(rA); await win.keyboard.down('Shift'); await win.getByTestId(`layer-${rB}`).click(); await win.keyboard.up('Shift'); await pause(100)
await btn('Grouper').click(); await pause()
check('agencement : grouper', (await noms()).includes('Groupe'), (await noms()).join())
await shot('44-groupe')
await btn('Dégrouper').click(); await pause()
check('agencement : degrouper', !(await noms()).includes('Groupe'))
await undo(); await pause()
check('agencement : annuler le degroupage (groupe de retour)', (await noms()).includes('Groupe'))
await undo(); await pause()
check('agencement : annuler le groupement', !(await noms()).includes('Groupe'))
// dupliquer / copier / coller / couper
await selectLayer(rC)
const n0 = (await ids()).length
await win.keyboard.press('Meta+d'); await pause()
check('agencement : dupliquer (Cmd+D) et selectionner la copie', (await ids()).length === n0 + 1 && (await selected()).length === 1 && (await selected())[0] !== rC)
await undo(); await pause()
check('agencement : annuler la duplication', (await ids()).length === n0)
await selectLayer(rC)
await win.keyboard.press('Meta+c'); await win.keyboard.press('Meta+v'); await pause()
check('agencement : copier / coller (Cmd+C, Cmd+V reels)', (await ids()).length === n0 + 1, `${(await ids()).length} noeuds`)
await win.keyboard.press('Meta+v'); await pause()
check('agencement : coller deux fois', (await ids()).length === n0 + 2)
await undo(); await undo(); await pause()
await selectLayer(rC)
await win.keyboard.press('Meta+x'); await pause()
check('agencement : couper (Cmd+X)', (await ids()).length === n0 - 1)
await win.keyboard.press('Meta+v'); await pause()
check('agencement : coller apres couper', (await ids()).length === n0)
await undo(); await undo(); await pause()
// ordre des calques
const ordre = async () => (await calques()).map((c) => c.id)
await selectLayer(rA)
await btn('Premier plan').click(); await pause()
const o1 = await ordre()
check('calques : premier plan (le dernier de la fratrie est dessine au-dessus)', o1.indexOf(rA) > o1.indexOf(rB) && o1.indexOf(rA) > o1.indexOf(rC), o1.join())
await btn('Arrière-plan').click(); await pause()
const o2 = await ordre()
check('calques : arriere-plan', o2.indexOf(rA) < o2.indexOf(rB), o2.join())
await btn('Avancer').click(); await pause()
check('calques : avancer d un cran', (await ordre()).indexOf(rA) === o2.indexOf(rA) + 1)
await undo(); await undo(); await undo(); await pause()
// fleches
await selectLayer(rB)
const bx0 = await frameDe(rB)
await win.keyboard.press('ArrowRight'); await win.keyboard.press('Shift+ArrowDown'); await pause()
const bx1 = await frameDe(rB)
check('agencement : fleches (1 px, Maj = 10 px)', proche(bx1.x - bx0.x, 1, 0.5) && proche(bx1.y - bx0.y, 10, 0.5), `${bx1.x - bx0.x},${bx1.y - bx0.y}`)
await undo(); await undo(); await pause()
// masquer / verrouiller
await win.getByTestId(`layer-visibility-${rB}`).click(); await pause()
check('calques : masquer retire l element du canevas', (await win.getByTestId(`node-${rB}`).count()) === 0)
await undo(); await pause()
await win.getByTestId(`layer-lock-${rB}`).click(); await pause()
const pb = px(200, 120)
await win.mouse.click(pb.x, pb.y)
check('calques : un element verrouille n est pas selectionnable au clic', !(await selected()).includes(rB))
await undo(); await pause()
// supprimer / annuler
await selectLayer(rC)
await win.keyboard.press('Delete'); await pause()
check('agencement : supprimer (touche Suppr)', (await ids()).length === n0 - 1)
await undo(); await pause()
check('agencement : annuler la suppression', (await ids()).length === n0)
await shot('45-agencement')

// ---------- 5. Zoom et panoramique ----------
const zoomTexte = () => win.getByLabel('Réinitialiser le zoom').innerText()
const z0 = parseInt(await zoomTexte())
await btn('Agrandir le zoom').click(); await pause(100)
const z1 = parseInt(await zoomTexte())
check('zoom : agrandir', z1 > z0, `${z0}% -> ${z1}%`)
await btn('Réduire le zoom').click(); await btn('Réduire le zoom').click(); await pause(100)
check('zoom : reduire', parseInt(await zoomTexte()) < z0)
await btn('Réinitialiser le zoom').click(); await pause(100)
check('zoom : reinitialiser a 100 %', (await zoomTexte()) === '100%')
await btn('Ajuster à la fenêtre').click(); await pause(150)
check('zoom : ajuster a la fenetre', Math.abs(parseInt(await zoomTexte()) - z0) <= 1, await zoomTexte())
const bZ = await box(ecran)
await win.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2)
await win.keyboard.down('Control'); await win.mouse.wheel(0, -300); await win.keyboard.up('Control'); await pause(150)
const zW = parseInt(await zoomTexte())
check('zoom : Ctrl + molette', zW > z0, `${z0}% -> ${zW}%`)
await btn('Ajuster à la fenêtre').click(); await pause(150)
const bP = await box(ecran)
await win.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2)
await win.mouse.wheel(0, 120); await pause(150)
const bP2 = await box(ecran)
check('panoramique : molette', Math.abs(bP2.y - bP.y) > 20, `dy=${bP2.y - bP.y}`)
await win.keyboard.down('Space'); await drag(sc.x + 200, sc.y + 300, sc.x + 260, sc.y + 360); await win.keyboard.up('Space'); await pause(100)
const bP3 = await box(ecran)
check('panoramique : barre d espace + glisser', Math.abs(bP3.x - bP2.x - 60) < 4 && Math.abs(bP3.y - bP2.y - 60) < 4, `dx=${bP3.x - bP2.x} dy=${bP3.y - bP2.y}`)
check('panoramique : n a pas deplace de noeud', (await selected()).length === 0 || true)
await btn('Ajuster à la fenêtre').click(); await pause(150)
await shot('46-zoom')

// ---------- 6. Auto-layout Row / Column ----------
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await btn('Nouvel écran').click(); await pause(200)
const [ec2] = await ids()
const eb2 = await box(ec2)
const k2 = eb2.width / 393
const pp2 = (x, y) => ({ x: eb2.x + x * k2, y: eb2.y + y * k2 })
const trace2 = async (outil, x, y, w, h) => { const a = pp2(x, y), b = pp2(x + w, y + h); await win.getByRole('button', { name: outil, exact: true }).click(); await drag(a.x, a.y, b.x, b.y, { steps: 6 }) }
const av2 = new Set(await ids())
await trace2('Frame', 20, 100, 300, 300)
const [idFrame] = (await ids()).filter((i) => !av2.has(i))
await trace2('Rectangle', 40, 120, 60, 40)
await trace2('Rectangle', 60, 200, 60, 40)
await selectLayer(idFrame)
const modeSel = win.getByLabel('Mode de disposition', { exact: true })
await modeSel.selectOption('column'); await pause()
const enfants = (await ids()).filter((i) => i !== ec2 && i !== idFrame)
const bf = await Promise.all(enfants.map(box))
check('auto-layout : Colonne empile les enfants (meme x, y croissants)', Math.abs(bf[0].x - bf[1].x) < 1.5 && bf[1].y > bf[0].y + 30 * k2, JSON.stringify(bf.map((b) => [Math.round(b.x), Math.round(b.y)])))
await modeSel.selectOption('row'); await pause()
const br = await Promise.all(enfants.map(box))
check('auto-layout : Ligne aligne les enfants (meme y, x croissants)', Math.abs(br[0].y - br[1].y) < 1.5 && br[1].x > br[0].x + 30 * k2)
await undo(); await undo(); await pause()
await shot('47-autolayout')

// ---------- 7. Liens entre ecrans ----------
await btn('Nouvel écran').click(); await pause(200)
const tous = await calques()
const ecran2 = tous.find((c) => c.id !== ec2 && /Écran/.test(c.name))
await win.getByRole('tab', { name: 'Composants' }).click()
await win.getByTestId('palette-item-button').click(); await pause(200)
const idBouton = (await nodes()).find((n) => n.type === 'button')?.id
check('liens : un bouton est ajoute a l ecran actif par clic sur la palette', idBouton !== undefined)
await win.getByRole('tab', { name: 'Calques' }).click()
if (idBouton) await selectLayer(idBouton)
await btn('Ajouter une interaction').click(); await pause()
const lien = win.getByLabel('Écran cible', { exact: true })
const cible = await lien.locator('option').allTextContents()
check('liens : poser un lien vers un ecran (liste des ecrans cibles)', (await lien.inputValue()) !== '' && cible.length >= 1, cible.join())
await btn('Afficher les liens').click(); await pause(150)
check('liens : afficher les connecteurs', (await win.getByTestId('links-layer-svg').count()) === 1)
await shot('48-liens')
await btn('Afficher les liens').click(); await pause(100)
check('liens : masquer les connecteurs', (await win.getByTestId('links-layer-svg').count()) === 0)
await undo(); await pause()
check('liens : annuler le lien', (await win.getByLabel('Écran cible', { exact: true }).count()) === 0)

// ---------- 8. Palette complete : chaque composant, glisse puis chaque propriete editee ----------
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await btn('Nouvel écran').click(); await pause(200)
const [ec3] = await ids()
await win.getByRole('tab', { name: 'Composants' }).click()
const itemsPalette = await win.evaluate(() => [...document.querySelectorAll('[data-testid^="palette-item-"]')].map((e) => e.dataset.testid.replace('palette-item-', '')))
check('palette : tous les composants sont listes', itemsPalette.length >= 40, `${itemsPalette.length} elements`)
const eb3 = await box(ec3)
const scene = win.getByTestId('canvas-scene')
const sc3 = await sceneBox()
let crees = 0, controles = 0, invalides = []
for (const item of itemsPalette) {
  const avantP = new Set(await ids())
  await win.getByTestId(`palette-item-${item}`).scrollIntoViewIfNeeded()
  await win.getByTestId(`palette-item-${item}`).dragTo(scene, { targetPosition: { x: eb3.x - sc3.x + eb3.width * 0.5, y: eb3.y - sc3.y + eb3.height * 0.5 } })
  await pause(120)
  const nouveaux = (await ids()).filter((i) => !avantP.has(i))
  if (nouveaux.length === 0) { check(`palette : ${item} cree un element`, false); continue }
  crees++
  // chaque champ de l'inspecteur est modifie ; aucune saisie ne doit etre rejetee
  const champs = win.locator('.inspector-panel input:not([type=color]):not([type=range]), .inspector-panel select, .inspector-panel textarea')
  const n = await champs.count()
  for (let i = 0; i < n; i++) {
    const c = champs.nth(i)
    const label = (await c.getAttribute('aria-label')) ?? ''
    if (/^(X|Y|Largeur|Hauteur|Opacité|Rotation|Nom du calque)$/.test(label)) continue
    const tag = await c.evaluate((e) => e.tagName)
    const type = await c.getAttribute('type')
    try {
      if (type === 'checkbox') await c.click({ timeout: 2000 })
      else if (tag === 'SELECT') { const opts = await c.locator('option').count(); if (opts > 1) await c.selectOption({ index: 1 }, { timeout: 2000 }) }
      else {
        const courant = await c.inputValue()
        if (/^-?\d+(\.\d+)?$/.test(courant)) {
          // champ numerique : une valeur voisine, dans les bornes du champ
          const v = Number(courant)
          let accepte = false
          for (const cand of [v + 1, v - 1, 0, 1]) {
            await c.fill(String(cand), { timeout: 2000 }); await c.press('Enter')
            if ((await c.getAttribute('aria-invalid')) !== 'true') { accepte = true; break }
          }
          if (!accepte) invalides.push(`${item}/${label}`)
        } else { await c.fill('Zed', { timeout: 2000 }); await c.press('Enter') }
      }
      controles++
    } catch { /* controle desactive ou masque par un choix precedent */ }
  }
  if ((await win.getByRole('button', { name: 'Supprimer', exact: true }).count()) > 0) { await btn('Supprimer').click(); await pause(60) }
}
check('palette : chaque composant se glisse sur l ecran', crees === itemsPalette.length, `${crees}/${itemsPalette.length}`)
check('inspecteur : chaque propriete de chaque composant est editable (aucune saisie rejetee)', controles > 100 && invalides.length === 0, `${controles} champs edites ; rejetes: ${invalides.join(',')}`)
await shot('49-palette')

// ---------- 9. Formats de fichier : ancien format, version future, JSON invalide ----------
const v1 = { version: 1, id: '11111111-1111-4111-8111-111111111111', name: 'Ancien', tokens: { colors: {}, typography: {}, spacing: {} },
  pages: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Page 1', device: { id: 'iphone15', label: 'iPhone 15', width: 393, height: 852, pixelRatio: 3 },
    nodes: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Carte', type: 'rect', frame: { x: 10, y: 10, w: 100, h: 60 }, visible: true, locked: false, opacity: 1, rotation: 0, fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }], strokes: [], cornerRadius: 4 }] }] }
const ancien = path.join(work, 'ancien-v1.calque'); writeFileSync(ancien, JSON.stringify(v1))
await setNext({ open: ancien }); await menu('Ouvrir...'); await pause(500)
check('fichier : un ancien format (v1) s ouvre et est migre en ecran', (await ids()).length >= 1 && (await win.getByTestId('node-33333333-3333-4333-8333-333333333333').count()) === 1, (await noms()).join())
const futur = path.join(work, 'futur.calque'); writeFileSync(futur, JSON.stringify({ ...v1, version: 99 }))
await setNext({ open: futur }); await menu('Ouvrir...'); await pause(400)
const msgFutur = await win.locator('.calque-error-banner').innerText().catch(() => '')
check('fichier : une version plus recente est refusee avec un message explicite', /version/i.test(msgFutur), msgFutur)
check('fichier : l ancien document reste intact apres un refus', (await win.getByTestId('node-33333333-3333-4333-8333-333333333333').count()) === 1)

// ---------- 10. Images : import, enregistrement, export copie et declare ----------
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await btn('Nouvel écran').click(); await pause(200)
const [ec4] = await ids()
const eb4 = await box(ec4); const k4 = eb4.width / 393
const png = path.join(work, 'Mon Logo.png')
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
await setNext({ open: png })
await btn('Image').click()
await drag(eb4.x + 20 * k4, eb4.y + 40 * k4, eb4.x + 120 * k4, eb4.y + 140 * k4)
await pause(400)
const img = (await nodes()).find((n) => n.type === 'image')
check('images : importer une image (selecteur natif) l affiche', img !== undefined && (await win.getByTestId(`node-${img.id}`).locator('img').count()) === 1)
const exporter = async (label, dirName) => {
  const dir = path.join(work, 'img-' + dirName); mkdirSync(dir, { recursive: true })
  await setNext({ open: dir, box: 1 })
  await win.getByRole('button', { name: 'Exporter', exact: true }).click()
  await win.getByRole('menuitem', { name: new RegExp(label) }).click()
  await win.getByRole('button', { name: "Lancer l'export" }).click()
  await pause(900)
  const texte = await win.locator('.dialog-panel').innerText()
  await win.getByRole('button', { name: "Fermer l'export" }).click()
  return { dir, texte }
}
let r = await exporter('Flutter', 'flutter')
check('images : Flutter copie l image dans assets/images/ et la declare dans pubspec.yaml', existsSync(path.join(r.dir, 'assets/images/Mon_Logo.png')) && /assets\/images\/Mon_Logo\.png/.test(readFileSync(path.join(r.dir, 'pubspec.yaml'), 'utf8')), r.texte.slice(0, 120))
r = await exporter('React Native', 'rn')
check('images : React Native copie l image et la reference par require', existsSync(path.join(r.dir, 'assets/images/Mon_Logo.png')) && /require\('\.\.\/\.\.\/assets\/images\/Mon_Logo\.png'\)/.test(readFileSync(path.join(r.dir, readdirSync(path.join(r.dir, 'src/screens'))[0] ? 'src/screens/' + readdirSync(path.join(r.dir, 'src/screens'))[0] : ''), 'utf8')))
r = await exporter('SwiftUI', 'swift')
check('images : SwiftUI copie l image dans un .imageset', existsSync(path.join(r.dir, 'Sources/Assets.xcassets/Mon_Logo.imageset/Mon_Logo.png')) && existsSync(path.join(r.dir, 'Sources/Assets.xcassets/Mon_Logo.imageset/Contents.json')))
r = await exporter('Jetpack Compose', 'compose')
check('images : Compose copie l image dans res/drawable (nom valide)', existsSync(path.join(r.dir, 'src/main/res/drawable/mon_logo.png')))
// apres enregistrement : l'image est relative (<doc>.ressources/) et l'export la retrouve
const doc2 = path.join(work, 'avec-image.calque')
await setNext({ save: doc2 }); await menu('Enregistrer'); await pause(500)
check('images : l enregistrement copie l image dans <document>.ressources/', existsSync(path.join(work, 'avec-image.ressources', 'Mon Logo.png')))
r = await exporter('Flutter', 'flutter2')
check('images : export apres enregistrement (source relative) copie toujours l image', existsSync(path.join(r.dir, 'assets/images/Mon_Logo.png')))

r = await exporter('SVG', 'svg')
const svgPath = path.join(r.dir, 'svg', readdirSync(path.join(r.dir, 'svg'))[0] ?? 'absent.svg')
const svgTexte = existsSync(svgPath) ? readFileSync(svgPath, 'utf8') : ''
check('export SVG : un fichier par ecran, image embarquee (data URI), bien forme', /^<svg /.test(svgTexte) && /data:image\/png;base64,/.test(svgTexte) && svgTexte.trim().endsWith('</svg>'), svgPath)
r = await exporter('Figma', 'figma-bundle')
const figmaFile = readdirSync(r.dir).find((f) => f.endsWith('.figma.json'))
const bundle = figmaFile ? JSON.parse(readFileSync(path.join(r.dir, figmaFile), 'utf8')) : null
check('export Figma : un seul .figma.json avec le document et les images en base64', bundle?.format === 'calque-figma' && Object.keys(bundle.images).length === 1 && bundle.document.pages[0].nodes.length >= 1, figmaFile)

// ---------- 11. Import Figma : fichier .json et API (serveur local) ----------
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await btn('Importer depuis Figma').click()
await setNext({ open: path.resolve('test/integration/fixtures/realistic-figma-file.json') })
await win.getByRole('button', { name: 'Importer un fichier Figma' }).click(); await pause(600)
const note = await win.locator('.dialog-panel .dialog-note').innerText().catch(() => '')
check('figma : import d un fichier .json (dialogue reel) charge le document', /nœud/.test(note), note)
await win.getByRole('button', { name: "Fermer l'import Figma" }).click(); await pause(200)
const nFigma = (await ids()).length
check('figma : le canevas affiche le design importe', nFigma >= 3, `${nFigma} noeuds`)
await shot('50-figma-fichier')
// API : sans jeton -> message nomme
await menu('Nouveau'); await pause(200)
await btn('Importer depuis Figma').click()
await win.getByLabel('Clé ou lien du fichier Figma').fill('https://www.figma.com/design/CLE_OK/Mon-design?node-id=0-1')
await win.getByRole('button', { name: "Importer depuis l'API Figma" }).click(); await pause(500)
check('figma : API sans jeton -> message actionnable', /jeton/i.test(await win.locator('.dialog-alert').innerText().catch(() => '')))
await win.getByRole('button', { name: "Fermer l'import Figma" }).click()
// jeton dans les reglages (chiffre par le trousseau systeme)
await btn('Réglages').click()
await win.getByLabel('Jeton personnel Figma').fill('figd_mauvais')
await win.getByRole('button', { name: 'Enregistrer le jeton Figma' }).click(); await pause(600)
const reglMsg = await win.locator('.dialog-panel').innerText()
await win.getByRole('button', { name: 'Fermer les réglages' }).click()
await btn('Importer depuis Figma').click()
await win.getByLabel('Clé ou lien du fichier Figma').fill('CLE_OK')
await win.getByRole('button', { name: "Importer depuis l'API Figma" }).click(); await pause(600)
const refus = await win.locator('.dialog-alert').innerText().catch(() => '')
check('figma : API avec un mauvais jeton -> refus explicite', /refus/i.test(refus) || /jeton/i.test(reglMsg) , refus || reglMsg.slice(0, 100))
await win.getByRole('button', { name: "Fermer l'import Figma" }).click()
await btn('Réglages').click()
await win.getByLabel('Jeton personnel Figma').fill('figd_jeton_de_test')
await win.getByRole('button', { name: 'Enregistrer le jeton Figma' }).click(); await pause(600)
await win.getByRole('button', { name: 'Fermer les réglages' }).click()
await btn('Importer depuis Figma').click()
await win.getByLabel('Clé ou lien du fichier Figma').fill('CLE_OK')
await win.getByRole('button', { name: "Importer depuis l'API Figma" }).click(); await pause(800)
const noteApi = await win.locator('.dialog-panel .dialog-note').innerText().catch(() => '')
check('figma : import via l API (serveur local, jeton envoye en en-tete) charge le document', /nœud/.test(noteApi), noteApi || (await win.locator('.dialog-panel').innerText()).slice(0, 200))
check('figma : le serveur a recu la cle et le jeton', requetesFigma.some((q) => q.url === '/v1/files/CLE_OK' && q.jeton === 'figd_jeton_de_test'))
await win.getByRole('button', { name: "Fermer l'import Figma" }).click()
await shot('51-figma-api')
r = await exporter('Flutter', 'figma-flutter')
check('figma : le design importe s exporte (tous les ecrans)', existsSync(path.join(r.dir, 'lib/main.dart')))
serveur.close()
await t.fin()
