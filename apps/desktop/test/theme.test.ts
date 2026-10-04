import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createThemeStore } from '../src/main/adapters/themeStore'
import { isThemePreference, windowBackground, WINDOW_BACKGROUND } from '../src/shared/theme'

describe('preference de theme (main)', () => {
  const fsFactice = (initial?: string) => {
    let contenu = initial
    return {
      readFile: async () => {
        if (contenu === undefined) throw new Error('ENOENT')
        return contenu
      },
      writeFile: async (_p: string, d: string) => {
        contenu = d
      },
    }
  }
  it('systeme par defaut (fichier absent, illisible ou valeur inconnue)', async () => {
    expect(await createThemeStore({ filePath: '/x', fs: fsFactice() }).get()).toBe('system')
    expect(await createThemeStore({ filePath: '/x', fs: fsFactice('pas du json') }).get()).toBe('system')
    expect(await createThemeStore({ filePath: '/x', fs: fsFactice('{"theme":"violet"}') }).get()).toBe('system')
  })
  it('memorise clair et sombre, relit la meme chose, refuse une valeur inconnue', async () => {
    const fs = fsFactice()
    const store = createThemeStore({ filePath: '/x', fs })
    await store.set('light')
    expect(await createThemeStore({ filePath: '/x', fs }).get()).toBe('light')
    await store.set('dark')
    expect(await store.get()).toBe('dark')
    await expect(store.set('rose' as never)).rejects.toThrow()
  })
  it('isThemePreference', () => {
    expect(isThemePreference('system') && isThemePreference('light') && isThemePreference('dark')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(undefined)).toBe(false)
  })
  it('fond de fenetre aligne sur le theme (pas de flash) : explicite ou suivant le systeme', () => {
    expect(windowBackground(true, 'light')).toBe(WINDOW_BACKGROUND.light)
    expect(windowBackground(false, 'dark')).toBe(WINDOW_BACKGROUND.dark)
    expect(windowBackground(true, 'system')).toBe(WINDOW_BACKGROUND.dark)
    expect(windowBackground(false, 'system')).toBe(WINDOW_BACKGROUND.light)
  })
})

// --- Jetons : valeurs de theme.css, contrastes WCAG, absence de couleur codee en dur ---
const css = readFileSync(resolve(__dirname, '../src/renderer/theme.css'), 'utf8')
const bloc = (re: RegExp) => re.exec(css)![1]!
const dark = bloc(/:root \{([\s\S]*?)\n\}\n\n@media/)
const light = bloc(/@media \(prefers-color-scheme: light\) \{\s*:root \{([\s\S]*?)\n {2}\}\n\}/)
const tokens = (b: string) => Object.fromEntries([...b.matchAll(/--maquio-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]))
const T = { dark: { ...tokens(dark) }, light: { ...tokens(dark), ...tokens(light) } }

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
const contraste = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe.each(['dark', 'light'] as const)('contrastes WCAG AA du theme %s', (theme) => {
  const t = T[theme]
  const fonds = ['chrome-bg', 'panel-raised', 'surface']
  it('les textes atteignent 4,5:1 sur chaque fond du chrome', () => {
    for (const texte of ['text', 'text-soft', 'text-muted', 'text-faint', 'accent-text', 'danger', 'success', 'warning'])
      for (const fond of fonds) expect(contraste(t[texte]!, t[fond]!), `${texte} sur ${fond}`).toBeGreaterThanOrEqual(4.5)
  })
  it('le texte des boutons d accent (encre) atteint 4,5:1 sur le corail, y compris au survol', () => {
    expect(contraste(t['on-accent']!, t['accent']!)).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t['on-accent']!, t['accent-hover']!)).toBeGreaterThanOrEqual(4.5)
  })
  it('le texte d une banniere d erreur atteint 4,5:1', () => {
    expect(contraste(t['banner-text']!, t['banner-bg']!)).toBeGreaterThanOrEqual(4.5)
  })
  it('les bordures restent distinctes du fond (3:1 pour les bordures fortes)', () => {
    expect(contraste(t['border-strong']!, t['chrome-bg']!)).toBeGreaterThan(1.2)
  })
})

describe('themes : palette de marque et canevas constant', () => {
  it('encre, papier, corail et gris de la marque', () => {
    expect(T.dark['chrome-bg']).toBe('#16131f')
    expect(T.light['chrome-bg']).toBe('#f4efe6')
    expect(T.dark['accent']).toBe('#ff5a36')
    expect(T.light['accent']).toBe('#ff5a36')
    expect(T.light['text-muted']).toBe('#5b546e')
  })
  it('l accent en texte est fonce sur fond clair (le corail brut n atteint pas 4,5:1 sur le papier)', () => {
    expect(contraste('#ff5a36', T.light['chrome-bg']!)).toBeLessThan(4.5)
    expect(T.light['accent-text']).not.toBe(T.light['accent'])
  })
  it('le canevas a ses propres jetons, jamais redefinis par le theme clair', () => {
    expect(tokens(light)['canvas-bg']).toBeUndefined()
    expect(T.light['canvas-bg']).toBe(T.dark['canvas-bg'])
  })
  it('chaque jeton du theme sombre existe dans le theme clair (ou est volontairement constant)', () => {
    const constants = /^(canvas-|font|titlebar|toolbar|layers|right|radius)/
    for (const nom of Object.keys(tokens(dark))) if (!constants.test(nom)) expect(tokens(light)[nom], nom).toBeDefined()
  })
})

describe('aucune couleur codee en dur dans le chrome', () => {
  const racine = resolve(__dirname, '../src/renderer')
  const fichiers: string[] = []
  const parcourir = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = resolve(d, e)
      if (statSync(p).isDirectory()) parcourir(p)
      else if (p.endsWith('.css')) fichiers.push(p)
    }
  }
  parcourir(racine)
  // Rendu du DOCUMENT (canevas, ecrans, lecteur de prototype) : exempte du theme.
  const exempts = ['/theme.css', '/canvas/', '/prototype/']
  it('les .css du chrome ne contiennent que des variables (--maquio-*)', () => {
    for (const f of fichiers.filter((p) => !exempts.some((x) => p.includes(x)))) {
      const bruts = [...readFileSync(f, 'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0])
      expect(bruts, f.replace(racine, '')).toEqual([])
    }
  })
})
