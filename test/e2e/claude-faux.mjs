// Assistance Claude avec un FAUX binaire `claude` (scripts shell qui rejouent
// des reponses enregistrees ou echouent) : reponse valide, JSON illisible,
// patch invalide, echec du processus, delai, annulation en cours, binaire
// absent. Aucun appel reel, aucun cout. Le vrai binaire est masque (PATH).
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

const t = await lancer({ PATH: '/usr/bin:/bin', MAQUIO_CLAUDE_TIMEOUT_MS: '4000' })
const { win, work, check } = t
const pause = (ms = 200) => win.waitForTimeout(ms)
const btn = (name) => win.getByRole('button', { name, exact: true })

const script = (nom, corps) => { const p = path.join(work, nom); writeFileSync(p, `#!/bin/sh\n${corps}\n`); chmodSync(p, 0o755); return p }
const patch = { summary: 'Ajoute un texte', ops: [{ op: 'insertNode', parentId: null, node: { id: '99999999-9999-4999-8999-999999999999', name: 'Titre', type: 'text', frame: { x: 10, y: 10, w: 200, h: 30 }, visible: true, locked: false, opacity: 1, rotation: 0, characters: 'Bonjour', style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 20, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' } } }] }
const reponse = (obj) => JSON.stringify({ type: 'result', result: '```json\n' + JSON.stringify(obj) + '\n```' })
const pidFile = path.join(work, 'faux-pid')
const faux = {
  ok: script('claude-ok', `cat <<'EOF'\n${reponse(patch)}\nEOF`),
  illisible: script('claude-illisible', 'echo "pas du json du tout"'),
  patchInvalide: script('claude-patch', `cat <<'EOF'\n${reponse({ summary: 'x', ops: [{ op: 'insertNode', parentId: null, node: { type: 'rectangle', x: 1 } }] })}\nEOF`),
  echec: script('claude-echec', 'echo "quota depasse" >&2; exit 3'),
  lent: script('claude-lent', `echo $$ > '${pidFile}'; exec sleep 60`),
}

async function regler(chemin) {
  await btn('Réglages').click()
  await win.getByLabel('Chemin personnalisé vers le binaire claude').fill(chemin)
  await win.getByRole('button', { name: 'Enregistrer le chemin de Claude Code' }).click(); await pause(500)
  const texte = await win.locator('.dialog-panel').innerText()
  await win.getByRole('button', { name: 'Fermer les réglages' }).click(); await pause(200)
  return texte
}
async function demander(instruction) {
  await win.getByLabel('Instruction', { exact: true }).fill(instruction)
  await btn('Demander à Claude').click()
}
const issue = () => win.locator('.claude-panel-result, .claude-panel-alert').first()
const nNoeuds = () => win.evaluate(() => document.querySelectorAll('[data-testid^="node-"]').length)

// 0. binaire absent : message actionnable, saisie desactivee
check('claude absent : le panneau indique « non connecté »', await win.getByText('non connecté').isVisible())
check('claude absent : message actionnable + bouton vers les reglages', /introuvable/i.test(await win.locator('.claude-panel-alert').first().innerText()) && await win.getByRole('button', { name: 'Ouvrir les Réglages' }).isVisible())
check('claude absent : « Demander à Claude » est desactive', await btn('Demander à Claude').isDisabled())
const refus = await regler(path.join(work, 'n-existe-pas'))
check('reglages : un chemin inexistant est refuse avec sa raison', /introuvable|n'existe|inexistant|pas/i.test(refus), refus.replace(/\n/g, ' | ').slice(0, 160))

await btn('Nouvel écran').click(); await pause()

// 1. reponse valide rejouee
await regler(faux.ok)
check('reglages : un faux binaire valide est accepte (panneau « connecté »)', await win.getByText('connecté', { exact: true }).isVisible())
await demander('ajoute un titre')
await issue().waitFor({ timeout: 20000 })
check('claude (rejeu) : reponse valide appliquee au document', (await nNoeuds()) === 2 && /Ajoute un texte/.test(await issue().innerText()), await issue().innerText())
await win.getByRole('button', { name: 'Annuler', exact: true }).click(); await pause()
check('claude (rejeu) : annulable en un geste', (await nNoeuds()) === 1)

// 2. sortie illisible
await regler(faux.illisible)
await demander('x'); await issue().waitFor({ timeout: 20000 })
const m2 = await issue().innerText()
check('claude : sortie illisible -> message propre, document intact', /inexploitable/i.test(m2) && (await nNoeuds()) === 1, m2.slice(0, 120))
// 3. patch invalide
await regler(faux.patchInvalide)
await demander('x'); await issue().waitFor({ timeout: 20000 })
const m3 = await issue().innerText()
check('claude : patch invalide -> explication en francais, sans dump technique', /mal formé|invalide|inexploitable|rejet/i.test(m3) && !/"code"|invalid_type/.test(m3) && (await nNoeuds()) === 1, m3.slice(0, 160))
// 4. echec du processus
await regler(faux.echec)
await demander('x'); await issue().waitFor({ timeout: 20000 })
const m4 = await issue().innerText()
check('claude : echec du processus -> code de sortie et stderr affiches', /code de sortie 3/.test(m4) && /quota/.test(m4), m4.slice(0, 160))
// 5. delai
await regler(faux.lent)
await demander('x')
check('claude : pendant l attente, un bouton Annuler est propose', await win.getByRole('button', { name: 'Annuler', exact: true }).nth(1).isVisible().catch(() => false) || (await win.getByText('En attente de la réponse').isVisible()))
await issue().waitFor({ timeout: 30000 })
const m5 = await issue().innerText()
check('claude : delai depasse -> message de delai (processus tue)', /délai/i.test(m5), m5.slice(0, 160))
await pause(500)
const pid = Number(readFileSync(pidFile, 'utf8'))
let vivant = true; try { process.kill(pid, 0) } catch { vivant = false }
check('claude : le sous-processus est reellement tue apres le delai', !vivant, `pid ${pid}`)
// 6. annulation en cours
await demander('x')
await win.getByText('En attente de la réponse').waitFor()
await pause(500)
await win.locator('.claude-panel-loading').getByRole('button', { name: 'Annuler' }).click()
await issue().waitFor({ timeout: 10000 })
const m6 = await issue().innerText()
const pid2 = Number(readFileSync(pidFile, 'utf8'))
await pause(500)
let vivant2 = true; try { process.kill(pid2, 0) } catch { vivant2 = false }
check('claude : annuler en cours interrompt la demande (message) et tue le processus', /interrompue/i.test(m6) && !vivant2, `${m6.slice(0, 80)} pid ${pid2} vivant=${vivant2}`)
check('claude : le panneau est de nouveau utilisable apres l annulation', await btn('Demander à Claude').isEnabled())
// 7. pastille repliee
await regler(faux.ok)
await demander('x'); await win.getByRole('button', { name: 'Replier le panneau Claude' }).click()
await win.getByTestId('claude-badge').waitFor({ timeout: 20000 }) // pastille sur la bascule Claude de la barre d outils
await pause(600)
check('claude : panneau replie, la pastille de resultat s affiche a la fin', (await win.getByTestId('claude-badge').getAttribute('data-phase')) === 'done')
await t.fin()
