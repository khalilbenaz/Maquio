import { copyFileSync, mkdirSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
copyFileSync('ui.html', 'dist/ui.html')
console.log('dist/ui.html copie')
