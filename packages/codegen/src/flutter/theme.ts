// Traduction des DesignTokens en `lib/theme.dart` (decision 8 du brief
// Tache 7) : AppColors / AppSpacing / AppTextStyles en constantes, plus un
// ThemeData pret a l'emploi.
import type { DesignTokens } from '@maquio/core'
import { buildTokenIdentifiers } from '../shared/token-identifiers'
import type { ExportedFile } from '../types'
import { type Arg, attach, call, collapseShortCalls, lit } from './dart-writer'
import { DART_RESERVED_WORDS, colorExpr, colorHex, escapeDartString, fontWeightExpr, formatNumber } from './dart-utils'

// Correction Important 3 (re-revue) : une ligne blanche entre le
// constructeur prive et un corps de classe VIDE (categorie de tokens sans
// entree, ex. `tokens.spacing` -- jamais alimentee par le traducteur
// Figma, donc le cas courant sur tout document importe) est une ligne
// blanche parasite avant `}` que `dart format` retire. Ne l'ajoute que
// lorsqu'il y a effectivement un ou plusieurs membres a en separer.
function classBody(className: string, memberLines: string[]): string[] {
  const lines = [`class ${className} {`, `  ${className}._();`]
  if (memberLines.length > 0) lines.push('', ...memberLines)
  lines.push('}')
  return lines
}

// Correction Critical 3 : `name` est le nom BRUT d'un token ("brand-
// primary-500"), pas forcement un identifiant Dart valide -- `static const
// Color brand-primary-500` ne compile pas. Chaque categorie de tokens
// (colors/spacing/typography) a son propre espace de noms Dart (classe
// distincte), donc sa propre resolution d'unicite.
function colorConstantLines(tokens: DesignTokens): string[] {
  const ids = buildTokenIdentifiers(Object.keys(tokens.colors), DART_RESERVED_WORDS)
  return Object.entries(tokens.colors).map(
    ([name, color]) => `  static const Color ${ids.get(name)!} = Color(${colorHex(color)});`,
  )
}

function spacingConstantLines(tokens: DesignTokens): string[] {
  const ids = buildTokenIdentifiers(Object.keys(tokens.spacing), DART_RESERVED_WORDS)
  return Object.entries(tokens.spacing).map(
    ([name, value]) => `  static const double ${ids.get(name)!} = ${formatNumber(value)};`,
  )
}

function textStyleLines(tokens: DesignTokens): string[] {
  const out: string[] = []
  const entries = Object.entries(tokens.typography)
  const ids = buildTokenIdentifiers(Object.keys(tokens.typography), DART_RESERVED_WORDS)
  entries.forEach(([name, style], index) => {
    const args: Arg[] = [
      // Correction D5 (rapport dart-correctness) : `escapeDartString`
      // partagee, jamais un `.replace(/'/g, ...)` local -- l'ancienne
      // version n'echappait ni l'antislash ni `$` (interpolation Dart),
      // une famille de police contenant `$` ouvrait donc une
      // interpolation invalide ou silencieuse.
      { key: 'fontFamily', block: lit(`'${escapeDartString(style.fontFamily)}'`) },
      { key: 'fontSize', block: lit(formatNumber(style.fontSize)) },
      { key: 'fontWeight', block: lit(fontWeightExpr(style.fontWeight)) },
    ]
    if (style.lineHeight > 0 && style.fontSize > 0) {
      args.push({ key: 'height', block: lit(formatNumber(style.lineHeight / style.fontSize)) })
    }
    if (style.letterSpacing !== 0) {
      args.push({ key: 'letterSpacing', block: lit(formatNumber(style.letterSpacing)) })
    }
    // `omitConstKeyword: true` (lint `unnecessary_const`, suite du
    // rapport dart-correctness) : cette valeur est TOUJOURS assignee a un
    // champ `static const` (voir `attach('static const TextStyle ... = '`
    // ci-dessous) -- un `const Color(...)` explicite y serait redondant,
    // Dart promeut deja l'expression en constante par le contexte.
    args.push({ key: 'color', block: lit(colorExpr(style.color, tokens, undefined, true)) })

    out.push(...attach(`static const TextStyle ${ids.get(name)!} = `, call('TextStyle', args), 1, ';'))
    if (index < entries.length - 1) out.push('')
  })
  return out
}

export function generateThemeFile(tokens: DesignTokens): ExportedFile {
  // Correction Critical 3 (effet de bord) : la detection doit porter sur
  // le nom NORMALISE, pas la chaine brute. Un token dont le nom brut est
  // exactement "primary" mais dont l'identifiant emis a ete replie sur
  // "primary2" (collision avec un autre nom qui normalise aussi en
  // "primary") ne doit plus faire reference a "AppColors.primary", qui
  // n'existerait alors pas ; inversement un token nomme "Primary" (autre
  // casse) normalise bien en "primary" et doit maintenant declencher le
  // colorScheme, ce que l'ancienne comparaison de chaine brute manquait.
  const colorIds = buildTokenIdentifiers(Object.keys(tokens.colors), DART_RESERVED_WORDS)
  const primaryEntry = [...colorIds.entries()].find(([, id]) => id === 'primary')
  const themeArgs: Arg[] = [{ key: 'useMaterial3', block: lit('true') }]
  if (primaryEntry) {
    themeArgs.push({
      key: 'colorScheme',
      block: call('ColorScheme.fromSeed', [{ key: 'seedColor', block: lit(`AppColors.${primaryEntry[1]}`) }]),
    })
  }

  const lines = [
    `import 'package:flutter/material.dart';`,
    '',
    '/// Couleurs du design system, generees depuis les tokens Maquio.',
    ...classBody('AppColors', colorConstantLines(tokens)),
    '',
    '/// Espacements du design system, generes depuis les tokens Maquio.',
    ...classBody('AppSpacing', spacingConstantLines(tokens)),
    '',
    '/// Styles de texte du design system, generes depuis les tokens Maquio.',
    ...classBody('AppTextStyles', textStyleLines(tokens)),
    '',
    ...attach('final ThemeData appTheme = ', call('ThemeData', themeArgs), 0, ';'),
    '',
  ]

  return { path: 'lib/theme.dart', contents: collapseShortCalls(lines).join('\n') }
}
