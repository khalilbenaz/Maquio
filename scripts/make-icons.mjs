// Genere toutes les icones de Maquio depuis le SVG maitre (assets/brand/maquio-icon.svg) :
//   apps/desktop/build/icon.icns   macOS (toutes tailles, 16 a 1024) via iconutil
//   apps/desktop/build/icon.ico    Windows (16, 24, 32, 48, 64, 256) via ImageMagick
//   apps/desktop/build/icon.png    Linux (512)
//   apps/desktop/public/favicon.png + icon.png (icone de fenetre, favicon)
//   apps/figma-plugin/assets/icon.png (128)
// Prerequis : electron (dependance du depot), iconutil (macOS), magick (ImageMagick).
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const svg = 'assets/brand/maquio-icon.svg'
const work = mkdtempSync(join(tmpdir(), 'maquio-icons-'))
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
execFileSync('npx', ['electron', 'scripts/render-svg.cjs', svg, join(work, 'i'), ...sizes.map(String)], { stdio: ['ignore', 'ignore', 'ignore'] })
const png = (n) => join(work, `i-${n}.png`)

mkdirSync('apps/desktop/build', { recursive: true })
mkdirSync('apps/desktop/public', { recursive: true })
mkdirSync('apps/figma-plugin/assets', { recursive: true })

// macOS : iconset -> icns
const iconset = join(work, 'icon.iconset')
mkdirSync(iconset)
for (const base of [16, 32, 128, 256, 512]) {
  copyFileSync(png(base), join(iconset, `icon_${base}x${base}.png`))
  copyFileSync(png(base * 2), join(iconset, `icon_${base}x${base}@2x.png`))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', 'apps/desktop/build/icon.icns'])

// Windows : .ico multi-tailles
execFileSync('magick', [png(16), png(24), png(32), png(48), png(64), png(256), 'apps/desktop/build/icon.ico'])

// Linux, fenetre, favicon, plugin Figma
copyFileSync(png(512), 'apps/desktop/build/icon.png')
copyFileSync(png(512), 'apps/desktop/public/icon.png')
copyFileSync(png(64), 'apps/desktop/public/favicon.png')
copyFileSync(png(128), 'apps/figma-plugin/assets/icon.png')
copyFileSync(png(1024), 'assets/brand/maquio-icon-1024.png')
rmSync(work, { recursive: true, force: true })
console.log('icones generees')
