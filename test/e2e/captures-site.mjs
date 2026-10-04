// Captures soignees pour le site et le README. Profil isole (--user-data-dir
// temporaire), prototype fictif « nacre » et exemple « tous-les-composants »
// uniquement. THEME=dark|light, OUT=dossier de sortie.
// Aucun chemin local ne doit etre visible : les dialogues sont fermes avant
// chaque capture et les champs de chemin ne sont jamais affiches.
import { chmodSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { lancer } from './helpers.mjs'

const theme = process.env.THEME === 'light' ? 'light' : 'dark'
const t = await lancer({ PATH: '/usr/bin:/bin' }, { colorScheme: null })
const { win, app, work, setNext, menu, shot } = t
const pause = (ms = 250) => win.waitForTimeout(ms)
const btn = (name) => win.getByRole('button', { name, exact: true })
await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1440, 900); w.center() })
await menu(theme === 'dark' ? 'Thème sombre' : 'Thème clair'); await pause(500)

const ouvrir = async (nom) => {
  const copie = path.join(work, nom); copyFileSync(path.resolve('exemples', nom), copie)
  await setNext({ open: copie }); await menu('Ouvrir...'); await pause(1500)
  return JSON.parse(readFileSync(copie, 'utf8'))
}
const replier = async (doc) => { for (const e of doc.pages[0].nodes) { const b = win.getByTestId(`layer-toggle-${e.id}`); if (await b.count()) { if ((await b.getAttribute('aria-label'))?.startsWith('Replier')) await b.click() } } await pause(200) }

const banque = await ouvrir('banque.maquio')
// --- Claude (faux binaire, aucune requete)
const faux = path.join(work, 'claude-faux'); writeFileSync(faux, '#!/bin/sh\necho ok\n'); chmodSync(faux, 0o755)
await btn('Réglages').click()
await win.getByLabel('Chemin personnalisé vers le binaire claude').fill(faux)
await win.getByRole('button', { name: 'Enregistrer le chemin de Claude Code', exact: true }).click(); await pause(500)
await win.getByRole('button', { name: 'Fermer les réglages', exact: true }).click(); await pause(300)
await replier(banque)
await win.getByTestId(`layer-${banque.pages[0].nodes[2].id}`).click(); await pause(300)
await btn('Agrandir le zoom').click(); await btn('Agrandir le zoom').click(); await pause(400)
await shot(`hero-${theme}`)
await btn('Ajuster à la fenêtre').click(); await pause(300)
await btn('Afficher les liens').click(); await pause(500)
await shot(`liens-${theme}`)
await btn('Afficher les liens').click(); await pause(200)

await win.getByTestId(`layer-${banque.pages[0].nodes[0].id}`).click(); await pause(100)
await btn('Lancer le prototype').click(); await pause(900)
await shot(`proto-${theme}`)
await win.keyboard.press('Escape'); await pause(300)

// --- export 4 cibles
await setNext({ open: path.join(work, 'sortie'), box: 1 })
await btn('Exporter').click(); await pause(400)
await shot(`export-menu-${theme}`)
await win.getByRole('menuitem', { name: /Jetpack Compose/ }).click(); await pause(500)
await shot(`export-${theme}`)
await btn("Fermer l'export").click(); await pause(300)

// --- Figma
await btn('Importer depuis Figma').click(); await pause(500)
await shot(`figma-${theme}`)
await win.keyboard.press('Escape'); await pause(300)
if (await win.locator('.dialog-panel').count()) { const f = win.getByRole('button', { name: /Fermer/ }).first(); if (await f.count()) await f.click(); await pause(300) }

// --- Claude : instruction saisie (rien n'est envoye)
await win.getByTestId(`layer-${banque.pages[0].nodes[2].id}`).click(); await pause(200)
await win.getByLabel('Instruction', { exact: true }).fill('Traduis cet écran en anglais et passe le bouton principal en bleu nacre.')
await pause(300)
await shot(`claude-${theme}`)

// --- panneaux repliables : gauche puis Claude replies, canevas agrandi
await btn('Replier le panneau de gauche').click(); await pause(400)
await shot(`panneaux-gauche-${theme}`)
await btn('Replier le panneau Claude').click(); await pause(400)
await shot(`panneaux-replies-${theme}`)
await win.getByTestId('toggle-left').click(); await win.getByTestId('toggle-claude').click(); await pause(400)

// --- composants
await setNext({ box: 1 }); await menu('Nouveau'); await pause(300)
const comp = await ouvrir('tous-les-composants.maquio')
await replier(comp)
await win.getByTestId(`layer-${comp.pages[0].nodes[0].id}`).click(); await pause(300)
await shot(`composants-ecran-${theme}`)
await win.getByRole('tab', { name: 'Composants', exact: true }).click(); await pause(400)
await shot(`composants-${theme}`)
await t.fin()
