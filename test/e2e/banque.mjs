// Acceptation du prototype bancaire (exemples/banque.maquio) : ouverture,
// modification, enregistrement, puis parcours COMPLET en mode prototype
// (connexion -> accueil -> virement avec OTP -> cartes -> profil -> deconnexion),
// avec captures. Le fichier d'exemple est copie : jamais modifie.
import { copyFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

const t = await lancer()
const { win, work, check, shot, setNext, menu, out } = t
const pause = (ms = 150) => win.waitForTimeout(ms)
const copie = path.join(work, 'banque.maquio')
copyFileSync(path.resolve('exemples/banque.maquio'), copie)
const doc = JSON.parse(readFileSync(copie, 'utf8'))
const ecrans = doc.pages[0].nodes
const ecran = (nom) => ecrans.find((e) => e.name.endsWith(nom))
const walk = (n, f) => { f(n); (n.children ?? []).forEach((c) => walk(c, f)) }
const idOf = (nomEcran, nomNoeud) => { let r; walk(ecran(nomEcran), (n) => { if (!r && n.name === nomNoeud) r = n.id }); if (!r) throw new Error(`introuvable : ${nomEcran} / ${nomNoeud}`); return r }

// --- ouverture
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(1500)
const presents = await win.evaluate((ids) => ids.filter((id) => document.querySelector(`[data-testid="layer-${id}"]`)).length, ecrans.map((e) => e.id))
check('banque : s ouvre avec ses 16 ecrans et la barre d onglets (calques)', presents === ecrans.length && ecrans.length === 17, `${presents}/${ecrans.length}`)
await shot('90-banque-canvas')

// --- modification + enregistrement + reouverture
await win.getByTestId(`layer-${idOf('Bienvenue', 'Ouvrir un compte')}`).click(); await pause(100)
const x = win.getByLabel('X', { exact: true }); await x.fill('30'); await x.press('Enter'); await pause(150)
await setNext({ save: copie }); await menu('Enregistrer'); await pause(500)
const relu = JSON.parse(readFileSync(copie, 'utf8'))
let bx; walk(relu.pages[0].nodes.find((e) => e.name.endsWith('Bienvenue')), (n) => { if (bx === undefined && n.name === 'Ouvrir un compte') bx = n.frame.x })
check('banque : modifiable et enregistrable (x du bouton persiste)', bx === 30, String(bx))
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(1200)

// --- parcours en mode prototype
const proto = () => win.getByTestId('proto-stage')
const courant = () => win.getByTestId('proto-current').innerText()
const tap = async (nomEcran, nomNoeud, frac, attente = 700) => {
  const b = await win.getByTestId(`proto-node-${idOf(nomEcran, nomNoeud)}`).boundingBox()
  const px = frac === undefined ? b.x + b.width / 2 : b.x + b.width * frac
  await win.mouse.click(px, b.y + b.height / 2)
  await pause(attente)
}
const vers = async (nom, label) => check(`parcours : ${label}`, (await courant()).endsWith(nom), await courant())

await win.getByTestId(`layer-${ecran('Bienvenue').id}`).click(); await pause(100)
await win.getByRole('button', { name: 'Lancer le prototype', exact: true }).click(); await pause(400)
await shot('91-bienvenue')
await tap('Bienvenue', 'Ouvrir un compte'); await vers('Code d’accès', 'Bienvenue -> code d accès (fondu)')
await shot('92-code')
await tap('Code d’accès', 'Reconnaissance faciale'); await vers('Accueil', 'reconnaissance faciale -> accueil')
await shot('93-accueil')
await tap('Accueil', 'Envoyer'); await vers('Paiements · à qui ?', 'action Envoyer -> paiements')
await tap('Paiements · à qui ?', 'Virement'); await vers('Montant', 'mode Virement -> montant')
await shot('94-montant')
await tap('Montant', 'Bouton Continuer'); await vers('Vérifier et confirmer', 'Continuer -> récapitulatif (modale)')
await shot('95-recap-otp')
await tap('Vérifier et confirmer', 'Bouton Envoyer 45,00 €'); await vers('Virement envoyé', 'Envoyer -> succès (fondu)')
await shot('96-succes')
await tap('Virement envoyé', 'Terminé'); await vers('Accueil', 'Terminé -> accueil')
await tap('Accueil', 'Barre d’onglets', 0.5, 30); await vers('Cartes', 'barre d onglets -> Cartes, immediat (sans animation)')
check('parcours : la barre d onglets ne joue aucune animation', (await proto().getAttribute('data-animating')) === 'false' && (await win.locator('[data-testid^="proto-screen-"]').count()) === 1)
await shot('97-cartes')
await tap('Cartes', 'Barre d’onglets', 0.9); await vers('Profil et sécurité', 'barre d onglets -> Profil')
await shot('98-profil')
await tap('Profil et sécurité', 'Se déconnecter'); await vers('Bienvenue', 'déconnexion -> bienvenue (fondu)')
await win.keyboard.press('Escape'); await pause(300)
await t.fin()
