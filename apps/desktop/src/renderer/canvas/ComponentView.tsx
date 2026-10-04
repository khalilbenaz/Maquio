// Rendu DOM des composants mobiles semantiques sur le canevas : un rendu par
// `kind`, au style Material 3 (la reference de l'export natif), dimensionne
// par le cadre du noeud. Les proportions suivent les widgets cibles
// (hauteur de bouton, piste de curseur, barre de navigation...) pour que ce
// qu'on voit au canevas soit ce que l'export produit.
import type { CSSProperties, ReactNode } from 'react'
import type { Color, ComponentNode, ComponentPropsMap, IconName } from '@maquio/core'
import { IconGlyph } from './icons'
import { resolveImageSrc } from './imageSource'
import { useEditorStore } from '../state/editorStore'

// Palette Material 3 par defaut (theme violet de Flutter/Compose) : la
// couleur `color` d'un composant, absente par defaut, retombe dessus.
export const M3 = {
  primary: '#6750A4',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF',
  onPrimaryContainer: '#21005D',
  secondaryContainer: '#E8DEF8',
  surface: '#FEF7FF',
  surfaceContainer: '#F3EDF7',
  onSurface: '#1D1B20',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#B3261E',
  inverseSurface: '#322F35',
  inverseOnSurface: '#F5EFF7',
} as const

