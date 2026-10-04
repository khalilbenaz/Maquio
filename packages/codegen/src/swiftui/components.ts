// Composants mobiles semantiques vers SwiftUI natif : Button, TextField,
// SecureField, Toggle, Slider, Picker, DatePicker, ProgressView, Label,
// TabView, NavigationStack (voir swiftui.ts et navigation)...
//
// Le code reste portable iOS / macOS (aucune API UIKit) pour pouvoir etre
// verifie par `swiftc -typecheck` ; les API de presentation recentes
// (presentationDetents, buttonBorderShape) demandent iOS 16/17.
import type { Color, ComponentNode, DesignTokens, IconName } from '@maquio/core'
import { ICONS } from '@maquio/core'
import { formatNumber } from '../shared/format-number'
import { pad } from '../shared/indent'
import { isRemoteUrl } from '../shared/node-helpers'
import { itemTargets } from '../shared/screens'
import type { ExportPlan, ScreenRef } from '../shared/screens'
import { colorTokenComment, swiftColorExpr, swiftString } from './swift-utils'

const SWIFT_KEYWORDS = new Set([
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout', 'internal',
  'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static', 'struct',
  'subscript', 'typealias', 'var', 'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough',
  'for', 'guard', 'if', 'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while', 'Any', 'as', 'await', 'false',
  'is', 'nil', 'self', 'Self', 'super', 'throws', 'true', 'try',
])

// Cas de l'enum `Route` d'un ecran : lowerCamelCase du nom, entre accents
// graves quand c'est un mot reserve.
export function routeCase(ref: ScreenRef): string {
  const name = ref.pascal.charAt(0).toLowerCase() + ref.pascal.slice(1)
  return SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name
}

export type SwiftEnvCtx = {
  tokens: DesignTokens
  plan: ExportPlan
  // Declarations @State de la vue (`@State private var x = 0`).
  states: string[]
  // Modificateurs de presentation a poser sur la vue racine (alert, sheet...).
  presentations: string[][]
  // `navigator` est reference.
  markNavigator(): void
  // Expressions Swift des interactions d'un noeud (null : aucune).
  act(node: import('@maquio/core').Node): { tap: string | null; longPress: string | null }
  nextIndex(): number
  // Rend les enfants d'un conteneur (callback du moteur principal).
  renderChildren(children: ComponentNodeChildren, depth: number): string[]
}

export type ComponentNodeChildren = import('@maquio/core').Node[]

export type SwEnv = { ctx: SwiftEnvCtx }

const num = formatNumber

function color(env: SwEnv, c: Color): string {
  return swiftColorExpr(c, env.ctx.tokens)
}

function colorLine(env: SwEnv, c: Color | undefined, fallback: string): string {
  return c === undefined ? fallback : color(env, c)
}

function systemImage(name: IconName): string {
  return `Image(systemName: ${swiftString(ICONS[name].sfSymbol)})`
}

export function goExpr(env: SwEnv, ref: ScreenRef): string {
  env.ctx.markNavigator()
  return `navigator.go(.${routeCase(ref)})`
}

function action(_env: SwEnv, expr: string | null): string {
  return expr === null ? '{}' : `{ ${expr} }`
}

function epochSeconds(value: string): number {
  const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10))
  return Date.UTC(y!, m! - 1, d!) / 1000
}

// Rend un composant a `depth`, taille incluse (`.frame(width:height:)`) ;
// le moteur principal ajoute le decalage (`.offset`) et l'opacite. Un dialogue
// ne rend rien ici : c'est une presentation posee sur la vue racine.
export function renderSwiftComponent(node: ComponentNode, env: SwEnv, depth: number): string[] {
  const lines = renderBare(node, env, depth)
  if (lines.length === 0 || node.kind === 'snackbar') return lines
  return [...lines, `${pad(depth + 1)}.frame(width: ${num(node.frame.w)}, height: ${num(node.frame.h)})`]
}

