import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_CHANNELS } from '../src/shared/api'

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('frontiere preload', () => {
  it('le preload expose exactement les canaux declares', () => {
    const src = lire('src/preload/preload.ts')
    for (const c of API_CHANNELS) expect(src).toContain(`'${c}'`)
  })

  it('le main enregistre un handler par canal', () => {
    const src = lire('src/main/main.ts')
    for (const c of API_CHANNELS) expect(src).toMatch(new RegExp(`\\bhandle\\(\\s*'${c}'`))
  })

  it('aucun canal n est enregistre en contournant le controle de l appelant (senderFrame)', () => {
    const src = lire('src/main/main.ts')
    expect(src.match(/ipcMain\.handle\(/g)).toHaveLength(1) // uniquement dans handle()
    expect(src).toContain('isTrustedSender(event')
  })

  it('la fenetre est creee avec l isolation de contexte et sans integration node', () => {
    const src = lire('src/main/window.ts')
    expect(src).toContain('contextIsolation: true')
    expect(src).toContain('nodeIntegration: false')
    expect(src).toContain('sandbox: true')
  })

  it('le renderer n importe jamais electron', () => {
    const src = lire('src/renderer/App.tsx') + lire('src/renderer/main.tsx')
    expect(src).not.toMatch(/from ['"]electron['"]/)
  })
})
