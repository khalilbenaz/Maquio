import { beforeEach, describe, expect, it } from 'vitest'
import { clampLeftWidth, clampRightWidth, isPanelHidden, LEFT_DEFAULT, LEFT_MAX, LEFT_MIN, RIGHT_DEFAULT, RIGHT_MAX, RIGHT_MIN, useUiPrefs } from '../src/renderer/state/uiPrefsStore'

const s = () => useUiPrefs.getState()
const lire = () => JSON.parse(localStorage.getItem('maquio.ui.v1') ?? '{}')

beforeEach(() => {
  localStorage.clear()
  useUiPrefs.setState({ leftCollapsed: false, inspectorCollapsed: false, claudeCollapsed: false, focusMode: false, leftWidth: LEFT_DEFAULT, rightWidth: RIGHT_DEFAULT })
})

describe('etat des panneaux', () => {
  it('chaque panneau se replie et se rouvre independamment, et l etat est memorise', () => {
    s().togglePanel('left')
    expect(isPanelHidden(s(), 'left')).toBe(true)
    expect(isPanelHidden(s(), 'inspector')).toBe(false)
    expect(lire().leftCollapsed).toBe(true)
    s().togglePanel('inspector'); s().togglePanel('claude')
    expect(lire()).toMatchObject({ leftCollapsed: true, inspectorCollapsed: true, claudeCollapsed: true })
    s().togglePanel('left')
    expect(isPanelHidden(s(), 'left')).toBe(false)
    expect(isPanelHidden(s(), 'claude')).toBe(true)
  })
  it('mode focus : tout est cache sans changer les etats individuels ; le quitter les restaure', () => {
    s().setPanelCollapsed('inspector', true)
    s().toggleFocus()
    for (const p of ['left', 'inspector', 'claude'] as const) expect(isPanelHidden(s(), p)).toBe(true)
    expect(s().leftCollapsed).toBe(false)
    expect(lire().focusMode).toBe(true)
    s().toggleFocus()
    expect(isPanelHidden(s(), 'left')).toBe(false)
    expect(isPanelHidden(s(), 'inspector')).toBe(true) // etat d avant le focus
    expect(isPanelHidden(s(), 'claude')).toBe(false)
  })
  it('agir sur un panneau en mode focus sort du focus et l affiche', () => {
    s().toggleFocus()
    s().togglePanel('left') // le panneau est « cache » par le focus : l action le montre
    expect(s().focusMode).toBe(false)
    expect(isPanelHidden(s(), 'left')).toBe(false)
  })
  it('largeurs bornees, memorisees, et retour a la valeur par defaut', () => {
    s().setLeftWidth(10); expect(s().leftWidth).toBe(LEFT_MIN)
    s().setLeftWidth(9999); expect(s().leftWidth).toBe(LEFT_MAX)
    s().setRightWidth(10); expect(s().rightWidth).toBe(RIGHT_MIN)
    s().setRightWidth(9999); expect(s().rightWidth).toBe(RIGHT_MAX)
    s().setLeftWidth(333); s().setRightWidth(444)
    expect(lire()).toMatchObject({ leftWidth: 333, rightWidth: 444 })
    s().resetLeftWidth(); s().resetRightWidth()
    expect([s().leftWidth, s().rightWidth]).toEqual([LEFT_DEFAULT, RIGHT_DEFAULT])
    expect(clampLeftWidth(Number.NaN)).toBe(LEFT_DEFAULT)
    expect(clampRightWidth(Number.NaN)).toBe(RIGHT_DEFAULT)
  })
})