export function cssColor(c: Color): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`
}

function accent(color: Color | undefined): string {
  return color === undefined ? M3.primary : cssColor(color)
}

const FONT = "Roboto, 'Instrument Sans', system-ui, sans-serif"

const root: CSSProperties = {
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  fontFamily: FONT,
  color: M3.onSurface,
  fontSize: 14,
  lineHeight: '20px',
  overflow: 'hidden',
  pointerEvents: 'none',
}

function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }}>{children}</span>
}

const DISABLED_FG = 'rgba(29, 27, 32, 0.38)'
const DISABLED_BG = 'rgba(29, 27, 32, 0.12)'

type P<K extends keyof ComponentPropsMap> = ComponentPropsMap[K]

function Button({ p, h }: { p: P<'button'>; h: number }) {
  const main = accent(p.color)
  const base: CSSProperties = {
    ...root,
    justifyContent: 'center',
    gap: 8,
    borderRadius: h / 2,
    fontWeight: 500,
    padding: '0 24px',
  }
  let style: CSSProperties
  if (p.variant === 'primary') {
    style = { ...base, background: p.disabled ? DISABLED_BG : main, color: p.disabled ? DISABLED_FG : M3.onPrimary, boxShadow: p.disabled ? 'none' : '0 1px 3px rgba(0,0,0,.25)' }
  } else if (p.variant === 'secondary') {
    style = { ...base, border: `1px solid ${p.disabled ? DISABLED_BG : M3.outline}`, color: p.disabled ? DISABLED_FG : main }
  } else {
    style = { ...base, color: p.disabled ? DISABLED_FG : main, padding: '0 12px' }
  }
  return (
    <div style={style}>
      {p.icon !== undefined ? <IconGlyph name={p.icon} size={18} /> : null}
      <Label>{p.label}</Label>
    </div>
  )
}

function IconButton({ p }: { p: P<'iconButton'> }) {
  const main = accent(p.color)
  const fg = p.disabled ? DISABLED_FG : p.variant === 'filled' ? M3.onPrimary : p.variant === 'outlined' ? M3.onSurfaceVariant : main
  const style: CSSProperties = {
    ...root,
    justifyContent: 'center',
    borderRadius: '50%',
    color: fg,
    background: p.variant === 'filled' ? (p.disabled ? DISABLED_BG : main) : 'transparent',
    border: p.variant === 'outlined' ? `1px solid ${p.disabled ? DISABLED_BG : M3.outline}` : undefined,
  }
  return (
    <div style={style}>
      <IconGlyph name={p.icon} size={24} />
    </div>
  )
}

function Fab({ p }: { p: P<'fab'> }) {
  const bg = p.color === undefined ? M3.primaryContainer : cssColor(p.color)
  const radius = p.size === 'large' ? 28 : p.size === 'small' ? 12 : 16
  const iconSize = p.size === 'large' ? 36 : 24
  return (
    <div
      style={{
        ...root,
        justifyContent: 'center',
        gap: 12,
        background: bg,
        color: M3.onPrimaryContainer,
        borderRadius: radius,
        boxShadow: '0 3px 8px rgba(0,0,0,.28)',
        fontWeight: 500,
        padding: p.label === '' ? 0 : '0 16px',
      }}
    >
      <IconGlyph name={p.icon} size={iconSize} />
      {p.label !== '' ? <Label>{p.label}</Label> : null}
    </div>
  )
}

function TextField({ p, h }: { p: P<'textField'>; h: number }) {
  const hasSupport = p.errorText !== '' || p.helperText !== ''
  const fieldH = hasSupport ? Math.max(h - 20, 40) : h
  const error = p.errorText !== ''
  const border = error ? M3.error : p.disabled ? DISABLED_BG : M3.outline
  const labelColor = error ? M3.error : p.disabled ? DISABLED_FG : M3.onSurfaceVariant
  const shown = p.value !== '' ? (p.password ? '•'.repeat(Math.max(p.value.length, 1)) : p.value) : p.placeholder
  const floating = p.value !== '' || p.placeholder !== ''
  const placeholderShown = p.value === ''
  return (
    <div style={{ ...root, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', overflow: 'visible' }}>
      <div
        style={{
          position: 'relative',
          height: fieldH,
          border: `1px solid ${border}`,
          borderRadius: 4,
          display: 'flex',
          alignItems: p.multiline ? 'flex-start' : 'center',
          gap: 12,
          padding: p.multiline ? '16px 16px' : '0 16px',
          boxSizing: 'border-box',
          opacity: p.disabled ? 0.6 : 1,
        }}
      >
        {p.leadingIcon !== undefined ? <IconGlyph name={p.leadingIcon} size={20} color={M3.onSurfaceVariant} /> : null}
        <Label style={{ color: placeholderShown ? 'rgba(73,69,79,.7)' : M3.onSurface, fontSize: 16, whiteSpace: p.multiline ? 'pre-wrap' : 'nowrap' }}>
          {floating ? shown : ''}
        </Label>
        <span
          style={{
            position: 'absolute',
            left: p.leadingIcon !== undefined ? 48 : 12,
            top: floating ? -9 : p.multiline ? 16 : '50%',
            transform: floating || p.multiline ? undefined : 'translateY(-50%)',
            padding: '0 4px',
            background: floating ? '#FFFFFF' : 'transparent',
            color: labelColor,
            fontSize: floating ? 12 : 16,
            lineHeight: floating ? '16px' : '24px',
          }}
        >
          {p.label}
        </span>
        {p.password ? (
          <span style={{ marginLeft: 'auto', color: M3.onSurfaceVariant, fontSize: 12 }}>••</span>
        ) : null}
      </div>
      {hasSupport ? (
        <span style={{ fontSize: 12, lineHeight: '16px', padding: '4px 16px 0', color: error ? M3.error : M3.onSurfaceVariant }}>
          {error ? p.errorText : p.helperText}
        </span>
      ) : null}
    </div>
  )
}

function Checkbox({ p }: { p: P<'checkbox'> }) {
  return (
    <div style={{ ...root, gap: 12, opacity: p.disabled ? 0.6 : 1 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 2,
          flexShrink: 0,
          boxSizing: 'border-box',
          border: p.checked ? 'none' : `2px solid ${M3.onSurfaceVariant}`,
          background: p.checked ? M3.primary : 'transparent',
          color: M3.onPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {p.checked ? <IconGlyph name="check" size={14} /> : null}
      </span>
      <Label>{p.label}</Label>
    </div>
  )
}

function Radio({ p }: { p: P<'radio'> }) {
  return (
    <div style={{ ...root, gap: 12, opacity: p.disabled ? 0.6 : 1 }}>
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          flexShrink: 0,
          boxSizing: 'border-box',
          border: `2px solid ${p.selected ? M3.primary : M3.onSurfaceVariant}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {p.selected ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: M3.primary }} /> : null}
      </span>
      <Label>{p.label}</Label>
    </div>
  )
}

function Switch({ p }: { p: P<'switch'> }) {
  return (
    <div style={{ ...root, justifyContent: 'space-between', gap: 12, opacity: p.disabled ? 0.6 : 1 }}>
      <Label>{p.label}</Label>
      <span
        style={{
          position: 'relative',
          width: 52,
          height: 32,
          flexShrink: 0,
          borderRadius: 16,
          boxSizing: 'border-box',
          background: p.checked ? M3.primary : M3.surfaceContainer,
          border: p.checked ? 'none' : `2px solid ${M3.outline}`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: p.checked ? 24 : 6,
            width: p.checked ? 24 : 16,
            height: p.checked ? 24 : 16,
            borderRadius: '50%',
            background: p.checked ? M3.onPrimary : M3.outline,
          }}
        />
      </span>
    </div>
  )
}

