import { describe, expect, it } from 'vitest'
import { resolveImageSrc } from '../src/renderer/canvas/imageSource'

describe('resolveImageSrc (defaut n3, comment mettre l image ?)', () => {
  it('rend null pour un src vide (aucune image choisie)', () => {
    expect(resolveImageSrc('', null)).toBeNull()
    expect(resolveImageSrc('', '/tmp/Mon document.calque')).toBeNull()
  })

  it('convertit un chemin absolu en URL file:// (document jamais enregistre)', () => {
    expect(resolveImageSrc('/Users/lilou/Images/photo.png', null)).toBe('file:///Users/lilou/Images/photo.png')
  })

  it('resout un chemin relatif par rapport a <nom-du-document>.ressources/', () => {
    const resolu = resolveImageSrc('photo.png', '/tmp/Mon document.calque')
    expect(resolu).toBe('file:///tmp/Mon%20document.ressources/photo.png')
  })

  it('ne resout pas un chemin relatif sans documentPath connu', () => {
    expect(resolveImageSrc('photo.png', null)).toBeNull()
  })

  it('laisse une URL distante (http/https) telle quelle', () => {
    expect(resolveImageSrc('https://example.com/avatar.png', null)).toBe('https://example.com/avatar.png')
  })
})
