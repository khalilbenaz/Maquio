// Composants mobiles semantiques vers Jetpack Compose (Material 3) : Button,
// OutlinedTextField, Switch, Slider, ExposedDropdownMenuBox, DatePickerDialog,
// ListItem, TopAppBar, NavigationBar, TabRow, AlertDialog, ModalBottomSheet...
// Les icones viennent de material-icons-core (Icons.Default.* /
// Icons.AutoMirrored.Filled.*), sans la dependance « extended ».
import type { Color, ComponentNode, DesignTokens, IconName } from '@calque/core'
import { ICONS } from '@calque/core'
import { formatNumber } from '../shared/format-number'
import { pad } from '../shared/indent'
import { isRemoteUrl } from '../shared/node-helpers'
import { itemTargets, linkTargetOf } from '../shared/screens'
import type { ExportPlan, ScreenRef } from '../shared/screens'
import { composeColorExpr, kotlinString } from './kotlin-utils'

export type ComposeEnvCtx = {
  tokens: DesignTokens
  plan: ExportPlan
  imports: Set<string>
  // Variables d'etat declarees a l'emplacement du composant (`remember`).
  nextIndex(): number
  // Le composable utilise le NavController de l'ecran.
  markNavigation(): void
  // Un opt-in a une API experimentale de Material 3 est necessaire.
  markExperimental(): void
}

export type CEnv = {
  ctx: ComposeEnvCtx
  // Le parent est une Row/Column (Spacer avec weight).
  inFlex: boolean
}

const dp = (v: number): string => `${formatNumber(v)}.dp`

function imp(env: CEnv, ...names: string[]): void {
  for (const n of names) env.ctx.imports.add(n)
}

const MIRRORED = new Set(['ArrowBack', 'ArrowForward', 'KeyboardArrowRight', 'List', 'Send'])

export function iconExpr(env: CEnv, name: IconName): string {
  const id = ICONS[name].compose
  imp(env, 'androidx.compose.material.icons.Icons')
  if (MIRRORED.has(id)) {
    imp(env, `androidx.compose.material.icons.automirrored.filled.${id}`)
    return `Icons.AutoMirrored.Filled.${id}`
  }
  imp(env, `androidx.compose.material.icons.filled.${id}`)
  return `Icons.Default.${id}`
}

function color(env: CEnv, c: Color): string {
  imp(env, 'androidx.compose.ui.graphics.Color')
  return composeColorExpr(c, env.ctx.tokens)
}

function iconCall(env: CEnv, name: IconName, extra = ''): string {
  imp(env, 'androidx.compose.material3.Icon')
  return `Icon(${iconExpr(env, name)}, contentDescription = null${extra})`
}

function text(env: CEnv, value: string, extra = ''): string {
  imp(env, 'androidx.compose.material3.Text')
  return `Text(${kotlinString(value)}${extra})`
}

export function navigateExpr(env: CEnv, ref: ScreenRef, replace = false): string {
  env.ctx.markNavigation()
  return replace
    ? `navController.navigate(${kotlinString(ref.snake)}) { launchSingleTop = true }`
    : `navController.navigate(${kotlinString(ref.snake)})`
}

function click(env: CEnv, ref: ScreenRef | null): string {
  return ref === null ? '{}' : `{ ${navigateExpr(env, ref)} }`
}

function widthMod(env: CEnv, w: number): string {
  imp(env, 'androidx.compose.ui.Modifier', 'androidx.compose.foundation.layout.width', 'androidx.compose.ui.unit.dp')
  return `Modifier.width(${dp(w)})`
}

// Appelle `name(args...) { body }` ou `name(args...)` sur plusieurs lignes.
function call(depth: number, name: string, args: string[], body: string[] | null = null): string[] {
  const p0 = pad(depth)
  const p1 = pad(depth + 1)
  const lines = [`${p0}${name}(`, ...args.map((a) => `${p1}${a},`)]
  if (body === null) return [...lines, `${p0})`]
  return [...lines, `${p0}) {`, ...body, `${p0}}`]
}