function Slider({ p }: { p: P<'slider'> }) {
  const ratio = (p.value - p.min) / (p.max - p.min)
  return (
    <div style={{ ...root, opacity: p.disabled ? 0.5 : 1, position: 'relative' }}>
      <div style={{ position: 'relative', width: '100%', height: 4, borderRadius: 2, background: M3.secondaryContainer }}>
        <div style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 2, background: M3.primary }} />
        <div
          style={{
            position: 'absolute',
            left: `calc(${ratio * 100}% - 10px)`,
            top: -8,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: M3.primary,
          }}
        />
      </div>
    </div>
  )
}

function Dropdown({ p, h }: { p: P<'dropdown'>; h: number }) {
  const chosen = p.selectedIndex >= 0 ? p.options[p.selectedIndex] : undefined
  return (
    <div
      style={{
        ...root,
        height: Math.min(h, 56),
        border: `1px solid ${p.disabled ? DISABLED_BG : M3.outline}`,
        borderRadius: 4,
        padding: '0 12px 0 16px',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'visible',
        opacity: p.disabled ? 0.6 : 1,
      }}
    >
      <span style={{ position: 'absolute', left: 12, top: -9, padding: '0 4px', background: '#FFFFFF', color: M3.onSurfaceVariant, fontSize: 12, lineHeight: '16px' }}>
        {p.label}
      </span>
      <Label style={{ fontSize: 16 }}>{chosen ?? ''}</Label>
      <IconGlyph name="chevronDown" size={24} color={M3.onSurfaceVariant} />
    </div>
  )
}

function DatePicker({ p, h }: { p: P<'datePicker'>; h: number }) {
  return (
    <div
      style={{
        ...root,
        height: Math.min(h, 56),
        border: `1px solid ${p.disabled ? DISABLED_BG : M3.outline}`,
        borderRadius: 4,
        padding: '0 12px 0 16px',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'visible',
        opacity: p.disabled ? 0.6 : 1,
      }}
    >
      <span style={{ position: 'absolute', left: 12, top: -9, padding: '0 4px', background: '#FFFFFF', color: M3.onSurfaceVariant, fontSize: 12, lineHeight: '16px' }}>
        {p.label}
      </span>
      <Label style={{ fontSize: 16, color: p.value === '' ? 'rgba(73,69,79,.7)' : M3.onSurface }}>{p.value === '' ? 'jj/mm/aaaa' : p.value}</Label>
      <IconGlyph name="calendar" size={24} color={M3.onSurfaceVariant} />
    </div>
  )
}

function Avatar({ p }: { p: P<'avatar'> }) {
  const documentPath = useEditorStore((s) => s.documentPath)
  const resolved = p.src === '' ? null : resolveImageSrc(p.src, documentPath)
  return (
    <div
      style={{
        ...root,
        justifyContent: 'center',
        borderRadius: '50%',
        background: p.color === undefined ? M3.primaryContainer : cssColor(p.color),
        color: M3.onPrimaryContainer,
        fontWeight: 500,
        fontSize: 16,
      }}
    >
      {resolved !== null ? (
        <img src={resolved} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Label>{p.initials}</Label>
      )}
    </div>
  )
}

function Badge({ p, w, h }: { p: P<'badge'>; w: number; h: number }) {
  return (
    <div
      style={{
        ...root,
        justifyContent: 'center',
        background: p.color === undefined ? M3.error : cssColor(p.color),
        color: '#FFFFFF',
        borderRadius: Math.min(w, h) / 2,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: '16px',
      }}
    >
      {p.text !== '' ? <Label>{p.text}</Label> : null}
    </div>
  )
}

function Chip({ p }: { p: P<'chip'> }) {
  const selected = p.variant === 'filter' && p.selected
  return (
    <div
      style={{
        ...root,
        gap: 8,
        padding: '0 12px',
        borderRadius: 8,
        border: selected ? 'none' : `1px solid ${M3.outline}`,
        background: selected ? M3.secondaryContainer : 'transparent',
        fontWeight: 500,
      }}
    >
      {selected ? <IconGlyph name="check" size={18} /> : p.icon !== undefined ? <IconGlyph name={p.icon} size={18} color={M3.primary} /> : null}
      <Label>{p.label}</Label>
    </div>
  )
}

