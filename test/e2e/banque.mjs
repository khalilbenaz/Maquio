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
const ecran = (nom) => ecrans.find((e) => e.name === nom)
const walk = (n, f) => { f(n); (n.children ?? []).forEach((c) => walk(c, f)) }
const idOf = (nomEcran, nomNoeud) => { let r; walk(ecran(nomEcran), (n) => { if (!r && n.name === nomNoeud) r = n.id }); if (!r) throw new Error(`introuvable : ${nomEcran} / ${nomNoeud}`); return r }

// --- ouverture
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(900)
const presents = await win.evaluate((ids) => ids.filter((id) => document.querySelector(`[data-testid="layer-${id}"]`)).length, ecrans.map((e) => e.id))
check('banque : s ouvre avec ses ecrans (calques)', presents === ecrans.length && ecrans.length >= 20, `${presents}/${ecrans.length}`)
await shot('90-banque-canvas')

// --- modification + enregistrement + reouverture
await win.getByTestId(`layer-${idOf('Splash', 'Nom')}`).click(); await pause(100)
const x = win.getByLabel('X', { exact: true }); await x.fill('10'); await x.press('Enter'); await pause(150)
await setNext({ save: copie }); await menu('Enregistrer'); await pause(500)
const relu = JSON.parse(readFileSync(copie, 'utf8'))
let nomX; walk(relu.pages[0].nodes.find((e) => e.name === 'Splash'), (n) => { if (n.name === 'Nom') nomX = n.frame.x })
check('banque : modifiable et enregistrable (x du texte persiste)', nomX === 10, String(nomX))
await setNext({ box: 1 }); await menu('Nouveau'); await pause(250)
await setNext({ open: copie }); await menu('Ouvrir...'); await pause(800)

// --- parcours en mode prototype
const proto = () => win.getByTestId('proto-stage')
const courant = () => win.getByTestId('proto-current').innerText()
const tap = async (nomEcran, nomNoeud, frac) => {
  const b = await win.getByTestId(`proto-node-${idOf(nomEcran, nomNoeud)}`).boundingBox()
  const px = frac === undefined ? b.x + b.width / 2 : b.x + b.width * frac
  await win.mouse.click(px, b.y + b.height / 2)
  await pause(650)
}
const vers = async (nom, label) => check(`parcours : ${label}`, (await courant()) === nom, await courant())

await win.getByTestId(`layer-${ecran('Splash').id}`).click(); await pause(100)
await win.getByRole('button', { name: 'Lancer le prototype', exact: true }).click(); await pause(400)
await shot('91-splash')
await pause(2600)
await vers('Onboarding 1', 'le splash passe seul a l onboarding apres 2 s (fondu)')
await shot('92-onboarding1')
await tap('Onboarding 1', 'Bouton Suivant'); await vers('Onboarding 2', 'Suivant -> onboarding 2 (glissement)')
await tap('Onboarding 2', 'Bouton Commencer'); await vers('Connexion', 'Commencer -> connexion')
await shot('93-connexion')
await tap('Connexion', 'Bouton Mot de passe oublié ?')
check('parcours : « mot de passe oublié » ouvre la feuille basse', (await win.getByTestId(`proto-node-${idOf('Connexion', 'Mot de passe oublié')}`).count()) === 1)
await shot('94-feuille-oubli')
await tap('Connexion', 'Bouton Fermer')
check('parcours : « Fermer » referme la feuille', (await win.getByTestId(`proto-node-${idOf('Connexion', 'Mot de passe oublié')}`).count()) === 0)
await tap('Connexion', 'Bouton Se connecter'); await vers('PIN', 'Se connecter -> PIN (modale)')
await shot('95-pin')
await tap('PIN', 'Touche ✓'); await vers('Accueil', 'PIN valide -> accueil')
await shot('96-accueil')
await tap('Accueil', 'Raccourci Virement'); await vers('Virement 1 · Bénéficiaire', 'raccourci Virement')
await tap('Virement 1 · Bénéficiaire', 'Ligne Camille Exemple'); await vers('Virement 2 · Montant', 'bénéficiaire choisi -> montant')
await shot('97-virement-montant')
await tap('Virement 2 · Montant', 'Bouton Continuer'); await vers('Virement 3 · Récapitulatif', 'montant -> récapitulatif')
await tap('Virement 3 · Récapitulatif', 'Bouton Confirmer le virement')
check('parcours : « Confirmer » ouvre le dialogue OTP', (await win.getByTestId(`proto-node-${idOf('Virement 3 · Récapitulatif', 'Confirmation OTP')}`).count()) === 1)
await shot('98-otp')
await tap('Virement 3 · Récapitulatif', 'Confirmation OTP'); await vers('Virement 4 · Succès', 'OTP valide -> succès')
await shot('99-succes')
await tap('Virement 4 · Succès', 'Bouton Retour à l’accueil'); await vers('Accueil', 'retour à l accueil')
await tap('Accueil', 'Navigation basse', 0.7); await vers('Cartes', 'barre basse -> Cartes')
await shot('9a-cartes')
await tap('Cartes', 'Verrouiller')
check('parcours : le Switch « verrouiller » ouvre le dialogue de blocage', (await win.getByTestId(`proto-node-${idOf('Cartes', 'Confirmer le blocage')}`).count()) === 1)
await shot('9b-blocage')
await tap('Cartes', 'Confirmer le blocage')
await tap('Cartes', 'Bouton Afficher le PIN')
check('parcours : « Afficher le PIN » ouvre la feuille basse', (await win.getByTestId(`proto-node-${idOf('Cartes', 'PIN de la carte')}`).count()) === 1)
await shot('9c-pin-carte')
await tap('Cartes', 'Bouton Masquer')
await tap('Cartes', 'Navigation basse', 0.9); await vers('Profil', 'barre basse -> Profil')
await shot('9d-profil')
await tap('Profil', 'Bouton Déconnexion')
check('parcours : « Déconnexion » ouvre le dialogue', (await win.getByTestId(`proto-node-${idOf('Profil', 'Confirmer la déconnexion')}`).count()) === 1)
await shot('9e-deconnexion')
await tap('Profil', 'Confirmer la déconnexion'); await vers('Connexion', 'déconnexion confirmée -> connexion')
await shot('9f-retour-connexion')
await win.keyboard.press('Escape'); await pause(300)
await t.fin()
