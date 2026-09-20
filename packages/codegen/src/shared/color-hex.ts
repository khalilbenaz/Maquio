// Conversion Color -> composantes 0..255 et hexadecimal ARGB majuscule,
// partagee par Flutter (`Color(0xAARRGGBB)`) et Compose
// (`Color(0xAARRGGBB)`) : les deux cibles utilisent EXACTEMENT le meme
// format hexadecimal pour une couleur litterale (pas de token
// correspondant), donc la meme fonction de conversion, plutot qu'une
// derive de calcul d'arrondi entre les deux generateurs pour un meme
// document.
import type { Color } from '@calque/core'

export function colorByte(component: number): number {
  return Math.max(0, Math.min(255, Math.round(component * 255)))
}

export function colorHexARGB(color: Color): string {
  const toHex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')
  return `0x${toHex(colorByte(color.a))}${toHex(colorByte(color.r))}${toHex(colorByte(color.g))}${toHex(colorByte(color.b))}`
}
