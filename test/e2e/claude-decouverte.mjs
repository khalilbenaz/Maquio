// Application lancee comme depuis le Finder : PATH minimal, aucun alias, aucun
// shell configure. Un faux `claude` est pose dans un emplacement connu
// (~/.local/bin d'un HOME temporaire) : la decouverte doit le trouver, et le
// panneau Claude passe a « connecté » sans aucun reglage.
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { lancer } from './helpers.mjs'

const home = mkdtempSync(path.join(tmpdir(), 'maquio-home-'))
mkdirSync(path.join(home, '.local', 'bin'), { recursive: true })
const faux = path.join(home, '.local', 'bin', 'claude')
writeFileSync(faux, '#!/bin/sh\n[ "$1" = "--version" ] && { echo "9.9.9 (faux)"; exit 0; }\nexit 1\n')
chmodSync(faux, 0o755)

const t = await lancer({ HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SHELL: '/bin/sh', MAQUIO_CLAUDE_DISCOVERY: 'on' })
const { win, check } = t
await win.waitForTimeout(1500)
check('decouverte : le panneau Claude est « connecté » avec un PATH minimal', await win.getByText('connecté', { exact: true }).isVisible())
const chemin = await win.evaluate(async () => (await window.maquio.getSettings()).claudePath)
check('decouverte : le binaire est celui de ~/.local/bin (emplacement connu)', chemin === faux, String(chemin).replace(home, '~'))
await t.fin()
