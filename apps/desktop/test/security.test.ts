import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildContentSecurityPolicy } from '../src/shared/csp'
import { installNavigationGuards, isAllowedNavigation } from '../src/main/security'

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')

describe('politique CSP du renderer (audit P1)', () => {
  const csp = buildContentSecurityPolicy({ dev: false })

  it('interdit tout script hors de l application, objets, base et formulaires', () => {
    expect(csp).toContain("default-src 'self'")
    expect(csp).toMatch(/script-src 'self'(;|$)/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
  })

  it('n autorise les images que depuis l application, file:, data: et https explicite', () => {
    expect(csp).toMatch(/img-src 'self' file: data: https:/)
    expect(csp).not.toMatch(/img-src[^;]*http:(?!s)/)
  })

  it('interdit toute requete reseau depuis le renderer (le reseau passe par le main)', () => {
    expect(csp).toContain("connect-src 'none'")
  })

  it('index.html porte exactement cette politique dans une balise meta', () => {
    const escaped = csp.replace(/&/g, '&amp;')
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain(`content="${escaped}"`)
  })

  it('la variante dev n ouvre que le serveur local de Vite', () => {
    const dev = buildContentSecurityPolicy({ dev: true })
    expect(dev).toContain('ws://localhost:5173')
  })
})

describe('navigation (audit P1)', () => {
  it('autorise le fichier du renderer et le serveur de dev, rien d autre', () => {
    expect(isAllowedNavigation('file:///app/dist/renderer/index.html', null)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5173/', 'http://localhost:5173')).toBe(true)
    expect(isAllowedNavigation('https://evil.example/', null)).toBe(false)
    expect(isAllowedNavigation('http://localhost:5173/', null)).toBe(false)
    expect(isAllowedNavigation('file:///etc/passwd', null)).toBe(false)
    expect(isAllowedNavigation('not a url', null)).toBe(false)
  })

  it('refuse l ouverture de fenetres et bloque will-navigate vers l exterieur', () => {
    let openHandler: ((d: { url: string }) => { action: string }) | undefined
    const listeners: Record<string, (e: { preventDefault: () => void }, url: string) => void> = {}
    const contents = {
      setWindowOpenHandler: (h: typeof openHandler) => { openHandler = h },
      on: (name: string, l: (e: { preventDefault: () => void }, url: string) => void) => { listeners[name] = l },
    }
    installNavigationGuards(contents as never, null)
    expect(openHandler!({ url: 'https://evil.example' })).toEqual({ action: 'deny' })
    const bloque = { preventDefault: vi.fn() }
    listeners['will-navigate']!(bloque, 'https://evil.example')
    expect(bloque.preventDefault).toHaveBeenCalled()
    const ok = { preventDefault: vi.fn() }
    listeners['will-navigate']!(ok, 'file:///app/dist/renderer/index.html')
    expect(ok.preventDefault).not.toHaveBeenCalled()
  })
})

describe('fenetre principale', () => {
  it('installe les gardes de navigation', () => {
    const src = readFileSync(resolve(__dirname, '../src/main/window.ts'), 'utf8')
    expect(src).toContain('installNavigationGuards(fenetre.webContents')
  })
})
