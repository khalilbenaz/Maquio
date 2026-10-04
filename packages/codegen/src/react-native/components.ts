// Composants mobiles semantiques vers React Native. Les primitives de base
// sont celles du coeur (Pressable, TextInput, Switch, ActivityIndicator,
// Modal, ScrollView) ; ce que React Native n'embarque plus ou n'a jamais eu
// passe par le paquet communautaire de reference :
//   - icones            : react-native-vector-icons (MaterialIcons)
//   - curseur           : @react-native-community/slider
//   - liste deroulante  : @react-native-picker/picker
//   - selecteur de date : @react-native-community/datetimepicker
// La navigation utilise React Navigation (pile native) : voir App.tsx.
import type { Color, ComponentNode, DesignTokens, IconName, Node } from '@calque/core'
import { ICONS } from '@calque/core'
import { formatNumber } from '../shared/format-number'
import { isRemoteUrl } from '../shared/node-helpers'
import { itemTargets } from '../shared/screens'
import type { ExportPlan, ScreenRef } from '../shared/screens'
import { colorToHex, jsString } from './rn-utils'

export type StyleProp = [key: string, value: string]

export type RnCtx = {
  tokens: DesignTokens
  warnings: string[]
  styles: { key: string; props: StyleProp[] }[]
  styleKey(id: string): string
  use(name: string): void
  addImport(line: string): void
  addHook(line: string): void
  colorExpr(color: Color): string
  // Le code genere reference `navigation` (parametre de l'ecran).
  markNavigation(): void
}

export type RnEnv = {
  ctx: RnCtx
  plan: ExportPlan
  // Le parent est une Row/Column (un espaceur y prend un `flex`).
  inFlex: boolean
  // Ouvre le tiroir de l'ecran (etat local), ou null s'il n'y en a pas.
  openDrawer: string | null
  // Attributs JSX d'interaction du noeud (` onPress={...} onLongPress={...}`), ou ''.
  press(node: Node): string
}

// Palette Material 3 par defaut : le meme theme que Flutter et Compose.
export const M3 = {
  primary: '#6750a4',
  onPrimary: '#ffffff',
  primaryContainer: '#eaddff',
  onPrimaryContainer: '#21005d',
  secondaryContainer: '#e8def8',
  surface: '#fef7ff',
  surfaceContainer: '#f3edf7',
  onSurface: '#1d1b20',
  onSurfaceVariant: '#49454f',
  outline: '#79747e',
  outlineVariant: '#cac4d0',
  error: '#b3261e',
  inverseSurface: '#322f35',
  inverseOnSurface: '#f5eff7',
  disabled: '#1d1b2061',
  disabledContainer: '#1d1b201f',
} as const

const num = formatNumber
const q = jsString
// Expression JS : un hexadecimal brut (`#rrggbb`) est cite, une expression est conservee.
const ex = (s: string): string => (s.startsWith('#') ? jsString(s) : s)

function nav(env: RnEnv, ref: ScreenRef): string {
  env.ctx.markNavigation()
  return `() => navigation.navigate(${q(ref.pascal)})`
}

function icon(env: RnEnv, name: IconName, size: number, color: string): string {
  env.ctx.use('MaterialIcons')
  env.ctx.addImport("import MaterialIcons from 'react-native-vector-icons/MaterialIcons';")
  return `<MaterialIcons name=${q(ICONS[name].materialName)} size={${num(size)}} color={${ex(color)}} />`
}

function colorOrDefault(env: RnEnv, c: Color | undefined, fallback: string): string {
  return c === undefined ? ex(fallback) : env.ctx.colorExpr(c)
}

// Position / opacite / rotation communes a tout noeud, appliquees au style
// racine du composant.
export function withNodeStyle(
  node: ComponentNode,
  props: StyleProp[],
  absolutePos: { x: number; y: number } | null,
): StyleProp[] {
  const out: StyleProp[] = []
  if (absolutePos) out.push(['position', q('absolute')], ['left', num(absolutePos.x)], ['top', num(absolutePos.y)])
  out.push(...props)
  if (node.opacity < 1) out.push(['opacity', num(node.opacity)])
  if (node.rotation !== 0) out.push(['transform', `[{ rotate: '${num(node.rotation)}deg' }]`])
  return out
}