function renderBare(node: ComponentNode, env: SwEnv, depth: number): string[] {
  const link = env.ctx.act(node).tap
  const p0 = pad(depth)
  const p1 = pad(depth + 1)
  const p2 = pad(depth + 2)
  const w = node.frame.w
  const h = node.frame.h

  switch (node.kind) {
    case 'button': {
      const p = node.props
      const label =
        p.icon !== undefined
          ? `Label(${swiftString(p.label)}, systemImage: ${swiftString(ICONS[p.icon].sfSymbol)})`
          : `Text(${swiftString(p.label)})`
      const style = p.variant === 'primary' ? '.borderedProminent' : p.variant === 'secondary' ? '.bordered' : '.borderless'
      const lines = [
        `${p0}Button ${action(env, link)} label: {`,
        `${p1}${label}`,
        `${p2}.frame(maxWidth: .infinity, maxHeight: .infinity)`,
        `${p0}}`,
        `${p1}.buttonStyle(${style})`,
      ]
      if (p.color) lines.push(`${p1}.tint(${color(env, p.color)})${colorTokenComment(p.color, env.ctx.tokens)}`)
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'iconButton': {
      const p = node.props
      const lines = [`${p0}Button ${action(env, link)} label: {`, `${p1}${systemImage(p.icon)}`, `${p0}}`]
      if (p.variant === 'standard') lines.push(`${p1}.buttonStyle(.plain)`)
      else lines.push(`${p1}.buttonStyle(${p.variant === 'filled' ? '.borderedProminent' : '.bordered'})`, `${p1}.buttonBorderShape(.circle)`)
      if (p.color) lines.push(`${p1}.tint(${color(env, p.color)})${colorTokenComment(p.color, env.ctx.tokens)}`)
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'fab': {
      const p = node.props
      const radius = p.size === 'large' ? 28 : p.size === 'small' ? 12 : 16
      const label =
        p.label !== ''
          ? `Label(${swiftString(p.label)}, systemImage: ${swiftString(ICONS[p.icon].sfSymbol)})`
          : systemImage(p.icon)
      return [
        `${p0}Button ${action(env, link)} label: {`,
        `${p1}${label}`,
        `${p2}.frame(maxWidth: .infinity, maxHeight: .infinity)`,
        `${p0}}`,
        `${p1}.buttonStyle(.borderedProminent)`,
        `${p1}.tint(${colorLine(env, p.color, 'Color(red: 0.9176, green: 0.8667, blue: 1.0000, opacity: 1.0000)')})`,
        `${p1}.foregroundColor(Color(red: 0.1294, green: 0.0000, blue: 0.3647, opacity: 1.0000))`,
        `${p1}.clipShape(RoundedRectangle(cornerRadius: ${radius}))`,
        `${p1}.shadow(radius: 4)`,
      ]
    }
    case 'textField': {
      const p = node.props
      const field = p.password
        ? `SecureField(${swiftString(p.placeholder)}, text: .constant(${swiftString(p.value)}))`
        : p.multiline
          ? `TextField(${swiftString(p.placeholder)}, text: .constant(${swiftString(p.value)}), axis: .vertical)`
          : `TextField(${swiftString(p.placeholder)}, text: .constant(${swiftString(p.value)}))`
      const error = p.errorText !== ''
      const lines = [`${p0}VStack(alignment: .leading, spacing: 4) {`]
      if (p.label !== '') {
        lines.push(`${p1}Text(${swiftString(p.label)})`, `${p2}.font(.caption)`, `${p2}.foregroundColor(${error ? '.red' : '.secondary'})`)
      }
      lines.push(`${p1}HStack {`)
      if (p.leadingIcon !== undefined) lines.push(`${p2}${systemImage(p.leadingIcon)}`, `${pad(depth + 3)}.foregroundColor(.secondary)`)
      lines.push(`${p2}${field}`)
      if (p.multiline) lines.push(`${pad(depth + 3)}.lineLimit(${Math.max(2, Math.round((h - 32) / 24))}...)`)
      lines.push(`${p1}}`, `${p2}.padding(12)`, `${p2}.overlay(RoundedRectangle(cornerRadius: 4).stroke(${error ? 'Color.red' : 'Color.gray'}))`)
      if (p.disabled) lines.push(`${p2}.disabled(true)`)
      const note = error ? p.errorText : p.helperText
      if (note !== '') lines.push(`${p1}Text(${swiftString(note)})`, `${p2}.font(.caption)`, `${p2}.foregroundColor(${error ? '.red' : '.secondary'})`)
      lines.push(`${p0}}`)
      return lines
    }
    case 'checkbox':
    case 'radio': {
      const p = node.props
      const on = node.kind === 'checkbox' ? (p as { checked: boolean }).checked : (p as { selected: boolean }).selected
      const symbol =
        node.kind === 'checkbox' ? (on ? 'checkmark.square.fill' : 'square') : on ? 'largecircle.fill.circle' : 'circle'
      const lines = [
        `${p0}Button {} label: {`,
        `${p1}HStack(spacing: 12) {`,
        `${p2}Image(systemName: ${swiftString(symbol)})`,
        `${p2}Text(${swiftString((p as { label: string }).label)})`,
        `${p1}}`,
        `${p0}}`,
        `${p1}.buttonStyle(.plain)`,
      ]
      if ((p as { disabled: boolean }).disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'switch': {
      const p = node.props
      const lines = [`${p0}Toggle(${swiftString(p.label)}, isOn: .constant(${p.checked}))`]
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'slider': {
      const p = node.props
      const lines = [`${p0}Slider(value: .constant(${num(p.value)}), in: ${num(p.min)}...${num(p.max)})`]
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'dropdown': {
      const p = node.props
      const selected = p.selectedIndex >= 0 ? swiftString(p.options[p.selectedIndex]!) : '""'
      const lines = [`${p0}Picker(${swiftString(p.label)}, selection: .constant(${selected})) {`]
      for (const option of p.options) lines.push(`${p1}Text(${swiftString(option)}).tag(${swiftString(option)})`)
      lines.push(`${p0}}`, `${p1}.pickerStyle(.menu)`)
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'datePicker': {
      const p = node.props
      const date = p.value === '' ? 'Date()' : `Date(timeIntervalSince1970: ${epochSeconds(p.value)})`
      const lines = [`${p0}DatePicker(${swiftString(p.label)}, selection: .constant(${date}), displayedComponents: .date)`]
      if (p.disabled) lines.push(`${p1}.disabled(true)`)
      return lines
    }
    case 'icon': {
      const p = node.props
      const lines = [`${p0}${systemImage(p.name)}`, `${p1}.font(.system(size: ${num(p.size)}))`]
      if (p.color) lines.push(`${p1}.foregroundColor(${color(env, p.color)})${colorTokenComment(p.color, env.ctx.tokens)}`)
      return lines
    }
    case 'avatar': {
      const p = node.props
      const fill = colorLine(env, p.color, 'Color(red: 0.9176, green: 0.8667, blue: 1.0000, opacity: 1.0000)')
      if (p.src !== '') {
        const image = isRemoteUrl(p.src)
          ? [`${p0}AsyncImage(url: URL(string: ${swiftString(p.src)})!) { image in`, `${p1}image.resizable().scaledToFill()`, `${p0}} placeholder: {`, `${p1}ProgressView()`, `${p0}}`]
          : [`${p0}Image(${swiftString(p.src)})`, `${p1}.resizable()`, `${p1}.scaledToFill()`]
        return [...image, `${p1}.clipShape(Circle())`]
      }
      return [
        `${p0}ZStack {`,
        `${p1}Circle().fill(${fill})`,
        `${p1}Text(${swiftString(p.initials)})`,
        `${p2}.font(.headline)`,
        `${p2}.foregroundColor(Color(red: 0.1294, green: 0.0000, blue: 0.3647, opacity: 1.0000))`,
        `${p0}}`,
      ]
    }
    case 'badge': {
      const p = node.props
      const fill = colorLine(env, p.color, 'Color.red')
      if (p.text === '') return [`${p0}Circle().fill(${fill})`]
      return [
        `${p0}Text(${swiftString(p.text)})`,
        `${p1}.font(.caption2)`,
        `${p1}.foregroundColor(.white)`,
        `${p1}.padding(.horizontal, 6)`,
        `${p1}.background(Capsule().fill(${fill}))`,
      ]
    }
    case 'chip': {
      const p = node.props
      const selected = p.variant === 'filter' && p.selected
      const label =
        selected
          ? `Label(${swiftString(p.label)}, systemImage: "checkmark")`
          : p.icon !== undefined
            ? `Label(${swiftString(p.label)}, systemImage: ${swiftString(ICONS[p.icon].sfSymbol)})`
            : `Text(${swiftString(p.label)})`
      return [
        `${p0}Button ${action(env, link)} label: {`,
        `${p1}${label}`,
        `${p0}}`,
        `${p1}.buttonStyle(${selected ? '.borderedProminent' : '.bordered'})`,
        `${p1}.buttonBorderShape(.roundedRectangle(radius: 8))`,
        ...(selected ? [`${p1}.tint(Color(red: 0.9098, green: 0.8706, blue: 0.9725, opacity: 1.0000))`, `${p1}.foregroundColor(.primary)`] : []),
      ]
    }
    case 'divider': {
      const p = node.props
      if (!p.vertical && p.thickness === 1 && p.indent === 0 && p.color === undefined) return [`${p0}Divider()`]
      const fill = colorLine(env, p.color, 'Color.gray.opacity(0.3)')
      return p.vertical
        ? [`${p0}Rectangle()`, `${p1}.fill(${fill})`, `${p1}.frame(width: ${num(p.thickness)})`, `${p1}.padding(.top, ${num(p.indent)})`]
        : [`${p0}Rectangle()`, `${p1}.fill(${fill})`, `${p1}.frame(height: ${num(p.thickness)})`, `${p1}.padding(.leading, ${num(p.indent)})`]
    }
    case 'progressBar': {
      const p = node.props
      const lines = [p.indeterminate ? `${p0}ProgressView()` : `${p0}ProgressView(value: ${num(p.value)})`, `${p1}.progressViewStyle(.linear)`]
      if (p.color) lines.push(`${p1}.tint(${color(env, p.color)})`)
      return lines
    }
    case 'spinner': {
      const p = node.props
      const lines = [`${p0}ProgressView()`]
      if (p.color) lines.push(`${p1}.tint(${color(env, p.color)})`)
      return lines
    }
    case 'listTile': {
      const p = node.props
      const lines = [`${p0}Button ${action(env, link)} label: {`, `${p1}HStack(spacing: 16) {`]
      if (p.leadingIcon !== undefined) lines.push(`${p2}${systemImage(p.leadingIcon)}`, `${pad(depth + 3)}.foregroundColor(.secondary)`)
      lines.push(`${p2}VStack(alignment: .leading) {`, `${pad(depth + 3)}Text(${swiftString(p.title)})`)
      if (p.subtitle !== '') lines.push(`${pad(depth + 3)}Text(${swiftString(p.subtitle)})`, `${pad(depth + 4)}.font(.subheadline)`, `${pad(depth + 4)}.foregroundColor(.secondary)`)
      lines.push(`${p2}}`, `${p2}Spacer()`)
      if (p.trailingIcon !== undefined) lines.push(`${p2}${systemImage(p.trailingIcon)}`, `${pad(depth + 3)}.foregroundColor(.secondary)`)
      lines.push(`${p1}}`, `${p1}.padding(.horizontal, 16)`, `${p0}}`, `${p1}.buttonStyle(.plain)`)
      return lines
    }
    case 'spacer':
      return [`${p0}Spacer()`]
    case 'appBar': {
      // Barre d'application hors emplacement natif (deuxieme barre) : simple en-tete.
      const p = node.props
      const lines = [`${p0}HStack(spacing: 8) {`]
      if (p.leading === 'back') lines.push(`${p1}${systemImage('arrowBack')}`)
      if (p.leading === 'menu') lines.push(`${p1}${systemImage('menu')}`)
      lines.push(`${p1}Text(${swiftString(p.title)})`, `${p2}.font(.title2)`, `${p1}Spacer()`)
      for (const name of p.actions) lines.push(`${p1}${systemImage(name)}`)
      lines.push(`${p0}}`, `${p1}.padding(.horizontal, 16)`)
      return lines
    }
    case 'bottomNav': {
      // TabView natif : le contenu des onglets est vide (la navigation passe
      // par le Navigator), seule la barre d'onglets est affichee.
      const index = env.ctx.nextIndex()
      const stateName = `tab${index}`
      env.ctx.states.push(`@State private var ${stateName} = ${node.props.selectedIndex}`)
      const targets = itemTargets(node, env.ctx.plan)
      const lines = [`${p0}TabView(selection: $${stateName}) {`]
      node.props.items.forEach((item, i) => {
        lines.push(
          `${p1}Color.clear`,
          `${p2}.tabItem { Label(${swiftString(item.label)}, systemImage: ${swiftString(ICONS[item.icon].sfSymbol)}) }`,
          `${p2}.tag(${i})`,
        )
      })
      lines.push(`${p0}}`)
      if (targets.some((t) => t !== null)) {
        env.ctx.markNavigator()
        lines.push(`${p1}.onChange(of: ${stateName}) { _, index in`)
        lines.push(`${p2}switch index {`)
        targets.forEach((t, i) => {
          if (t !== null) lines.push(`${p2}case ${i}: navigator.switchTo(.${routeCase(t)})`)
        })
        lines.push(`${p2}default: break`, `${p2}}`, `${p1}}`)
      }
      return lines
    }
    case 'tabs': {
      const index = env.ctx.nextIndex()
      const stateName = `topTab${index}`
      env.ctx.states.push(`@State private var ${stateName} = ${node.props.selectedIndex}`)
      const targets = itemTargets(node, env.ctx.plan)
      const lines = [`${p0}Picker("", selection: $${stateName}) {`]
      node.props.items.forEach((item, i) => {
        const label = item.icon !== undefined ? `Label(${swiftString(item.label)}, systemImage: ${swiftString(ICONS[item.icon].sfSymbol)})` : `Text(${swiftString(item.label)})`
        lines.push(`${p1}${label}.tag(${i})`)
      })
      lines.push(`${p0}}`, `${p1}.pickerStyle(.segmented)`)
      if (targets.some((t) => t !== null)) {
        env.ctx.markNavigator()
        lines.push(`${p1}.onChange(of: ${stateName}) { _, index in`, `${p2}switch index {`)
        targets.forEach((t, i) => {
          if (t !== null) lines.push(`${p2}case ${i}: navigator.switchTo(.${routeCase(t)})`)
        })
        lines.push(`${p2}default: break`, `${p2}}`, `${p1}}`)
      }
      return lines
    }
    case 'dialog': {
      // Un dialogue est une presentation (`.alert`) posee sur la vue racine,
      // pas un noeud positionne : voir swiftui.ts. Rien a placer ici.
      const p = node.props
      const index = env.ctx.nextIndex()
      const state = `showAlert${index}`
      env.ctx.states.push(`@State private var ${state} = true`)
      const lines = [`.alert(${swiftString(p.title)}, isPresented: $${state}) {`]
      if (p.cancelLabel !== '') lines.push(`    Button(${swiftString(p.cancelLabel)}, role: .cancel) {}`)
      // « Valider » joue l'interaction du dialogue (l'alerte se ferme d'elle-meme).
      const onTap = env.ctx.act(node).tap
      if (onTap === null) lines.push(`    Button(${swiftString(p.confirmLabel)}) {}`)
      else lines.push(`    Button(${swiftString(p.confirmLabel)}) {`, `        ${onTap}`, `    }`)
      lines.push(`} message: {`, `    Text(${swiftString(p.message)})`, `}`)
      env.ctx.presentations.push(lines)
      return []
    }
    case 'snackbar': {
      const p = node.props
      const lines = [
        `${p0}HStack {`,
        `${p1}Text(${swiftString(p.message)})`,
        `${p2}.foregroundColor(Color(red: 0.9608, green: 0.9373, blue: 0.9686, opacity: 1.0000))`,
        `${p1}Spacer()`,
      ]
      if (p.actionLabel !== '') lines.push(`${p1}Text(${swiftString(p.actionLabel)})`, `${p2}.fontWeight(.medium)`, `${p2}.foregroundColor(Color(red: 0.8157, green: 0.7373, blue: 1.0000, opacity: 1.0000))`)
      lines.push(
        `${p0}}`,
        `${p1}.padding(.horizontal, 16)`,
        `${p1}.frame(width: ${num(w)}, height: ${num(h)})`,
        `${p1}.background(Color(red: 0.1961, green: 0.1843, blue: 0.2078, opacity: 1.0000))`,
        `${p1}.cornerRadius(4)`,
        `${p1}.shadow(radius: 4)`,
      )
      return lines
    }
  }
}