function Divider({ p }: { p: P<'divider'> }) {
  const color = p.color === undefined ? M3.outlineVariant : cssColor(p.color)
  return (
    <div style={{ ...root, alignItems: p.vertical ? 'stretch' : 'center', justifyContent: p.vertical ? 'center' : 'flex-start' }}>
      <div
        style={
          p.vertical
            ? { width: p.thickness, height: '100%', background: color, marginTop: p.indent }
            : { height: p.thickness, width: '100%', background: color, marginLeft: p.indent }
        }
      />
    </div>
  )
}

function ProgressBar({ p }: { p: P<'progressBar'> }) {
  const color = accent(p.color)
  return (
    <div style={{ ...root, alignItems: 'center' }}>
      <div style={{ width: '100%', height: 4, borderRadius: 2, background: M3.secondaryContainer, overflow: 'hidden' }}>
        <div
          style={{
            width: p.indeterminate ? '35%' : `${p.value * 100}%`,
            marginLeft: p.indeterminate ? '30%' : 0,
            height: '100%',
            background: color,
          }}
        />
      </div>
    </div>
  )
}

function Spinner({ p, w, h }: { p: P<'spinner'>; w: number; h: number }) {
  const size = Math.min(w, h)
  const color = accent(p.color)
  return (
    <div style={{ ...root, justifyContent: 'center' }}>
      <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <path d="M12 3a9 9 0 019 9" />
        <circle cx="12" cy="12" r="9" stroke={M3.secondaryContainer} />
      </svg>
    </div>
  )
}