// Rend un composant : `modifier` est la chaine de modificateurs complete
// (taille, decalage) fournie par l'appelant. Dialogues et feuilles ne rendent
// rien en place (presentations).
export function renderComposeComponent(node: ComponentNode, env: CEnv, depth: number, modifier: string): string[] {
  const link = linkTargetOf(node, env.ctx.plan)
  const w = node.frame.w
  const h = node.frame.h
  const mod = `modifier = ${modifier}`

  switch (node.kind) {
    case 'button': {
      const p = node.props
      const widget = p.variant === 'primary' ? 'Button' : p.variant === 'secondary' ? 'OutlinedButton' : 'TextButton'
      imp(env, `androidx.compose.material3.${widget}`)
      const args = [`onClick = ${click(env, link)}`, mod]
      if (p.disabled) args.push('enabled = false')
      if (p.color) {
        imp(env, 'androidx.compose.material3.ButtonDefaults')
        args.push(
          p.variant === 'primary'
            ? `colors = ButtonDefaults.buttonColors(containerColor = ${color(env, p.color)})`
            : p.variant === 'secondary'
              ? `colors = ButtonDefaults.outlinedButtonColors(contentColor = ${color(env, p.color)})`
              : `colors = ButtonDefaults.textButtonColors(contentColor = ${color(env, p.color)})`,
        )
      }
      const body: string[] = []
      if (p.icon !== undefined) {
        imp(env, 'androidx.compose.foundation.layout.Spacer', 'androidx.compose.foundation.layout.size', 'androidx.compose.ui.Modifier', 'androidx.compose.ui.unit.dp')
        body.push(iconCall(env, p.icon, ', modifier = Modifier.size(18.dp)'), 'Spacer(Modifier.size(8.dp))')
      }
      body.push(text(env, p.label))
      return call(depth, widget, args, body.map((l) => pad(depth + 1) + l))
    }
    case 'iconButton': {
      const p = node.props
      const widget = p.variant === 'standard' ? 'IconButton' : p.variant === 'filled' ? 'FilledIconButton' : 'OutlinedIconButton'
      imp(env, `androidx.compose.material3.${widget}`)
      const args = [`onClick = ${click(env, link)}`, mod]
      if (p.disabled) args.push('enabled = false')
      return call(depth, widget, args, [pad(depth + 1) + iconCall(env, p.icon)])
    }
    case 'fab': {
      const p = node.props
      if (p.label !== '') {
        imp(env, 'androidx.compose.material3.ExtendedFloatingActionButton')
        const args = [`onClick = ${click(env, link)}`, `icon = { ${iconCall(env, p.icon)} }`, `text = { ${text(env, p.label)} }`, mod]
        if (p.color) args.push(`containerColor = ${color(env, p.color)}`)
        return call(depth, 'ExtendedFloatingActionButton', args)
      }
      const widget = p.size === 'small' ? 'SmallFloatingActionButton' : p.size === 'large' ? 'LargeFloatingActionButton' : 'FloatingActionButton'
      imp(env, `androidx.compose.material3.${widget}`)
      const args = [`onClick = ${click(env, link)}`, mod]
      if (p.color) args.push(`containerColor = ${color(env, p.color)}`)
      return call(depth, widget, args, [pad(depth + 1) + iconCall(env, p.icon)])
    }
    case 'textField': {
      const p = node.props
      imp(env, 'androidx.compose.material3.OutlinedTextField')
      const args = [`value = ${kotlinString(p.value)}`, 'onValueChange = {}', `modifier = ${widthMod(env, w)}`]
      if (p.label !== '') args.push(`label = { ${text(env, p.label)} }`)
      if (p.placeholder !== '') args.push(`placeholder = { ${text(env, p.placeholder)} }`)
      if (p.leadingIcon !== undefined) args.push(`leadingIcon = { ${iconCall(env, p.leadingIcon)} }`)
      if (p.password) {
        imp(env, 'androidx.compose.ui.text.input.PasswordVisualTransformation')
        args.push('visualTransformation = PasswordVisualTransformation()')
      }
      if (p.multiline) args.push(`minLines = ${Math.max(2, Math.round((h - 32) / 24))}`)
      else args.push('singleLine = true')
      if (p.errorText !== '') args.push('isError = true', `supportingText = { ${text(env, p.errorText)} }`)
      else if (p.helperText !== '') args.push(`supportingText = { ${text(env, p.helperText)} }`)
      if (p.disabled) args.push('enabled = false')
      return call(depth, 'OutlinedTextField', args)
    }
    case 'checkbox':
    case 'radio': {
      const p = node.props as { label: string; disabled: boolean }
      const on = node.kind === 'checkbox' ? (node.props as { checked: boolean }).checked : (node.props as { selected: boolean }).selected
      imp(env, 'androidx.compose.foundation.layout.Row', 'androidx.compose.ui.Alignment', 'androidx.compose.foundation.layout.Spacer', 'androidx.compose.foundation.layout.width', 'androidx.compose.ui.Modifier', 'androidx.compose.ui.unit.dp')
      const control =
        node.kind === 'checkbox'
          ? (imp(env, 'androidx.compose.material3.Checkbox'), `Checkbox(checked = ${on}, onCheckedChange = null${p.disabled ? ', enabled = false' : ''})`)
          : (imp(env, 'androidx.compose.material3.RadioButton'), `RadioButton(selected = ${on}, onClick = null${p.disabled ? ', enabled = false' : ''})`)
      return call(depth, 'Row', [mod, 'verticalAlignment = Alignment.CenterVertically'], [pad(depth + 1) + control, `${pad(depth + 1)}Spacer(Modifier.width(12.dp))`, pad(depth + 1) + text(env, p.label)])
    }
    case 'switch': {
      const p = node.props
      imp(env, 'androidx.compose.foundation.layout.Row', 'androidx.compose.foundation.layout.Arrangement', 'androidx.compose.ui.Alignment', 'androidx.compose.material3.Switch')
      return call(
        depth,
        'Row',
        [mod, 'horizontalArrangement = Arrangement.SpaceBetween', 'verticalAlignment = Alignment.CenterVertically'],
        [pad(depth + 1) + text(env, p.label), `${pad(depth + 1)}Switch(checked = ${p.checked}, onCheckedChange = null${p.disabled ? ', enabled = false' : ''})`],
      )
    }
    case 'slider': {
      const p = node.props
      imp(env, 'androidx.compose.material3.Slider')
      const args = [`value = ${num(p.value)}f`, 'onValueChange = {}', `valueRange = ${num(p.min)}f..${num(p.max)}f`, mod]
      if (p.disabled) args.push('enabled = false')
      return call(depth, 'Slider', args)
    }
    case 'dropdown': {
      const p = node.props
      env.ctx.markExperimental()
      imp(
        env,
        'androidx.compose.material3.ExposedDropdownMenuBox',
        'androidx.compose.material3.ExposedDropdownMenuDefaults',
        'androidx.compose.material3.DropdownMenuItem',
        'androidx.compose.material3.OutlinedTextField',
        'androidx.compose.material3.MenuAnchorType',
        'androidx.compose.runtime.getValue',
        'androidx.compose.runtime.mutableStateOf',
        'androidx.compose.runtime.remember',
        'androidx.compose.runtime.setValue',
      )
      const i = env.ctx.nextIndex()
      const initial = p.selectedIndex >= 0 ? p.options[p.selectedIndex]! : ''
      const p1 = pad(depth + 1)
      const p2 = pad(depth + 2)
      const p3 = pad(depth + 3)
      const lines = [
        `${pad(depth)}var expanded${i} by remember { mutableStateOf(false) }`,
        `${pad(depth)}var selected${i} by remember { mutableStateOf(${kotlinString(initial)}) }`,
        `${pad(depth)}ExposedDropdownMenuBox(`,
        `${p1}expanded = expanded${i},`,
        `${p1}onExpandedChange = { expanded${i} = it },`,
        `${p1}${mod},`,
        `${pad(depth)}) {`,
        `${p1}OutlinedTextField(`,
        `${p2}value = selected${i},`,
        `${p2}onValueChange = {},`,
        `${p2}readOnly = true,`,
        `${p2}label = { ${text(env, p.label)} },`,
        `${p2}trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded${i}) },`,
        `${p2}modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable),`,
        ...(p.disabled ? [`${p2}enabled = false,`] : []),
        `${p1})`,
        `${p1}ExposedDropdownMenu(expanded = expanded${i}, onDismissRequest = { expanded${i} = false }) {`,
      ]
      for (const option of p.options) {
        lines.push(`${p2}DropdownMenuItem(`, `${p3}text = { ${text(env, option)} },`, `${p3}onClick = {`, `${pad(depth + 4)}selected${i} = ${kotlinString(option)}`, `${pad(depth + 4)}expanded${i} = false`, `${p3}},`, `${p2})`)
      }
      lines.push(`${p1}}`, `${pad(depth)}}`)
      imp(env, 'androidx.compose.ui.Modifier')
      return lines
    }
    case 'datePicker': {
      const p = node.props
      env.ctx.markExperimental()
      imp(
        env,
        'androidx.compose.material3.OutlinedTextField',
        'androidx.compose.material3.IconButton',
        'androidx.compose.material3.DatePicker',
        'androidx.compose.material3.DatePickerDialog',
        'androidx.compose.material3.TextButton',
        'androidx.compose.material3.rememberDatePickerState',
        'androidx.compose.runtime.getValue',
        'androidx.compose.runtime.mutableStateOf',
        'androidx.compose.runtime.remember',
        'androidx.compose.runtime.setValue',
      )
      const i = env.ctx.nextIndex()
      const p1 = pad(depth + 1)
      const p2 = pad(depth + 2)
      return [
        `${pad(depth)}var showDate${i} by remember { mutableStateOf(false) }`,
        `${pad(depth)}OutlinedTextField(`,
        `${p1}value = ${kotlinString(p.value)},`,
        `${p1}onValueChange = {},`,
        `${p1}readOnly = true,`,
        `${p1}label = { ${text(env, p.label)} },`,
        `${p1}trailingIcon = { IconButton(onClick = { showDate${i} = true }) { ${iconCall(env, 'calendar')} } },`,
        `${p1}${mod},`,
        ...(p.disabled ? [`${p1}enabled = false,`] : []),
        `${pad(depth)})`,
        `${pad(depth)}if (showDate${i}) {`,
        `${p1}val dateState${i} = rememberDatePickerState()`,
        `${p1}DatePickerDialog(`,
        `${p2}onDismissRequest = { showDate${i} = false },`,
        `${p2}confirmButton = { TextButton(onClick = { showDate${i} = false }) { ${text(env, 'OK')} } },`,
        `${p1}) {`,
        `${p2}DatePicker(state = dateState${i})`,
        `${p1}}`,
        `${pad(depth)}}`,
      ]
    }
    case 'icon': {
      const p = node.props
      imp(env, 'androidx.compose.material3.Icon', 'androidx.compose.foundation.layout.size', 'androidx.compose.ui.Modifier', 'androidx.compose.ui.unit.dp')
      const args = [iconExpr(env, p.name), 'contentDescription = null', `modifier = ${modifier}`]
      if (p.color) args.push(`tint = ${color(env, p.color)}`)
      return call(depth, 'Icon', args)
    }
    case 'avatar': {
      const p = node.props
      imp(env, 'androidx.compose.foundation.layout.Box', 'androidx.compose.foundation.shape.CircleShape', 'androidx.compose.ui.draw.clip', 'androidx.compose.ui.Alignment')
      if (p.src !== '' && isRemoteUrl(p.src)) {
        imp(env, 'coil.compose.AsyncImage', 'androidx.compose.ui.layout.ContentScale')
        return call(depth, 'AsyncImage', [`model = ${kotlinString(p.src)}`, 'contentDescription = null', 'contentScale = ContentScale.Crop', `modifier = ${modifier}.clip(CircleShape)`])
      }
      imp(env, 'androidx.compose.foundation.background')
      const fill = p.color ? color(env, p.color) : 'MaterialTheme.colorScheme.primaryContainer'
      if (!p.color) imp(env, 'androidx.compose.material3.MaterialTheme')
      return call(depth, 'Box', [`modifier = ${modifier}.clip(CircleShape).background(${fill})`, 'contentAlignment = Alignment.Center'], [pad(depth + 1) + text(env, p.initials)])
    }
    case 'badge': {
      const p = node.props
      imp(env, 'androidx.compose.material3.Badge')
      const args: string[] = []
      if (p.color) args.push(`containerColor = ${color(env, p.color)}`)
      return p.text === '' ? call(depth, 'Badge', args) : call(depth, 'Badge', args, [pad(depth + 1) + text(env, p.text)])
    }
    case 'chip': {
      const p = node.props
      if (p.variant === 'filter') {
        imp(env, 'androidx.compose.material3.FilterChip')
        const args = [`selected = ${p.selected}`, 'onClick = {}', `label = { ${text(env, p.label)} }`, mod]
        if (p.selected) args.push(`leadingIcon = { ${iconCall(env, 'check')} }`)
        else if (p.icon !== undefined) args.push(`leadingIcon = { ${iconCall(env, p.icon)} }`)
        return call(depth, 'FilterChip', args)
      }
      imp(env, 'androidx.compose.material3.AssistChip')
      const args = [`onClick = ${click(env, link)}`, `label = { ${text(env, p.label)} }`, mod]
      if (p.icon !== undefined) args.push(`leadingIcon = { ${iconCall(env, p.icon)} }`)
      return call(depth, 'AssistChip', args)
    }
    case 'divider': {
      const p = node.props
      imp(env, p.vertical ? 'androidx.compose.material3.VerticalDivider' : 'androidx.compose.material3.HorizontalDivider', 'androidx.compose.ui.unit.dp')
      const args = [`thickness = ${dp(p.thickness)}`, mod]
      if (p.color) args.push(`color = ${color(env, p.color)}`)
      return call(depth, p.vertical ? 'VerticalDivider' : 'HorizontalDivider', args)
    }
    case 'progressBar': {
      const p = node.props
      imp(env, 'androidx.compose.material3.LinearProgressIndicator')
      const args = p.indeterminate ? [mod] : [`progress = { ${num(p.value)}f }`, mod]
      if (p.color) args.push(`color = ${color(env, p.color)}`)
      return call(depth, 'LinearProgressIndicator', args)
    }
    case 'spinner': {
      const p = node.props
      imp(env, 'androidx.compose.material3.CircularProgressIndicator')
      const args = [mod]
      if (p.color) args.push(`color = ${color(env, p.color)}`)
      return call(depth, 'CircularProgressIndicator', args)
    }
    case 'listTile': {
      const p = node.props
      imp(env, 'androidx.compose.material3.ListItem')
      const args = [`headlineContent = { ${text(env, p.title)} }`]
      if (p.subtitle !== '') args.push(`supportingContent = { ${text(env, p.subtitle)} }`)
      if (p.leadingIcon !== undefined) args.push(`leadingContent = { ${iconCall(env, p.leadingIcon)} }`)
      if (p.trailingIcon !== undefined) args.push(`trailingContent = { ${iconCall(env, p.trailingIcon)} }`)
      if (link !== null) {
        imp(env, 'androidx.compose.foundation.clickable')
        args.push(`modifier = ${modifier}.clickable ${click(env, link)}`)
      } else {
        args.push(mod)
      }
      return call(depth, 'ListItem', args)
    }
    case 'spacer': {
      const p = node.props
      imp(env, 'androidx.compose.foundation.layout.Spacer', 'androidx.compose.ui.Modifier')
      if (env.inFlex) {
        imp(env, 'androidx.compose.foundation.layout.size')
        return [`${pad(depth)}Spacer(modifier = Modifier.weight(${p.flex}f))`]
      }
      return [`${pad(depth)}Spacer(modifier = ${modifier})`]
    }
    case 'appBar':
      // La barre est rendue par l'emplacement `topBar` du Scaffold (compose.ts) ;
      // une deuxieme barre dans le corps est un simple TopAppBar.
      return renderTopAppBar(node, env, depth, modifier)
    case 'bottomNav': {
      const p = node.props
      imp(env, 'androidx.compose.material3.NavigationBar', 'androidx.compose.material3.NavigationBarItem')
      const targets = itemTargets(node, env.ctx.plan)
      const lines = [`${pad(depth)}NavigationBar(modifier = ${modifier}) {`]
      p.items.forEach((item, i) => {
        const t = targets[i] ?? null
        lines.push(
          `${pad(depth + 1)}NavigationBarItem(`,
          `${pad(depth + 2)}selected = ${i === p.selectedIndex},`,
          `${pad(depth + 2)}onClick = ${t === null ? '{}' : `{ ${navigateExpr(env, t, true)} }`},`,
          `${pad(depth + 2)}icon = { ${iconCall(env, item.icon)} },`,
          `${pad(depth + 2)}label = { ${text(env, item.label)} },`,
          `${pad(depth + 1)})`,
        )
      })
      lines.push(`${pad(depth)}}`)
      return lines
    }
    case 'tabs': {
      const p = node.props
      imp(env, 'androidx.compose.material3.TabRow', 'androidx.compose.material3.Tab')
      const targets = itemTargets(node, env.ctx.plan)
      const lines = [`${pad(depth)}TabRow(selectedTabIndex = ${p.selectedIndex}, modifier = ${modifier}) {`]
      p.items.forEach((item, i) => {
        const t = targets[i] ?? null
        lines.push(
          `${pad(depth + 1)}Tab(`,
          `${pad(depth + 2)}selected = ${i === p.selectedIndex},`,
          `${pad(depth + 2)}onClick = ${t === null ? '{}' : `{ ${navigateExpr(env, t, true)} }`},`,
          `${pad(depth + 2)}text = { ${text(env, item.label)} },`,
          ...(item.icon !== undefined ? [`${pad(depth + 2)}icon = { ${iconCall(env, item.icon)} },`] : []),
          `${pad(depth + 1)})`,
        )
      })
      lines.push(`${pad(depth)}}`)
      return lines
    }
    case 'dialog': {
      const p = node.props
      imp(env, 'androidx.compose.material3.AlertDialog', 'androidx.compose.material3.TextButton', 'androidx.compose.runtime.getValue', 'androidx.compose.runtime.mutableStateOf', 'androidx.compose.runtime.remember', 'androidx.compose.runtime.setValue')
      const i = env.ctx.nextIndex()
      const p1 = pad(depth + 1)
      const lines = [
        `${pad(depth)}var showDialog${i} by remember { mutableStateOf(true) }`,
        `${pad(depth)}if (showDialog${i}) {`,
        `${p1}AlertDialog(`,
        `${pad(depth + 2)}onDismissRequest = { showDialog${i} = false },`,
        `${pad(depth + 2)}title = { ${text(env, p.title)} },`,
        `${pad(depth + 2)}text = { ${text(env, p.message)} },`,
        `${pad(depth + 2)}confirmButton = { TextButton(onClick = { showDialog${i} = false }) { ${text(env, p.confirmLabel)} } },`,
      ]
      if (p.cancelLabel !== '') lines.push(`${pad(depth + 2)}dismissButton = { TextButton(onClick = { showDialog${i} = false }) { ${text(env, p.cancelLabel)} } },`)
      lines.push(`${p1})`, `${pad(depth)}}`)
      return lines
    }
    case 'snackbar': {
      const p = node.props
      imp(env, 'androidx.compose.material3.Snackbar')
      const args = [mod]
      if (p.actionLabel !== '') {
        imp(env, 'androidx.compose.material3.TextButton')
        args.unshift(`action = { TextButton(onClick = {}) { ${text(env, p.actionLabel)} } }`)
      }
      return call(depth, 'Snackbar', args, [pad(depth + 1) + text(env, p.message)])
    }
  }
}

