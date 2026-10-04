import { describe, expect, it } from 'vitest'
import { figmaApiBase } from '../src/main/adapters/figmaApiBase'

describe('figmaApiBase : le jeton ne part jamais vers un hote distant', () => {
  it('API publique par defaut', () => {
    expect(figmaApiBase({})).toBe('https://api.figma.com')
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: '' })).toBe('https://api.figma.com')
  })
  it('accepte un serveur local', () => {
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'http://127.0.0.1:4010/' })).toBe('http://127.0.0.1:4010')
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'http://localhost:9' })).toBe('http://localhost:9')
  })
  it('refuse tout hote distant ou invalide (retombe sur l API publique)', () => {
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'https://evil.example' })).toBe('https://api.figma.com')
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'http://127.0.0.1.evil.example' })).toBe('https://api.figma.com')
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'ftp://127.0.0.1' })).toBe('https://api.figma.com')
    expect(figmaApiBase({ MAQUIO_FIGMA_API_BASE: 'pas une url' })).toBe('https://api.figma.com')
  })
})
