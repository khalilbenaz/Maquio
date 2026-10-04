// Rend un SVG en PNG avec le moteur de rendu d'Electron (Chromium) : aucun
// outil externe. Le rendu passe par un <canvas> (couleurs exactes, fond
// transparent conserve) et non par une capture de fenetre.
// Usage : npx electron scripts/render-svg.cjs <entree.svg> <sortie-sans-extension> <taille>...
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')

const [svgPath, outBase, ...sizes] = process.argv.slice(2)
if (!svgPath || !outBase || sizes.length === 0) {
  console.error('usage : electron scripts/render-svg.cjs <entree.svg> <sortie-sans-extension> <taille>...')
  process.exit(2)
}
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const svg = readFileSync(svgPath, 'utf8')
  const win = new BrowserWindow({ show: false, width: 400, height: 400 })
  await win.loadURL('data:text/html,<html><body></body></html>')
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  for (const s of sizes) {
    const size = Number(s)
    const png = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = c.height = ${size}
        const ctx = c.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, ${size}, ${size})
        resolve(c.toDataURL('image/png').split(',')[1])
      }
      img.onerror = () => reject(new Error('SVG illisible'))
      img.src = ${JSON.stringify(dataUri)}
    })`)
    writeFileSync(`${outBase}-${size}.png`, Buffer.from(png, 'base64'))
  }
  app.quit()
})
