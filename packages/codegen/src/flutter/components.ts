// Widgets Flutter natifs des composants mobiles (type `component`). Chaque
// `kind` produit le widget Material qu'un developpeur Flutter ecrirait :
// ElevatedButton, TextField, Switch, AppBar, BottomNavigationBar...
//
// Les composants ne portent aucune logique metier : les rappels sont des
// fonctions vides (`() {}`) sauf la navigation, produite a partir de
// `link.target` (ou de la cible d'une entree de barre) via
// `Navigator.of(context).pushNamed`.
import type { Color, ComponentNode, DesignTokens, IconName, Node } from '@maquio/core'
import { ICONS } from '@maquio/core'
import { itemTargets } from '../shared/screens'
import type { ExportPlan, ScreenRef } from '../shared/screens'
import { isRemoteUrl } from '../shared/node-helpers'
import { type Arg, type Block, call, lit, list } from './dart-writer'
import { colorExpr, escapeDartString, formatNumber } from './dart-utils'

// Expressions Dart des interactions d'un noeud (null : aucune).
export type Acts = { tap: string | null; longPress: string | null }

export type ComponentEnv = {
  // Interactions du noeud, deja traduites en expressions Dart.
  act(node: Node): Acts
  tokens: DesignTokens
  plan: ExportPlan
  // L'ecran courant a un tiroir (le bouton « menu » de la barre l'ouvre).
  hasDrawer: boolean
  // Le parent est une Row/Column : un Spacer peut etre un vrai Spacer().
  inFlex: boolean
  markTheme(): void
  // Signale l'usage de `scheme` (ColorScheme du theme), declare en tete de build.
  markScheme(): void
}

const str = (value: string): string => `'${escapeDartString(value)}'`
const num = formatNumber

// Couleur du theme Material, via la variable locale `scheme` : evite des
// expressions longues que `dart format` couperait de facon imprevisible.
function scheme(env: ComponentEnv, role: string): string {
  env.markScheme()
  return `scheme.${role}`
}

function color(c: Color, env: ComponentEnv): string {
  return colorExpr(c, env.tokens, env.markTheme)
}

function icon(name: IconName, extra: Arg[] = []): Block {
  return call('Icon', [{ block: lit(`Icons.${ICONS[name].flutter}`) }, ...extra])
}

function textOf(value: string, extra: Arg[] = []): Block {
  return call('Text', [{ block: lit(str(value)) }, ...extra])
}

export function navigateExpr(ref: ScreenRef): string {
  return `Navigator.of(context).pushNamed(${str(ref.route)})`
}

function onTap(expr: string | null): Block {
  return lit(expr === null ? '() {}' : `() => ${expr}`)
}

// Rappel d'un widget qui devient inactif : `null` (Flutter grise le widget).
function onPressed(disabled: boolean, expr: string | null, key = 'onPressed'): Arg {
  return { key, block: disabled ? lit('null') : onTap(expr) }
}

function onChanged(disabled: boolean): Arg {
  return { key: 'onChanged', block: lit(disabled ? 'null' : '(_) {}') }
}

function lines(h: number): number {
  return Math.max(2, Math.round((h - 32) / 24))
}

// Barre de navigation basse / onglets : route de l'entree choisie.
function routePicker(targets: (ScreenRef | null)[], push: 'pushReplacementNamed'): Arg[] {
  if (targets.every((t) => t === null)) return []
  const routes = targets.map((t) => (t === null ? 'null' : str(t.route))).join(', ')
  return [
    {
      key: 'onTap',
      block: [
        '(index) {',
        `  const routes = <String?>[${routes}];`,
        '  final route = routes[index];',
        '  if (route != null) {',
        `    Navigator.of(context).${push}(route);`,
        '  }',
        '}',
      ],
    },
  ]
}