const sized = (node: ComponentNode): StyleProp[] => [
  ['width', num(node.frame.w)],
  ['height', num(node.frame.h)],
]

function flexRow(extra: StyleProp[] = []): StyleProp[] {
  return [['flexDirection', q('row')], ['alignItems', q('center')], ...extra]
}

// Rend un composant : renvoie les lignes JSX (a `pad`) apres avoir enregistre
// tous ses styles. `pos` : position absolue dans une frame `absolute`.
export function renderRnComponent(
  node: ComponentNode,
  env: RnEnv,
  depth: number,
  pos: { x: number; y: number } | null,
): string[] | null {
  const { ctx } = env
  const pad = '  '.repeat(depth)
  const at = (d: number) => '  '.repeat(depth + d)
  const onPress = env.press(node)
  const rootKey = ctx.styleKey(node.id)
  const push = (key: string, props: StyleProp[]) => ctx.styles.push({ key, props })
  const sub = (suffix: string) => ctx.styleKey(`${node.id}-${suffix}`)
  const root = (props: StyleProp[]) => push(rootKey, withNodeStyle(node, props, pos))
  const S = (key: string) => `styles.${key}`

  switch (node.kind) {
    case 'button': {
      const p = node.props
      ctx.use('Pressable')
      ctx.use('Text')
      const main = colorOrDefault(env, p.color, M3.primary)
      const fg = p.disabled ? M3.disabled : p.variant === 'primary' ? M3.onPrimary : main
      const labelKey = sub('label')
      const base: StyleProp[] = [
        ...sized(node),
        ...flexRow([['justifyContent', q('center')], ['gap', '8'], ['borderRadius', num(node.frame.h / 2)]]),
      ]
      if (p.variant === 'primary') base.push(['backgroundColor', p.disabled ? q(M3.disabledContainer) : main])
      if (p.variant === 'secondary') {
        base.push(['borderWidth', '1'], ['borderColor', p.disabled ? q(M3.disabledContainer) : q(M3.outline)])
      }
      root(base)
      push(labelKey, [['color', ex(fg)], ['fontSize', '14'], ['fontWeight', q('500')]])
      const lines = [`${pad}<Pressable style={${S(rootKey)}}${onPress}${p.disabled ? ' disabled' : ''}>`]
      if (p.icon !== undefined) lines.push(`${at(1)}${icon(env, p.icon, 18, p.variant === 'primary' && !p.disabled ? M3.onPrimary : p.disabled ? M3.disabled : p.color ? main : M3.primary)}`)
      lines.push(`${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`, `${pad}</Pressable>`)
      return lines
    }
    case 'iconButton': {
      const p = node.props
      ctx.use('Pressable')
      const main = colorOrDefault(env, p.color, M3.primary)
      const filled = p.variant === 'filled'
      const base: StyleProp[] = [...sized(node), ['alignItems', q('center')], ['justifyContent', q('center')], ['borderRadius', num(Math.min(node.frame.w, node.frame.h) / 2)]]
      if (filled) base.push(['backgroundColor', p.disabled ? q(M3.disabledContainer) : main])
      if (p.variant === 'outlined') base.push(['borderWidth', '1'], ['borderColor', q(M3.outline)])
      root(base)
      const tint = p.disabled ? M3.disabled : filled ? M3.onPrimary : p.variant === 'outlined' ? M3.onSurfaceVariant : null
      return [
        `${pad}<Pressable style={${S(rootKey)}}${onPress}${p.disabled ? ' disabled' : ''}>`,
        `${at(1)}${icon(env, p.icon, 24, tint ?? (p.color ? main : M3.primary))}`,
        `${pad}</Pressable>`,
      ]
    }
    case 'fab': {
      const p = node.props
      ctx.use('Pressable')
      ctx.use('Text')
      const radius = p.size === 'large' ? 28 : p.size === 'small' ? 12 : 16
      root([
        ...sized(node),
        ...flexRow([['justifyContent', q('center')], ['gap', '12'], ['borderRadius', String(radius)], ['backgroundColor', colorOrDefault(env, p.color, q(M3.primaryContainer))], ['elevation', '6']]),
      ])
      const labelKey = sub('label')
      push(labelKey, [['color', q(M3.onPrimaryContainer)], ['fontSize', '14'], ['fontWeight', q('500')]])
      const lines = [`${pad}<Pressable style={${S(rootKey)}}${onPress}>`, `${at(1)}${icon(env, p.icon, p.size === 'large' ? 36 : 24, M3.onPrimaryContainer)}`]
      if (p.label !== '') lines.push(`${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`)
      lines.push(`${pad}</Pressable>`)
      return lines
    }
    case 'textField': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.use('TextInput')
      const error = p.errorText !== ''
      const edge = error ? M3.error : p.disabled ? M3.disabledContainer : M3.outline
      const labelKey = sub('label')
      const inputKey = sub('input')
      const noteKey = sub('note')
      root([['width', num(node.frame.w)]])
      push(labelKey, [['color', q(error ? M3.error : M3.onSurfaceVariant)], ['fontSize', '12'], ['marginBottom', '4']])
      push(inputKey, [
        ['borderWidth', '1'],
        ['borderColor', q(edge)],
        ['borderRadius', '4'],
        ['paddingHorizontal', '16'],
        ['fontSize', '16'],
        ['color', q(M3.onSurface)],
        ...(p.multiline ? ([['height', num(Math.max(node.frame.h - 24, 40))], ['textAlignVertical', q('top')], ['paddingTop', '12']] as StyleProp[]) : ([['height', '56']] as StyleProp[])),
      ])
      push(noteKey, [['color', q(error ? M3.error : M3.onSurfaceVariant)], ['fontSize', '12'], ['marginTop', '4'], ['paddingHorizontal', '16']])
      const attrs = [`style={${S(inputKey)}}`]
      if (p.placeholder !== '') attrs.push(`placeholder=${q(p.placeholder)}`)
      if (p.value !== '') attrs.push(`defaultValue=${q(p.value)}`)
      if (p.password) attrs.push('secureTextEntry')
      if (p.multiline) attrs.push('multiline')
      if (p.disabled) attrs.push('editable={false}')
      const lines = [`${pad}<View style={${S(rootKey)}}>`]
      if (p.label !== '') lines.push(`${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`)
      lines.push(`${at(1)}<TextInput ${attrs.join(' ')} />`)
      const note = error ? p.errorText : p.helperText
      if (note !== '') lines.push(`${at(1)}<Text style={${S(noteKey)}}>{${q(note)}}</Text>`)
      lines.push(`${pad}</View>`)
      return lines
    }
    case 'checkbox':
    case 'radio': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.use('Pressable')
      const on = node.kind === 'checkbox' ? (p as { checked: boolean }).checked : (p as { selected: boolean }).selected
      const boxKey = sub('box')
      const labelKey = sub('label')
      root([...sized(node), ...flexRow([['gap', '12'], ['opacity', (p as { disabled: boolean }).disabled ? '0.6' : '1']])])
      const round = node.kind === 'radio'
      push(boxKey, [
        ['width', round ? '20' : '18'],
        ['height', round ? '20' : '18'],
        ['borderRadius', round ? '10' : '2'],
        ['borderWidth', on && !round ? '0' : '2'],
        ['borderColor', q(on ? M3.primary : M3.onSurfaceVariant)],
        ['alignItems', q('center')],
        ['justifyContent', q('center')],
        ...(on && !round ? ([['backgroundColor', q(M3.primary)]] as StyleProp[]) : []),
      ])
      push(labelKey, [['color', q(M3.onSurface)], ['fontSize', '14']])
      const mark = round
        ? on
          ? `<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ${q(M3.primary)} }} />`
          : null
        : on
          ? icon(env, 'check', 14, M3.onPrimary)
          : null
      return [
        `${pad}<Pressable style={${S(rootKey)}}${(p as { disabled: boolean }).disabled ? ' disabled' : ''}>`,
        mark === null ? `${at(1)}<View style={${S(boxKey)}} />` : `${at(1)}<View style={${S(boxKey)}}>${mark}</View>`,
        `${at(1)}<Text style={${S(labelKey)}}>{${q((p as { label: string }).label)}}</Text>`,
        `${pad}</Pressable>`,
      ]
    }
    case 'switch': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.use('Switch')
      const labelKey = sub('label')
      root([...sized(node), ...flexRow([['justifyContent', q('space-between')]])])
      push(labelKey, [['color', q(M3.onSurface)], ['fontSize', '14']])
      return [
        `${pad}<View style={${S(rootKey)}}>`,
        `${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`,
        `${at(1)}<Switch value={${p.checked}}${p.disabled ? ' disabled' : ''} trackColor={{ true: ${q(M3.primary)} }} />`,
        `${pad}</View>`,
      ]
    }
    case 'slider': {
      const p = node.props
      ctx.addImport("import Slider from '@react-native-community/slider';")
      root(sized(node))
      return [`${pad}<Slider style={${S(rootKey)}} value={${num(p.value)}} minimumValue={${num(p.min)}} maximumValue={${num(p.max)}}${p.disabled ? ' disabled' : ''} minimumTrackTintColor=${q(M3.primary)} />`]
    }
    case 'dropdown': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.addImport("import { Picker } from '@react-native-picker/picker';")
      const labelKey = sub('label')
      root([['width', num(node.frame.w)]])
      push(labelKey, [['color', q(M3.onSurfaceVariant)], ['fontSize', '12']])
      const selected = p.selectedIndex >= 0 ? ` selectedValue={${q(p.options[p.selectedIndex]!)}}` : ''
      const lines = [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`, `${at(1)}<Picker${selected}${p.disabled ? ' enabled={false}' : ''}>`]
      for (const option of p.options) lines.push(`${at(2)}<Picker.Item label=${q(option)} value=${q(option)} />`)
      lines.push(`${at(1)}</Picker>`, `${pad}</View>`)
      return lines
    }
    case 'datePicker': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.addImport("import DateTimePicker from '@react-native-community/datetimepicker';")
      const labelKey = sub('label')
      root([['width', num(node.frame.w)], ...flexRow([['justifyContent', q('space-between')]])])
      push(labelKey, [['color', q(M3.onSurfaceVariant)], ['fontSize', '14']])
      const value = p.value === '' ? 'new Date()' : `new Date(${q(p.value)})`
      return [
        `${pad}<View style={${S(rootKey)}}>`,
        `${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`,
        `${at(1)}<DateTimePicker value={${value}} mode="date"${p.disabled ? ' disabled' : ''} />`,
        `${pad}</View>`,
      ]
    }
    case 'icon': {
      const p = node.props
      ctx.use('View')
      root([...sized(node), ['alignItems', q('center')], ['justifyContent', q('center')]])
      const c = p.color === undefined ? M3.onSurface : ctx.colorExpr(p.color)
      return [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}${icon(env, p.name, p.size, c)}`, `${pad}</View>`]
    }
    case 'avatar': {
      const p = node.props
      ctx.use('View')
      const radius = Math.min(node.frame.w, node.frame.h) / 2
      root([...sized(node), ['borderRadius', num(radius)], ['overflow', q('hidden')], ['alignItems', q('center')], ['justifyContent', q('center')], ['backgroundColor', colorOrDefault(env, p.color, q(M3.primaryContainer))]])
      if (p.src !== '') {
        ctx.use('Image')
        const source = isRemoteUrl(p.src) ? `{{ uri: ${q(p.src)} }}` : `{require(${q(/^[./]/.test(p.src) ? p.src : `./${p.src}`)})}`
        return [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<Image style={{ width: ${num(node.frame.w)}, height: ${num(node.frame.h)} }} source=${source} />`, `${pad}</View>`]
      }
      ctx.use('Text')
      const labelKey = sub('label')
      push(labelKey, [['color', q(M3.onPrimaryContainer)], ['fontSize', num(Math.max(radius * 0.6, 10))], ['fontWeight', q('500')]])
      return [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<Text style={${S(labelKey)}}>{${q(p.initials)}}</Text>`, `${pad}</View>`]
    }
    case 'badge': {
      const p = node.props
      ctx.use('View')
      root([...sized(node), ['borderRadius', num(Math.min(node.frame.w, node.frame.h) / 2)], ['alignItems', q('center')], ['justifyContent', q('center')], ['backgroundColor', colorOrDefault(env, p.color, q(M3.error))]])
      if (p.text === '') return [`${pad}<View style={${S(rootKey)}} />`]
      ctx.use('Text')
      const labelKey = sub('label')
      push(labelKey, [['color', q('#ffffff')], ['fontSize', '11'], ['fontWeight', q('500')]])
      return [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<Text style={${S(labelKey)}}>{${q(p.text)}}</Text>`, `${pad}</View>`]
    }
    case 'chip': {
      const p = node.props
      ctx.use('Pressable')
      ctx.use('Text')
      const selected = p.variant === 'filter' && p.selected
      root([...sized(node), ...flexRow([['gap', '8'], ['paddingHorizontal', '12'], ['borderRadius', '8'], ['borderWidth', selected ? '0' : '1'], ['borderColor', q(M3.outline)], ['backgroundColor', q(selected ? M3.secondaryContainer : 'transparent')]])])
      const labelKey = sub('label')
      push(labelKey, [['color', q(M3.onSurface)], ['fontSize', '14'], ['fontWeight', q('500')]])
      const lines = [`${pad}<Pressable style={${S(rootKey)}}${onPress}>`]
      if (selected) lines.push(`${at(1)}${icon(env, 'check', 18, M3.onSurface)}`)
      else if (p.icon !== undefined) lines.push(`${at(1)}${icon(env, p.icon, 18, M3.primary)}`)
      lines.push(`${at(1)}<Text style={${S(labelKey)}}>{${q(p.label)}}</Text>`, `${pad}</Pressable>`)
      return lines
    }
    case 'divider': {
      const p = node.props
      ctx.use('View')
      const color = colorOrDefault(env, p.color, q(M3.outlineVariant))
      root(
        p.vertical
          ? [['width', num(p.thickness)], ['height', num(node.frame.h)], ['backgroundColor', color], ['marginTop', num(p.indent)]]
          : [['height', num(p.thickness)], ['width', num(node.frame.w)], ['backgroundColor', color], ['marginLeft', num(p.indent)]],
      )
      return [`${pad}<View style={${S(rootKey)}} />`]
    }
    case 'progressBar': {
      const p = node.props
      ctx.use('View')
      const fillKey = sub('fill')
      root([['width', num(node.frame.w)], ['height', num(Math.max(node.frame.h, 4))], ['borderRadius', '2'], ['backgroundColor', q(M3.secondaryContainer)], ['overflow', q('hidden')]])
      push(fillKey, [['height', "'100%'"], ['width', q(p.indeterminate ? '35%' : `${num(p.value * 100)}%`)], ['marginLeft', q(p.indeterminate ? '30%' : '0%')], ['backgroundColor', colorOrDefault(env, p.color, q(M3.primary))]])
      return [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<View style={${S(fillKey)}} />`, `${pad}</View>`]
    }
    case 'spinner': {
      const p = node.props
      ctx.use('ActivityIndicator')
      root(sized(node))
      const color = colorOrDefault(env, p.color, q(M3.primary))
      return [`${pad}<ActivityIndicator style={${S(rootKey)}} size="large" color={${color}} />`]
    }
    case 'listTile': {
      const p = node.props
      ctx.use('Pressable')
      ctx.use('View')
      ctx.use('Text')
      const bodyKey = sub('body')
      const titleKey = sub('title')
      const subtitleKey = sub('subtitle')
      root([...sized(node), ...flexRow([['gap', '16'], ['paddingHorizontal', '16']])])
      push(bodyKey, [['flex', '1']])
      push(titleKey, [['color', q(M3.onSurface)], ['fontSize', '16']])
      push(subtitleKey, [['color', q(M3.onSurfaceVariant)], ['fontSize', '14']])
      const lines = [`${pad}<Pressable style={${S(rootKey)}}${onPress}>`]
      if (p.leadingIcon !== undefined) lines.push(`${at(1)}${icon(env, p.leadingIcon, 24, M3.onSurfaceVariant)}`)
      lines.push(`${at(1)}<View style={${S(bodyKey)}}>`, `${at(2)}<Text style={${S(titleKey)}}>{${q(p.title)}}</Text>`)
      if (p.subtitle !== '') lines.push(`${at(2)}<Text style={${S(subtitleKey)}}>{${q(p.subtitle)}}</Text>`)
      lines.push(`${at(1)}</View>`)
      if (p.trailingIcon !== undefined) lines.push(`${at(1)}${icon(env, p.trailingIcon, 24, M3.onSurfaceVariant)}`)
      lines.push(`${pad}</Pressable>`)
      return lines
    }
    case 'spacer': {
      const p = node.props
      ctx.use('View')
      root(env.inFlex ? [['flex', String(p.flex)]] : sized(node))
      return [`${pad}<View style={${S(rootKey)}} />`]
    }
    case 'appBar': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.use('Pressable')
      const bg = p.color === undefined ? q(M3.surface) : env.ctx.colorExpr(p.color)
      const fg = p.color === undefined ? M3.onSurface : M3.onPrimary
      const titleKey = sub('title')
      const slotKey = sub('slot')
      root([['width', num(node.frame.w)], ['height', num(node.frame.h)], ...flexRow([['paddingHorizontal', '4'], ['backgroundColor', bg]])])
      push(titleKey, [['flex', '1'], ['color', q(fg)], ['fontSize', '22'], ['textAlign', q(p.centerTitle ? 'center' : 'left')], ['marginLeft', p.leading === 'none' ? '12' : '0']])
      push(slotKey, [['width', '48'], ['height', '48'], ['alignItems', q('center')], ['justifyContent', q('center')]])
      const lines = [`${pad}<View style={${S(rootKey)}}>`]
      if (p.leading === 'back') {
        env.ctx.markNavigation()
        lines.push(`${at(1)}<Pressable style={${S(slotKey)}} onPress={() => navigation.goBack()}>`, `${at(2)}${icon(env, 'arrowBack', 24, fg)}`, `${at(1)}</Pressable>`)
      } else if (p.leading === 'menu') {
        const open = env.openDrawer === null ? '' : ` onPress={() => ${env.openDrawer}(true)}`
        lines.push(`${at(1)}<Pressable style={${S(slotKey)}}${open}>`, `${at(2)}${icon(env, 'menu', 24, fg)}`, `${at(1)}</Pressable>`)
      }
      lines.push(`${at(1)}<Text style={${S(titleKey)}}>{${q(p.title)}}</Text>`)
      for (const action of p.actions) {
        lines.push(`${at(1)}<Pressable style={${S(slotKey)}}>`, `${at(2)}${icon(env, action, 24, fg)}`, `${at(1)}</Pressable>`)
      }
      lines.push(`${pad}</View>`)
      return lines
    }
    case 'bottomNav':
    case 'tabs': {
      ctx.use('View')
      ctx.use('Text')
      ctx.use('Pressable')
      const bottom = node.kind === 'bottomNav'
      const targets = itemTargets(node, env.plan)
      const items = node.props.items as { label: string; icon?: IconName }[]
      const selectedIndex = node.props.selectedIndex
      const cellKey = sub('cell')
      const activeCellKey = sub('active')
      const labelKey = sub('label')
      const activeLabelKey = sub('activelabel')
      root([...sized(node), ['flexDirection', q('row')], ['backgroundColor', q(bottom ? M3.surfaceContainer : M3.surface)], ...(bottom ? [] : ([['borderBottomWidth', '1'], ['borderBottomColor', q(M3.outlineVariant)]] as StyleProp[]))])
      push(cellKey, [['flex', '1'], ['alignItems', q('center')], ['justifyContent', q('center')], ['gap', bottom ? '4' : '8'], ...(bottom ? [] : ([['flexDirection', q('row')], ['borderBottomWidth', '3'], ['borderBottomColor', q('transparent')]] as StyleProp[]))])
      push(activeCellKey, bottom ? [] : [['borderBottomColor', q(M3.primary)]])
      push(labelKey, [['color', q(M3.onSurfaceVariant)], ['fontSize', bottom ? '12' : '14'], ['fontWeight', q('500')]])
      push(activeLabelKey, [['color', q(bottom ? M3.onSurface : M3.primary)], ['fontWeight', q(bottom ? '700' : '500')]])
      const lines = [`${pad}<View style={${S(rootKey)}}>`]
      items.forEach((item, i) => {
        const active = i === selectedIndex
        const target = targets[i] ?? null
        lines.push(`${at(1)}<Pressable style={${active && !bottom ? `[${S(cellKey)}, ${S(activeCellKey)}]` : S(cellKey)}}${target === null ? '' : ` onPress={${nav(env, target)}}`}>`)
        if (item.icon !== undefined) lines.push(`${at(2)}${icon(env, item.icon, bottom ? 24 : 20, active ? (bottom ? M3.onSurface : M3.primary) : M3.onSurfaceVariant)}`)
        lines.push(`${at(2)}<Text style={${active ? `[${S(labelKey)}, ${S(activeLabelKey)}]` : S(labelKey)}}>{${q(item.label)}}</Text>`, `${at(1)}</Pressable>`)
      })
      lines.push(`${pad}</View>`)
      return lines
    }
    case 'dialog': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      ctx.use('Modal')
      ctx.use('Pressable')
      const stateKey = `dialog${ctx.styleKey(`${node.id}-state`).replace(/^./, (c) => c.toUpperCase())}`
      ctx.addHook(`const [${stateKey}Open, set${stateKey}Open] = useState(true);`)
      ctx.addImport("import { useState } from 'react';")
      const overlayKey = sub('overlay')
      const titleKey = sub('title')
      const messageKey = sub('message')
      const actionsKey = sub('actions')
      const actionKey = sub('action')
      push(overlayKey, [['flex', '1'], ['alignItems', q('center')], ['justifyContent', q('center')], ['backgroundColor', q('#00000052')]])
      root([['width', num(node.frame.w)], ['backgroundColor', q(M3.surfaceContainer)], ['borderRadius', '28'], ['padding', '24'], ['gap', '16']])
      push(titleKey, [['color', q(M3.onSurface)], ['fontSize', '24']])
      push(messageKey, [['color', q(M3.onSurfaceVariant)], ['fontSize', '14']])
      push(actionsKey, [['flexDirection', q('row')], ['justifyContent', q('flex-end')], ['gap', '8']])
      push(actionKey, [['color', q(M3.primary)], ['fontSize', '14'], ['fontWeight', q('500')], ['padding', '10']])
      const close = `set${stateKey}Open(false)`
      const lines = [
        `${pad}<Modal transparent animationType="fade" visible={${stateKey}Open} onRequestClose={() => ${close}}>`,
        `${at(1)}<View style={${S(overlayKey)}}>`,
        `${at(2)}<View style={${S(rootKey)}}>`,
        `${at(3)}<Text style={${S(titleKey)}}>{${q(p.title)}}</Text>`,
        `${at(3)}<Text style={${S(messageKey)}}>{${q(p.message)}}</Text>`,
        `${at(3)}<View style={${S(actionsKey)}}>`,
      ]
      if (p.cancelLabel !== '') lines.push(`${at(4)}<Pressable onPress={() => ${close}}><Text style={${S(actionKey)}}>{${q(p.cancelLabel)}}</Text></Pressable>`)
      lines.push(`${at(4)}<Pressable onPress={() => ${close}}><Text style={${S(actionKey)}}>{${q(p.confirmLabel)}}</Text></Pressable>`, `${at(3)}</View>`, `${at(2)}</View>`, `${at(1)}</View>`, `${pad}</Modal>`)
      return lines
    }
    case 'snackbar': {
      const p = node.props
      ctx.use('View')
      ctx.use('Text')
      const messageKey = sub('message')
      const actionKey = sub('action')
      root([...sized(node), ...flexRow([['justifyContent', q('space-between')], ['paddingHorizontal', '16'], ['borderRadius', '4'], ['backgroundColor', q(M3.inverseSurface)], ['elevation', '6']])])
      push(messageKey, [['color', q(M3.inverseOnSurface)], ['fontSize', '14'], ['flex', '1']])
      push(actionKey, [['color', q('#d0bcff')], ['fontSize', '14'], ['fontWeight', q('500')]])
      const lines = [`${pad}<View style={${S(rootKey)}}>`, `${at(1)}<Text style={${S(messageKey)}}>{${q(p.message)}}</Text>`]
      if (p.actionLabel !== '') lines.push(`${at(1)}<Text style={${S(actionKey)}}>{${q(p.actionLabel)}}</Text>`)
      lines.push(`${pad}</View>`)
      return lines
    }
  }
}

export { colorToHex }
