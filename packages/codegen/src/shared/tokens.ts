// Correspondance couleur -> token de design, partagee par tous les
// exportateurs (Flutter aujourd'hui, React Native / SwiftUI / Compose aux
// Taches 8 et 9). Extrait ici plutot que laisse dans flutter/dart-utils.ts
// pour que les quatre cibles utilisent exactement la meme regle de
// correspondance : une derive entre generateurs produirait des exports
// incoherents entre frameworks pour un meme document (round de correction
// 1, point Minor promu par le coordinateur).
import type { Color, DesignTokens } from '@calque/core'

function colorsEqual(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

// Cherche un token de couleur correspondant exactement (composantes
// identiques). L'ordre d'iteration suit l'ordre d'insertion des cles de
// l'objet (deterministe pour des cles chaine non numeriques), jamais un
// Set/Map a ordre incertain. Retourne le nom du token ou null si aucune
// couleur du document ne correspond exactement.
export function findColorToken(color: Color, tokens: DesignTokens): string | null {
  for (const [name, tokenColor] of Object.entries(tokens.colors)) {
    if (colorsEqual(color, tokenColor)) return name
  }
  return null
}
