import { describe, expect, it } from 'vitest'
import { COMPONENT_DEFINITIONS, COMPONENT_KINDS, COMPONENT_PROPS_SCHEMAS } from '../index'

describe('props des composants', () => {
  it('les valeurs par defaut respectent le schema de leur kind', () => {
    for (const kind of COMPONENT_KINDS) {
      const result = COMPONENT_PROPS_SCHEMAS[kind].safeParse(COMPONENT_DEFINITIONS[kind].props)
      expect(result.success, kind).toBe(true)
    }
  })

  it('refuse une cle inconnue (schema strict)', () => {
    expect(COMPONENT_PROPS_SCHEMAS.button.safeParse({ ...COMPONENT_DEFINITIONS.button.props, bogus: 1 }).success).toBe(false)
  })

  it('enumere les variantes de bouton', () => {
    for (const variant of ['primary', 'secondary', 'text']) {
      expect(COMPONENT_PROPS_SCHEMAS.button.safeParse({ ...COMPONENT_DEFINITIONS.button.props, variant }).success).toBe(true)
    }
    expect(COMPONENT_PROPS_SCHEMAS.button.safeParse({ ...COMPONENT_DEFINITIONS.button.props, variant: 'ghost' }).success).toBe(false)
  })

  it('slider : min < max et value dans la plage', () => {
    const base = COMPONENT_DEFINITIONS.slider.props
    expect(COMPONENT_PROPS_SCHEMAS.slider.safeParse({ ...base, min: 5, max: 5, value: 5 }).success).toBe(false)
    expect(COMPONENT_PROPS_SCHEMAS.slider.safeParse({ ...base, value: base.max + 1 }).success).toBe(false)
  })

  it('dropdown : la selection doit exister, -1 = aucune', () => {
    const base = COMPONENT_DEFINITIONS.dropdown.props
    expect(COMPONENT_PROPS_SCHEMAS.dropdown.safeParse({ ...base, selectedIndex: -1 }).success).toBe(true)
    expect(COMPONENT_PROPS_SCHEMAS.dropdown.safeParse({ ...base, selectedIndex: 99 }).success).toBe(false)
    expect(COMPONENT_PROPS_SCHEMAS.dropdown.safeParse({ ...base, options: [] }).success).toBe(false)
  })

  it('datePicker : yyyy-MM-dd ou vide', () => {
    const base = COMPONENT_DEFINITIONS.datePicker.props
    expect(COMPONENT_PROPS_SCHEMAS.datePicker.safeParse({ ...base, value: '2026-10-03' }).success).toBe(true)
    expect(COMPONENT_PROPS_SCHEMAS.datePicker.safeParse({ ...base, value: '' }).success).toBe(true)
    expect(COMPONENT_PROPS_SCHEMAS.datePicker.safeParse({ ...base, value: '03/10/2026' }).success).toBe(false)
  })

  it('bottomNav : de 2 a 5 entrees', () => {
    const base = COMPONENT_DEFINITIONS.bottomNav.props
    const item = base.items[0]!
    expect(COMPONENT_PROPS_SCHEMAS.bottomNav.safeParse({ ...base, items: [item] }).success).toBe(false)
    expect(COMPONENT_PROPS_SCHEMAS.bottomNav.safeParse({ ...base, items: Array(6).fill(item) }).success).toBe(false)
  })
})
