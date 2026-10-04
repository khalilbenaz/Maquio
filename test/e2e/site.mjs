// Verifie la page `site/` (GitHub Pages) : serveur statique local, bureau et
// mobile 375 px (pas de defilement horizontal), aucune erreur console, images
// avec alt, themes clair et sombre. API GitHub simulee. Captures dans OUT.
import http from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const racine = path.resolve('site')
const out = process.env.OUT ?? path.resolve('site-captures')
mkdirSync(out, { recursive: true })
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' }
const serveur = http.createServer((req, res) => {
  const p = path.join(racine, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'))
  if (!p.startsWith(racine) || !existsSync(p)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p))
})
await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${serveur.address().port}/`
const release = [{ tag_name: 'v1.0.0', assets: ['Maquio-1.0.0-mac-universal.dmg', 'Maquio-1.0.0-mac-universal.zip', 'Maquio-1.0.0-win-x64.exe', 'Maquio-1.0.0-win-arm64.exe', 'Maquio-1.0.0-linux-x86_64.AppImage', 'Maquio-1.0.0-linux-amd64.deb'].map((name) => ({ name, browser_download_url: `https://github.com/khalilbenaz/Maquio/releases/download/v1.0.0/${name}` })) }]

const navigateur = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
let ko = 0
const check = (nom, ok, d = '') => { if (!ok) ko++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${nom} ${d}`) }
for (const [nom, viewport, scheme, ua] of [
  ['bureau-clair', { width: 1440, height: 900 }, 'light', undefined],
  ['bureau-sombre', { width: 1440, height: 900 }, 'dark', undefined],
  ['mobile-clair', { width: 375, height: 800 }, 'light', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
  ['mobile-sombre', { width: 375, height: 800 }, 'dark', undefined],
]) {
  const ctx = await navigateur.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1, ...(ua ? { userAgent: ua } : {}) })
  const page = await ctx.newPage()
  const erreurs = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(m.text()) })
  page.on('pageerror', (e) => erreurs.push(String(e)))
  page.on('requestfailed', (r) => erreurs.push(`requete echouee ${r.url()}`))
  await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(release) }))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  check(`${nom} : aucune erreur console`, erreurs.length === 0, erreurs.join(' | '))
  const large = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(`${nom} : pas de defilement horizontal`, large <= 0, `${large}px`)
  const sansAlt = await page.evaluate(() => [...document.images].filter((i) => !i.hasAttribute('alt')).length)
  check(`${nom} : toutes les images ont un alt`, sansAlt === 0)
  const bouton = await page.locator('#dl-main').evaluate((a) => ({ t: a.textContent, h: a.href }))
  check(`${nom} : bouton de telechargement`, /Télécharger/.test(bouton.t) && bouton.h.includes('github.com/khalilbenaz/Maquio/releases'), `${bouton.t} -> ${bouton.h}`)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  check(`${nom} : theme`, bg === (scheme === 'dark' ? 'rgb(22, 19, 31)' : 'rgb(244, 239, 230)'), bg)
  const poids = await page.evaluate(() => performance.getEntriesByType('resource').reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0))
  console.log(`     poids charge : ${(poids / 1e6).toFixed(2)} Mo`)
  await page.screenshot({ path: path.join(out, `${nom}.png`), fullPage: nom.startsWith('bureau') })
  if (nom === 'bureau-clair') {
    await page.screenshot({ path: path.join(out, 'bureau-clair-haut.png') })
    await page.keyboard.press('Tab')
    check('focus visible : lien d evitement', await page.evaluate(() => document.activeElement?.className === 'skip' && getComputedStyle(document.activeElement).top !== '-60px'))
  }
  await ctx.close()
}
// Sans simulation : l'API reelle repond 200 [] avant la premiere release ; la page reste saine.
await navigateur.close(); serveur.close()
process.exit(ko === 0 ? 0 : 1)