function ListTile({ p }: { p: P<'listTile'> }) {
  return (
    <div style={{ ...root, gap: 16, padding: '0 16px', background: 'transparent' }}>
      {p.leadingIcon !== undefined ? <IconGlyph name={p.leadingIcon} size={24} color={M3.onSurfaceVariant} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <Label style={{ fontSize: 16, lineHeight: '24px' }}>{p.title}</Label>
        {p.subtitle !== '' ? <Label style={{ color: M3.onSurfaceVariant }}>{p.subtitle}</Label> : null}
      </div>
      {p.trailingIcon !== undefined ? <IconGlyph name={p.trailingIcon} size={24} color={M3.onSurfaceVariant} /> : null}
    </div>
  )
}

function Spacer({ p }: { p: P<'spacer'> }) {
  return (
    <div
      aria-hidden="true"
      style={{
        ...root,
        justifyContent: 'center',
        border: '1px dashed rgba(124, 116, 126, 0.5)',
        color: 'rgba(124, 116, 126, 0.8)',
        fontSize: 10,
      }}
    >
      ⇔ {p.flex}
    </div>
  )
}

function AppBar({ p }: { p: P<'appBar'> }) {
  const bg = p.color === undefined ? M3.surface : cssColor(p.color)
  const onBg = p.color === undefined ? M3.onSurface : M3.onPrimary
  const leading: IconName | null = p.leading === 'back' ? 'arrowBack' : p.leading === 'menu' ? 'menu' : null
  return (
    <div style={{ ...root, background: bg, color: onBg, padding: '0 4px', gap: 4, boxShadow: '0 1px 0 rgba(0,0,0,.08)' }}>
      {leading !== null ? (
        <span style={{ width: 48, display: 'flex', justifyContent: 'center' }}>
          <IconGlyph name={leading} size={24} />
        </span>
      ) : (
        <span style={{ width: 12 }} />
      )}
      <Label style={{ flex: 1, fontSize: 22, lineHeight: '28px', textAlign: p.centerTitle ? 'center' : 'left' }}>{p.title}</Label>
      {p.actions.map((name, i) => (
        <span key={`${name}-${i}`} style={{ width: 48, display: 'flex', justifyContent: 'center' }}>
          <IconGlyph name={name} size={24} />
        </span>
      ))}
    </div>
  )
}

function BottomNav({ p }: { p: P<'bottomNav'> }) {
  return (
    <div style={{ ...root, alignItems: 'stretch', background: M3.surfaceContainer, padding: '12px 8px 16px', gap: 8 }}>
      {p.items.map((item, i) => {
        const active = i === p.selectedIndex
        return (
          <div key={`${item.label}-${i}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span
              style={{
                width: 64,
                height: 32,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? M3.secondaryContainer : 'transparent',
              }}
            >
              <IconGlyph name={item.icon} size={24} color={active ? M3.onSurface : M3.onSurfaceVariant} />
            </span>
            <Label style={{ fontSize: 12, lineHeight: '16px', fontWeight: active ? 700 : 500 }}>{item.label}</Label>
          </div>
        )
      })}
    </div>
  )
}

function Tabs({ p }: { p: P<'tabs'> }) {
  return (
    <div style={{ ...root, alignItems: 'stretch', background: M3.surface, boxShadow: `inset 0 -1px 0 ${M3.outlineVariant}` }}>
      {p.items.map((item, i) => {
        const active = i === p.selectedIndex
        return (
          <div
            key={`${item.label}-${i}`}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderBottom: active ? `3px solid ${M3.primary}` : '3px solid transparent',
              color: active ? M3.primary : M3.onSurfaceVariant,
              fontWeight: 500,
              minWidth: 0,
            }}
          >
            {item.icon !== undefined ? <IconGlyph name={item.icon} size={20} /> : null}
            <Label>{item.label}</Label>
          </div>
        )
      })}
    </div>
  )
}

function Dialog({ p }: { p: P<'dialog'> }) {
  return (
    <div
      style={{
        ...root,
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        background: M3.surfaceContainer,
        borderRadius: 28,
        padding: 24,
        boxShadow: '0 6px 24px rgba(0,0,0,.28)',
        gap: 16,
      }}
    >
      <Label style={{ fontSize: 24, lineHeight: '32px' }}>{p.title}</Label>
      <span style={{ color: M3.onSurfaceVariant, flex: 1, overflow: 'hidden' }}>{p.message}</span>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, color: M3.primary, fontWeight: 500 }}>
        {p.cancelLabel !== '' ? <span style={{ padding: '10px 12px' }}>{p.cancelLabel}</span> : null}
        <span style={{ padding: '10px 12px' }}>{p.confirmLabel}</span>
      </div>
    </div>
  )
}

function Snackbar({ p }: { p: P<'snackbar'> }) {
  return (
    <div
      style={{
        ...root,
        background: M3.inverseSurface,
        color: M3.inverseOnSurface,
        borderRadius: 4,
        padding: '0 16px',
        justifyContent: 'space-between',
        gap: 16,
        boxShadow: '0 3px 8px rgba(0,0,0,.28)',
      }}
    >
      <Label>{p.message}</Label>
      {p.actionLabel !== '' ? <Label style={{ color: '#D0BCFF', fontWeight: 500 }}>{p.actionLabel}</Label> : null}
    </div>
  )
}

// Rend le contenu d'un composant ; le cadre (position, taille, opacite,
// rotation) est celui de NodeView.
export function ComponentContent({ node }: { node: ComponentNode }) {
  const { w, h } = node.frame
  let content: ReactNode
  switch (node.kind) {
    case 'button':
      content = <Button p={node.props} h={h} />
      break
    case 'iconButton':
      content = <IconButton p={node.props} />
      break
    case 'fab':
      content = <Fab p={node.props} />
      break
    case 'textField':
      content = <TextField p={node.props} h={h} />
      break
    case 'checkbox':
      content = <Checkbox p={node.props} />
      break
    case 'radio':
      content = <Radio p={node.props} />
      break
    case 'switch':
      content = <Switch p={node.props} />
      break
    case 'slider':
      content = <Slider p={node.props} />
      break
    case 'dropdown':
      content = <Dropdown p={node.props} h={h} />
      break
    case 'datePicker':
      content = <DatePicker p={node.props} h={h} />
      break
    case 'icon':
      content = (
        <div style={{ ...root, justifyContent: 'center', color: node.props.color === undefined ? M3.onSurface : cssColor(node.props.color) }}>
          <IconGlyph name={node.props.name} size={node.props.size} />
        </div>
      )
      break
    case 'avatar':
      content = <Avatar p={node.props} />
      break
    case 'badge':
      content = <Badge p={node.props} w={w} h={h} />
      break
    case 'chip':
      content = <Chip p={node.props} />
      break
    case 'divider':
      content = <Divider p={node.props} />
      break
    case 'progressBar':
      content = <ProgressBar p={node.props} />
      break
    case 'spinner':
      content = <Spinner p={node.props} w={w} h={h} />
      break
    case 'listTile':
      content = <ListTile p={node.props} />
      break
    case 'spacer':
      content = <Spacer p={node.props} />
      break
    case 'appBar':
      content = <AppBar p={node.props} />
      break
    case 'bottomNav':
      content = <BottomNav p={node.props} />
      break
    case 'tabs':
      content = <Tabs p={node.props} />
      break
    case 'dialog':
      content = <Dialog p={node.props} />
      break
    case 'snackbar':
      content = <Snackbar p={node.props} />
      break
  }
  return (
    <div data-component={node.kind} style={{ width: '100%', height: '100%' }}>
      {content}
    </div>
  )
}
