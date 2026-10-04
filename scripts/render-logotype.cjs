// Bandeau du README : icone + logotype « maquio » (Bricolage Grotesque 800,
// minuscules) + accroche, sur le papier de la marque. Rendu par un <canvas>
// d'Electron avec la police embarquee (@fontsource) : aucun outil externe.
// Usage : npx electron scripts/render-logotype.cjs <sortie.png>
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const out = process.argv[2]
if (!out) {
  console.error('usage : electron scripts/render-logotype.cjs <sortie.png>')
  process.exit(2)
}
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const font = readFileSync(join(__dirname, '..', 'node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2')).toString('base64')
  const icon = readFileSync(join(__dirname, '..', 'assets/brand/maquio-icon.svg')).toString('base64')
  const win = new BrowserWindow({ show: false, width: 400, height: 400 })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const png = await win.webContents.executeJavaScript(`(async () => {
    const face = new FontFace('Bricolage Grotesque', 'url(data:font/woff2;base64,${font})', { weight: '800' })
    await face.load(); document.fonts.add(face)
    const img = new Image()
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;base64,${icon}' })
    const W = 1400, H = 380
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    x.fillStyle = '#F4EFE6'; x.beginPath(); x.roundRect(0, 0, W, H, 48); x.fill()
    x.drawImage(img, 90, 70, 240, 240)
    x.fillStyle = '#16131F'; x.textBaseline = 'alphabetic'
    x.font = '800 190px "Bricolage Grotesque"'
    x.fillText('maquio', 380, 215)
    x.fillStyle = '#5B546E'; x.font = '800 44px "Bricolage Grotesque"'
    x.fillText('De la maquette au code natif.', 386, 292)
    return c.toDataURL('image/png').split(',')[1]
  })()`)
  writeFileSync(out, Buffer.from(png, 'base64'))
  app.quit()
})
