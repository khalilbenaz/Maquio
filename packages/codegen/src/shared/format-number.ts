// Formatage de nombre en litteral, partage par les quatre exportateurs :
// un entier s'ecrit sans decimale, les autres sont arrondis a `decimals`
// decimales puis debarrasses de leurs zeros de fin, pour un rendu
// deterministe et lisible plutot que des flottants a 15 chiffres. Dart,
// TypeScript, Swift et Kotlin partagent la meme grammaire de litteral
// numerique decimal, donc la meme fonction convient aux quatre cibles.
export function formatNumber(value: number, decimals = 4): string {
  if (Number.isInteger(value)) return String(value)
  const fixed = value.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}