// Rend le widget d'un composant. `consumesLink` : le widget gere lui-meme le
// lien de son noeud (sinon l'appelant l'enveloppe dans un GestureDetector).
export function renderComponent(node: ComponentNode, env: ComponentEnv): { block: Block; consumesLink: boolean } | null {
  const link = env.act(node).tap
  const w = node.frame.w
  const h = node.frame.h
  const own = (block: Block) => ({ block, consumesLink: true })
  const plain = (block: Block) => ({ block, consumesLink: false })

  switch (node.kind) {
    case 'button': {
      const p = node.props
      const widget = p.variant === 'primary' ? 'ElevatedButton' : p.variant === 'secondary' ? 'OutlinedButton' : 'TextButton'
      const styleArgs: Arg[] = []
      if (p.variant === 'primary') {
        styleArgs.push({
          key: 'backgroundColor',
          block: lit(p.color ? color(p.color, env) : scheme(env, 'primary')),
        })
        styleArgs.push({ key: 'foregroundColor', block: lit(scheme(env, 'onPrimary')) })
      } else if (p.color) {
        styleArgs.push({ key: 'foregroundColor', block: lit(color(p.color, env)) })
      }
      const style: Arg[] = styleArgs.length === 0 ? [] : [{ key: 'style', block: call(`${widget}.styleFrom`, styleArgs) }]
      if (p.icon !== undefined) {
        return own(
          call(`${widget}.icon`, [
            onPressed(p.disabled, link),
            { key: 'icon', block: icon(p.icon) },
            { key: 'label', block: textOf(p.label) },
            ...style,
          ]),
        )
      }
      return own(call(widget, [onPressed(p.disabled, link), ...style, { key: 'child', block: textOf(p.label) }]))
    }
    case 'iconButton': {
      const p = node.props
      const ctor = p.variant === 'standard' ? 'IconButton' : p.variant === 'filled' ? 'IconButton.filled' : 'IconButton.outlined'
      const args: Arg[] = [onPressed(p.disabled, link), { key: 'icon', block: icon(p.icon) }]
      if (p.color) {
        args.push(
          p.variant === 'filled'
            ? { key: 'style', block: call('IconButton.styleFrom', [{ key: 'backgroundColor', block: lit(color(p.color, env)) }]) }
            : { key: 'color', block: lit(color(p.color, env)) },
        )
      }
      return own(call(ctor, args))
    }
    case 'fab': {
      const p = node.props
      const bg: Arg[] = p.color ? [{ key: 'backgroundColor', block: lit(color(p.color, env)) }] : []
      const press: Arg = { key: 'onPressed', block: onTap(link) }
      if (p.label !== '') {
        return own(
          call('FloatingActionButton.extended', [
            press,
            { key: 'icon', block: icon(p.icon) },
            { key: 'label', block: textOf(p.label) },
            ...bg,
          ]),
        )
      }
      const ctor = p.size === 'small' ? 'FloatingActionButton.small' : p.size === 'large' ? 'FloatingActionButton.large' : 'FloatingActionButton'
      return own(call(ctor, [press, ...bg, { key: 'child', block: icon(p.icon) }]))
    }
    case 'textField': {
      const p = node.props
      const decoration: Arg[] = [{ key: 'border', block: lit('OutlineInputBorder()') }]
      if (p.label !== '') decoration.push({ key: 'labelText', block: lit(str(p.label)) })
      if (p.placeholder !== '') decoration.push({ key: 'hintText', block: lit(str(p.placeholder)) })
      if (p.helperText !== '') decoration.push({ key: 'helperText', block: lit(str(p.helperText)) })
      if (p.errorText !== '') decoration.push({ key: 'errorText', block: lit(str(p.errorText)) })
      if (p.leadingIcon !== undefined) decoration.push({ key: 'prefixIcon', block: icon(p.leadingIcon) })
      const args: Arg[] = []
      if (p.value !== '') args.push({ key: 'controller', block: call('TextEditingController', [{ key: 'text', block: lit(str(p.value)) }]) })
      if (p.password) args.push({ key: 'obscureText', block: lit('true') })
      if (p.disabled) args.push({ key: 'enabled', block: lit('false') })
      if (p.multiline) {
        args.push({ key: 'minLines', block: lit(String(lines(h))) })
        args.push({ key: 'maxLines', block: lit(String(lines(h))) })
      }
      args.push({ key: 'decoration', block: call('InputDecoration', decoration) })
      return plain(call('Align', [{ key: 'alignment', block: lit('Alignment.topCenter') }, { key: 'child', block: call('TextField', args) }]))
    }
    case 'checkbox': {
      const p = node.props
      return plain(
        call('Row', [
          {
            key: 'children',
            block: list([
              call('Checkbox', [{ key: 'value', block: lit(String(p.checked)) }, onChanged(p.disabled)]),
              textOf(p.label),
            ]),
          },
        ]),
      )
    }
    case 'switch': {
      const p = node.props
      return plain(
        call('Row', [
          {
            key: 'children',
            block: list([
              call('Expanded', [{ key: 'child', block: textOf(p.label) }]),
              call('Switch', [{ key: 'value', block: lit(String(p.checked)) }, onChanged(p.disabled)]),
            ]),
          },
        ]),
      )
    }
    case 'radio': {
      const p = node.props
      // RadioGroup (Flutter 3.35+) remplace `groupValue`/`onChanged` du Radio,
      // depreces : l'etat « selectionne » est la valeur du groupe.
      const radio = call('Radio<int>', [{ key: 'value', block: lit('0') }, ...(p.disabled ? [{ key: 'enabled', block: lit('false') }] : [])])
      return plain(
        call('RadioGroup<int>', [
          { key: 'groupValue', block: lit(p.selected ? '0' : 'null') },
          { key: 'onChanged', block: lit('(_) {}') },
          { key: 'child', block: call('Row', [{ key: 'children', block: list([radio, textOf(p.label)]) }]) },
        ]),
      )
    }
    case 'slider': {
      const p = node.props
      return plain(
        call('Slider', [
          { key: 'value', block: lit(num(p.value)) },
          { key: 'min', block: lit(num(p.min)) },
          { key: 'max', block: lit(num(p.max)) },
          onChanged(p.disabled),
        ]),
      )
    }
    case 'dropdown': {
      const p = node.props
      const args: Arg[] = []
      if (p.selectedIndex >= 0) args.push({ key: 'initialValue', block: lit(str(p.options[p.selectedIndex]!)) })
      args.push({
        key: 'decoration',
        block: call('InputDecoration', [
          { key: 'border', block: lit('OutlineInputBorder()') },
          { key: 'labelText', block: lit(str(p.label)) },
        ]),
      })
      args.push({
        key: 'items',
        block: list(
          p.options.map((option) =>
            call('DropdownMenuItem<String>', [
              { key: 'value', block: lit(str(option)) },
              { key: 'child', block: textOf(option) },
            ]),
          ),
        ),
      })
      args.push(onChanged(p.disabled))
      return plain(call('Align', [{ key: 'alignment', block: lit('Alignment.topCenter') }, { key: 'child', block: call('DropdownButtonFormField<String>', args) }]))
    }
    case 'datePicker': {
      const p = node.props
      const [year, month, day] = p.value === '' ? [] : p.value.split('-').map((part) => Number.parseInt(part, 10))
      const initial = year === undefined ? 'DateTime.now()' : `DateTime(${year}, ${month}, ${day})`
      const args: Arg[] = [{ key: 'readOnly', block: lit('true') }]
      if (p.value !== '') args.push({ key: 'controller', block: call('TextEditingController', [{ key: 'text', block: lit(str(p.value)) }]) })
      if (p.disabled) args.push({ key: 'enabled', block: lit('false') })
      args.push({
        key: 'decoration',
        block: call('InputDecoration', [
          { key: 'border', block: lit('OutlineInputBorder()') },
          { key: 'labelText', block: lit(str(p.label)) },
          { key: 'suffixIcon', block: icon('calendar') },
        ]),
      })
      args.push({
        key: 'onTap',
        block: [
          '() => showDatePicker(',
          '  context: context,',
          `  initialDate: ${initial},`,
          '  firstDate: DateTime(2000),',
          '  lastDate: DateTime(2100),',
          ')',
        ],
      })
      return plain(call('Align', [{ key: 'alignment', block: lit('Alignment.topCenter') }, { key: 'child', block: call('TextField', args) }]))
    }
    case 'icon': {
      const p = node.props
      const args: Arg[] = [{ key: 'size', block: lit(num(p.size)) }]
      if (p.color) args.push({ key: 'color', block: lit(color(p.color, env)) })
      return plain(call('Center', [{ key: 'child', block: icon(p.name, args) }]))
    }
    case 'avatar': {
      const p = node.props
      const args: Arg[] = [{ key: 'radius', block: lit(num(Math.min(w, h) / 2)) }]
      if (p.color) args.push({ key: 'backgroundColor', block: lit(color(p.color, env)) })
      if (p.src !== '') {
        args.push({
          key: 'backgroundImage',
          block: lit(isRemoteUrl(p.src) ? `NetworkImage(${str(p.src)})` : `AssetImage(${str(p.src)})`),
        })
      } else {
        args.push({ key: 'child', block: textOf(p.initials) })
      }
      return plain(call('CircleAvatar', args))
    }
    case 'badge': {
      const p = node.props
      const args: Arg[] = []
      if (p.color) args.push({ key: 'backgroundColor', block: lit(color(p.color, env)) })
      if (p.text !== '') args.push({ key: 'label', block: textOf(p.text) })
      return plain(call('Center', [{ key: 'child', block: call('Badge', args) }]))
    }
    case 'chip': {
      const p = node.props
      const label: Arg = { key: 'label', block: textOf(p.label) }
      const avatar: Arg[] = p.icon !== undefined ? [{ key: 'avatar', block: icon(p.icon, [{ key: 'size', block: lit('18') }]) }] : []
      const chip =
        p.variant === 'filter'
          ? call('FilterChip', [label, { key: 'selected', block: lit(String(p.selected)) }, { key: 'onSelected', block: lit('(_) {}') }])
          : call('ActionChip', [label, ...avatar, { key: 'onPressed', block: onTap(link) }])
      return own(call('Align', [{ key: 'alignment', block: lit('Alignment.centerLeft') }, { key: 'child', block: chip }]))
    }
    case 'divider': {
      const p = node.props
      const args: Arg[] = [
        { key: p.vertical ? 'width' : 'height', block: lit(num(p.vertical ? w : h)) },
        { key: 'thickness', block: lit(num(p.thickness)) },
      ]
      if (p.indent > 0) args.push({ key: 'indent', block: lit(num(p.indent)) })
      if (p.color) args.push({ key: 'color', block: lit(color(p.color, env)) })
      return plain(call(p.vertical ? 'VerticalDivider' : 'Divider', args))
    }
    case 'progressBar': {
      const p = node.props
      const args: Arg[] = []
      if (!p.indeterminate) args.push({ key: 'value', block: lit(num(p.value)) })
      if (p.color) args.push({ key: 'color', block: lit(color(p.color, env)) })
      return plain(call('LinearProgressIndicator', args))
    }
    case 'spinner': {
      const p = node.props
      const args: Arg[] = p.color ? [{ key: 'color', block: lit(color(p.color, env)) }] : []
      return plain(call('Center', [{ key: 'child', block: call('CircularProgressIndicator', args) }]))
    }
    case 'listTile': {
      const p = node.props
      const args: Arg[] = []
      if (p.leadingIcon !== undefined) args.push({ key: 'leading', block: icon(p.leadingIcon) })
      args.push({ key: 'title', block: textOf(p.title) })
      if (p.subtitle !== '') args.push({ key: 'subtitle', block: textOf(p.subtitle) })
      if (p.trailingIcon !== undefined) args.push({ key: 'trailing', block: icon(p.trailingIcon) })
      if (link !== null) args.push({ key: 'onTap', block: onTap(link) })
      return own(call('ListTile', args))
    }
    case 'spacer': {
      const p = node.props
      return plain(env.inFlex ? call('Spacer', p.flex === 1 ? [] : [{ key: 'flex', block: lit(String(p.flex)) }]) : lit('const SizedBox.shrink()'))
    }
    case 'appBar': {
      const p = node.props
      const args: Arg[] = [{ key: 'title', block: textOf(p.title) }]
      if (p.leading === 'none') {
        args.push({ key: 'automaticallyImplyLeading', block: lit('false') })
      } else if (p.leading === 'back') {
        args.push({
          key: 'leading',
          block: call('IconButton', [
            { key: 'icon', block: icon('arrowBack') },
            { key: 'onPressed', block: lit('() => Navigator.of(context).maybePop()') },
          ]),
        })
      } else if (!env.hasDrawer) {
        // Avec un tiroir, AppBar affiche seul le bouton qui l'ouvre.
        args.push({
          key: 'leading',
          block: call('IconButton', [
            { key: 'icon', block: icon('menu') },
            { key: 'onPressed', block: lit('() {}') },
          ]),
        })
      }
      if (p.actions.length > 0) {
        args.push({
          key: 'actions',
          block: list(
            p.actions.map((name) =>
              call('IconButton', [
                { key: 'icon', block: icon(name) },
                { key: 'onPressed', block: lit('() {}') },
              ]),
            ),
          ),
        })
      }
      args.push({ key: 'centerTitle', block: lit(String(p.centerTitle)) })
      if (p.color) {
        args.push({ key: 'backgroundColor', block: lit(color(p.color, env)) })
        args.push({ key: 'foregroundColor', block: lit(scheme(env, 'onPrimary')) })
      }
      if (h !== 56) args.push({ key: 'toolbarHeight', block: lit(num(h)) })
      return plain(call('AppBar', args))
    }
    case 'bottomNav': {
      const p = node.props
      return plain(
        call('BottomNavigationBar', [
          { key: 'type', block: lit('BottomNavigationBarType.fixed') },
          { key: 'currentIndex', block: lit(String(p.selectedIndex)) },
          ...routePicker(itemTargets(node, env.plan), 'pushReplacementNamed'),
          {
            key: 'items',
            block: list(
              p.items.map((item) =>
                call('BottomNavigationBarItem', [
                  { key: 'icon', block: icon(item.icon) },
                  { key: 'label', block: lit(str(item.label)) },
                ]),
              ),
            ),
          },
        ]),
      )
    }
    case 'tabs': {
      const p = node.props
      const tabs = p.items.map((item) => {
        const args: Arg[] = []
        if (item.icon !== undefined) args.push({ key: 'icon', block: icon(item.icon) })
        args.push({ key: 'text', block: lit(str(item.label)) })
        return call('Tab', args)
      })
      return plain(
        call('Align', [
          { key: 'alignment', block: lit('Alignment.topCenter') },
          {
            key: 'child',
            block: call('DefaultTabController', [
              { key: 'length', block: lit(String(p.items.length)) },
              { key: 'initialIndex', block: lit(String(p.selectedIndex)) },
              {
                key: 'child',
                block: call('TabBar', [...routePicker(itemTargets(node, env.plan), 'pushReplacementNamed'), { key: 'tabs', block: list(tabs) }]),
              },
            ]),
          },
        ]),
      )
    }
    case 'dialog': {
      const p = node.props
      const actions: Block[] = []
      const close = { key: 'onPressed', block: lit('() => Navigator.of(context).maybePop()') }
      // Le bouton de confirmation joue l'interaction du dialogue (« Valider » ->
      // ecran suivant) apres l'avoir ferme : un dialogue qui ne mene nulle part
      // rendrait un virement ou une deconnexion impossibles.
      const onConfirm = env.act(node).tap
      const confirm = onConfirm === null ? close : { key: 'onPressed', block: ['() {', '  Navigator.of(context).pop();', `  ${onConfirm};`, '}'] }
      if (p.cancelLabel !== '') actions.push(call('TextButton', [close, { key: 'child', block: textOf(p.cancelLabel) }]))
      actions.push(call('TextButton', [confirm, { key: 'child', block: textOf(p.confirmLabel) }]))
      return plain(
        call('AlertDialog', [
          { key: 'title', block: textOf(p.title) },
          { key: 'content', block: textOf(p.message) },
          { key: 'actions', block: list(actions) },
        ]),
      )
    }
    case 'snackbar': {
      const p = node.props
      const children: Block[] = [
        call('Expanded', [
          {
            key: 'child',
            block: textOf(p.message, [
              { key: 'style', block: call('TextStyle', [{ key: 'color', block: lit(scheme(env, 'onInverseSurface')) }]) },
            ]),
          },
        ]),
      ]
      if (p.actionLabel !== '') {
        children.push(
          call('TextButton', [
            { key: 'onPressed', block: lit('() {}') },
            { key: 'child', block: textOf(p.actionLabel) },
          ]),
        )
      }
      return plain(
        call('Material', [
          { key: 'color', block: lit(scheme(env, 'inverseSurface')) },
          { key: 'elevation', block: lit('6') },
          { key: 'borderRadius', block: lit('BorderRadius.circular(4)') },
          {
            key: 'child',
            block: call('Padding', [
              { key: 'padding', block: lit('const EdgeInsets.symmetric(horizontal: 16)') },
              { key: 'child', block: call('Row', [{ key: 'children', block: list(children) }]) },
            ]),
          },
        ]),
      )
    }
    default: {
      const unknown = node as unknown as { kind: string; id: string }
      void unknown
      return null
    }
  }
}