const num = formatNumber

// TopAppBar (ou CenterAlignedTopAppBar) : titre, bouton de debut, actions.
export function renderTopAppBar(
  node: Extract<ComponentNode, { kind: 'appBar' }>,
  env: CEnv,
  depth: number,
  modifier: string | null,
  openDrawer: string | null = null,
): string[] {
  const p = node.props
  env.ctx.markExperimental()
  const widget = p.centerTitle ? 'CenterAlignedTopAppBar' : 'TopAppBar'
  imp(env, `androidx.compose.material3.${widget}`, 'androidx.compose.material3.IconButton')
  const p1 = pad(depth + 1)
  const args = [`title = { ${text(env, p.title)} }`]
  if (p.leading === 'back') {
    env.ctx.markNavigation()
    args.push(`navigationIcon = { IconButton(onClick = { navController.popBackStack() }) { ${iconCall(env, 'arrowBack')} } }`)
  } else if (p.leading === 'menu') {
    args.push(`navigationIcon = { IconButton(onClick = ${openDrawer === null ? '{}' : `{ ${openDrawer} }`}) { ${iconCall(env, 'menu')} } }`)
  }
  if (p.actions.length > 0) {
    args.push(`actions = {\n${p.actions.map((a) => `${pad(depth + 2)}IconButton(onClick = {}) { ${iconCall(env, a)} }`).join('\n')}\n${p1}}`)
  }
  if (p.color) {
    imp(env, 'androidx.compose.material3.TopAppBarDefaults')
    args.push(`colors = TopAppBarDefaults.topAppBarColors(containerColor = ${color(env, p.color)})`)
  }
  if (modifier !== null) args.push(`modifier = ${modifier}`)
  return [`${pad(depth)}${widget}(`, ...args.map((a) => `${p1}${a},`), `${pad(depth)})`]
}

