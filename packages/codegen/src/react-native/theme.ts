// Traduction des DesignTokens en `src/theme.ts` (Tache 8, decision 1 du
// brief) : theme expose en objet (colors / spacing / typography), comme le
// fait `lib/theme.dart` pour Flutter. `colors` est declare a part (plutot
// qu'imbrique dans `theme`) precisement pour que `typography.*.color`
// puisse s'y referer (`colors.black`) sans auto-reference de l'objet
// litteral `theme`.
import type { Color, DesignTokens } from '@calque/core'
import { findColorToken } from '../shared/tokens'
import type { ExportedFile } from '../types'
import { colorToHex, fontWeightExpr } from './rn-utils'

function colorLines(tokens: DesignTokens): string[] {
  const entries = Object.entries(tokens.colors)
  if (entries.length === 0) return ['{}']
  const lines = ['{']
  for (const [name, color] of entries) lines.push(`  ${name}: '${colorToHex(color)}',`)
  lines.push('}')
  return lines
}

function spacingLines(tokens: DesignTokens): string[] {
  const entries = Object.entries(tokens.spacing)
  if (entries.length === 0) return ['{}']
  const lines = ['{']
  for (const [name, value] of entries) lines.push(`  ${name}: ${value},`)
  lines.push('}')
  return lines
}

// `colors.<nom>` quand la couleur correspond exactement a un token,
// litteral hexadecimal sinon (meme regle que pour le corps de l'ecran) —
// s'appuie sur `findColorToken` partagee plutot que de reimplementer la
// comparaison composante par composante (round de correction 1, Important
// 3 du coordinateur).
function colorRefExpr(color: Color, tokens: DesignTokens): string {
  const token = findColorToken(color, tokens)
  return token !== null ? `colors.${token}` : `'${colorToHex(color)}'`
}

function typographyLines(tokens: DesignTokens): string[] {
  const entries = Object.entries(tokens.typography)
  if (entries.length === 0) return ['{}']
  const lines = ['{']
  for (const [name, style] of entries) {
    lines.push(`  ${name}: {`)
    lines.push(`    fontFamily: '${style.fontFamily.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`)
    lines.push(`    fontSize: ${style.fontSize},`)
    lines.push(`    fontWeight: ${fontWeightExpr(style.fontWeight)},`)
    if (style.lineHeight > 0) lines.push(`    lineHeight: ${style.lineHeight},`)
    if (style.letterSpacing !== 0) lines.push(`    letterSpacing: ${style.letterSpacing},`)
    lines.push(`    color: ${colorRefExpr(style.color, tokens)},`)
    lines.push('  },')
  }
  lines.push('}')
  return lines
}

export function generateThemeFile(tokens: DesignTokens): ExportedFile {
  const lines = [
    '// Theme genere depuis les tokens Calque design system.',
    `const colors = ${colorLines(tokens).join('\n')};`,
    '',
    `const spacing = ${spacingLines(tokens).join('\n')};`,
    '',
    `const typography = ${typographyLines(tokens).join('\n')};`,
    '',
    'export const theme = { colors, spacing, typography };',
    '',
    'export type Theme = typeof theme;',
    '',
  ]

  return { path: 'src/theme.ts', contents: lines.join('\n') }
}
