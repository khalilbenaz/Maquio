// Traduction des DesignTokens en `lib/theme.dart` (decision 8 du brief
// Tache 7) : AppColors / AppSpacing / AppTextStyles en constantes, plus un
// ThemeData pret a l'emploi.
import type { DesignTokens } from '@calque/core'
import type { ExportedFile } from '../types'
import { type Arg, attach, call, lit } from './dart-writer'
import { colorExpr, colorHex, fontWeightExpr, formatNumber } from './dart-utils'

function colorConstantLines(tokens: DesignTokens): string[] {
  return Object.entries(tokens.colors).map(
    ([name, color]) => `  static const Color ${name} = Color(${colorHex(color)});`,
  )
}

function spacingConstantLines(tokens: DesignTokens): string[] {
  return Object.entries(tokens.spacing).map(
    ([name, value]) => `  static const double ${name} = ${formatNumber(value)};`,
  )
}

function textStyleLines(tokens: DesignTokens): string[] {
  const out: string[] = []
  const entries = Object.entries(tokens.typography)
  entries.forEach(([name, style], index) => {
    const args: Arg[] = [
      { key: 'fontFamily', block: lit(`'${style.fontFamily.replace(/'/g, "\\'")}'`) },
      { key: 'fontSize', block: lit(formatNumber(style.fontSize)) },
      { key: 'fontWeight', block: lit(fontWeightExpr(style.fontWeight)) },
    ]
    if (style.lineHeight > 0 && style.fontSize > 0) {
      args.push({ key: 'height', block: lit(formatNumber(style.lineHeight / style.fontSize)) })
    }
    if (style.letterSpacing !== 0) {
      args.push({ key: 'letterSpacing', block: lit(formatNumber(style.letterSpacing)) })
    }
    args.push({ key: 'color', block: lit(colorExpr(style.color, tokens)) })

    out.push(...attach(`static const TextStyle ${name} = `, call('TextStyle', args), 1, ';'))
    if (index < entries.length - 1) out.push('')
  })
  return out
}

export function generateThemeFile(tokens: DesignTokens): ExportedFile {
  const hasPrimary = 'primary' in tokens.colors
  const themeArgs: Arg[] = [{ key: 'useMaterial3', block: lit('true') }]
  if (hasPrimary) {
    themeArgs.push({
      key: 'colorScheme',
      block: call('ColorScheme.fromSeed', [{ key: 'seedColor', block: lit('AppColors.primary') }]),
    })
  }

  const lines = [
    `import 'package:flutter/material.dart';`,
    '',
    '/// Couleurs du design system, generees depuis les tokens Calque.',
    'class AppColors {',
    '  AppColors._();',
    '',
    ...colorConstantLines(tokens),
    '}',
    '',
    '/// Espacements du design system, generes depuis les tokens Calque.',
    'class AppSpacing {',
    '  AppSpacing._();',
    '',
    ...spacingConstantLines(tokens),
    '}',
    '',
    '/// Styles de texte du design system, generes depuis les tokens Calque.',
    'class AppTextStyles {',
    '  AppTextStyles._();',
    '',
    ...textStyleLines(tokens),
    '}',
    '',
    ...attach('final ThemeData appTheme = ', call('ThemeData', themeArgs), 0, ';'),
    '',
  ]

  return { path: 'lib/theme.dart', contents: lines.join('\n') }
}
