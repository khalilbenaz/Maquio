import { describe, expect, it } from 'vitest'
import { createComponentNode, createContainerNode, createDocument, createScreenNode, DEVICE_PRESETS, serializeDocument } from '@calque/core'
import type { CalqueDocument, FrameNode, Node } from '@calque/core'
import { autoLayoutOf, BundleError, buildPlan, parseBundle, rotationTransform, weightStyleCandidates } from '../src/mapping'
import type { Plan, PlanNode } from '../src/mapping'

const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
const style = (o: Partial<{ fontFamily: string; fontWeight: number }> = {}) => ({ fontFamily: 'Inter', fontSize: 18, fontWeight: 600, lineHeight: 22, letterSpacing: 1, color: { r: 0.1, g: 0.2, b: 0.3, a: 1 }, align: 'center' as const, ...o })

function doc(children: Node[] = []): CalqueDocument {
  const d = createDocument('Mon projet')
  const e1 = { ...createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, children), id: 'e1' }
  const e2 = { ...createScreenNode('Détail', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, []), id: 'e2' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [e1, e2] }] }
}
const bundleOf = (document: CalqueDocument, images = {}) => ({ document, images, projectName: 'p', startScreenId: null })
const kids = (plan: Plan) => (plan.screens[0]!.children as PlanNode[])

describe('parseBundle', () => {
  it('lit un bundle calque-figma (document + images)', () => {
    const b = parseBundle(JSON.stringify({ format: 'calque-figma', version: 1, projectName: 'P', startScreenId: 'e2', document: JSON.parse(serializeDocument(doc())), images: { 'a.png': { mime: 'image/png', data: 'AA==' } } }))
    expect(b.projectName).toBe('P')
    expect(b.startScreenId).toBe('e2')
    expect(Object.keys(b.images)).toEqual(['a.png'])
    expect(b.document.pages[0]!.nodes).toHaveLength(2)
  })
  it('lit aussi un document .calque brut', () => {
    const b = parseBundle(serializeDocument(doc()))
    expect(b.projectName).toBe('Mon projet')
    expect(b.images).toEqual({})
  })
  it('refuse proprement : JSON illisible, format inconnu, version future, document invalide', () => {
    expect(() => parseBundle('pas du json')).toThrow(BundleError)
    expect(() => parseBundle('{"a":1}')).toThrow(/ni un export/)
    expect(() => parseBundle(JSON.stringify({ format: 'calque-figma', version: 9, document: {} }))).toThrow(/plus récente/)
    expect(() => parseBundle(JSON.stringify({ format: 'calque-figma', version: 1, document: { version: 3 } }))).toThrow(BundleError)
    expect(() => parseBundle('[1,2]')).toThrow(BundleError)
  })
})

describe('buildPlan : ecrans et formes', () => {
  it('un cadre Figma par ecran, a sa position', () => {
    const plan = buildPlan(bundleOf(doc()))
    expect(plan.screens.map((s) => [s.name, s.x, s.w, s.h, s.isScreen])).toEqual([['Accueil', 0, 393, 852, true], ['Détail', 500, 393, 852, true]])
  })
  it('rect / ellipse / ligne : remplissage, contour, rayon, opacite', () => {
    const plan = buildPlan(bundleOf(doc([
      { ...base, id: 'r', name: 'Carte', type: 'rect', frame: { x: 10, y: 20, w: 100, h: 50 }, fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 0.5 } }], strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 }], cornerRadius: 12, opacity: 0.8 },
      { ...base, id: 'e', name: 'Rond', type: 'ellipse', frame: { x: 0, y: 0, w: 30, h: 30 }, fills: [{ type: 'none' }], strokes: [] },
      { ...base, id: 'l', name: 'Trait', type: 'line', frame: { x: 0, y: 0, w: 100, h: 0 }, stroke: { color: { r: 0, g: 0, b: 1, a: 1 }, width: 3 } },
    ])))
    const [r, e, l] = kids(plan)
    expect(r).toMatchObject({ kind: 'rect', radius: 12, opacity: 0.8, fill: { r: 1, g: 0, b: 0, a: 0.5 }, stroke: { width: 2 } })
    expect(e).toMatchObject({ kind: 'ellipse', fill: null, stroke: null })
    expect(l).toMatchObject({ kind: 'line', stroke: { width: 3 } })
  })
  it('texte : police, graisse, taille, interligne, espacement, alignement ; polices a charger sans doublon', () => {
    const t = (id: string, w: number): Node => ({ ...base, id, name: id, type: 'text', frame: { x: 0, y: 0, w: 100, h: 20 }, characters: 'Salut', style: style({ fontWeight: w }) })
    const plan = buildPlan(bundleOf(doc([t('a', 600), t('b', 600), t('c', 400)])))
    expect(kids(plan)[0]).toMatchObject({ kind: 'text', text: 'Salut', fontFamily: 'Inter', fontWeight: 600, fontSize: 18, lineHeight: 22, letterSpacing: 1, align: 'CENTER' })
    expect(plan.fonts.filter((f) => f.family === 'Inter').map((f) => f.weight).sort()).toEqual([400, 600])
  })
  it('image : sources locales a charger, distantes signalees', () => {
    const img = (id: string, src: string): Node => ({ ...base, id, name: id, type: 'image', frame: { x: 0, y: 0, w: 50, h: 50 }, src, fit: 'contain' })
    const plan = buildPlan(bundleOf(doc([img('i1', 'logo.png'), img('i2', 'https://x.test/a.png'), img('i3', 'absent.png')]), { 'logo.png': { mime: 'image/png', data: 'AA==' } }))
    expect(plan.images).toEqual(['logo.png'])
    expect(kids(plan)[0]).toMatchObject({ kind: 'image', fit: 'FIT' })
    expect(plan.warnings.some((w) => w.includes('distante'))).toBe(true)
    expect(plan.warnings.some((w) => w.includes('absent.png'))).toBe(true)
  })
  it('noeud libre hors ecran : cree sur la page, avec avertissement', () => {
    const d = doc()
    d.pages[0]!.nodes.push({ ...base, id: 'x', name: 'Libre', type: 'rect', frame: { x: 0, y: 0, w: 5, h: 5 }, fills: [], strokes: [], cornerRadius: 0 })
    const plan = buildPlan(bundleOf(d))
    expect(plan.loose).toHaveLength(1)
    expect(plan.warnings.some((w) => w.includes('Libre'))).toBe(true)
  })
})

describe('rotation et auto-layout', () => {
  it('rotationTransform : identite sans rotation ; 90° autour du centre', () => {
    expect(rotationTransform(0, 0, 10, 10, 0)).toBeUndefined()
    const [[a, c, tx], [b, d, ty]] = rotationTransform(100, 100, 40, 20, 90)!
    expect([a, c, b, d].map((v) => Math.round(v))).toEqual([0, -1, 1, 0].map((v) => Math.round(v)))
    // le centre (120,110) reste le centre : image de (20,10) par la matrice + translation
    expect(Math.round(a * 20 + c * 10 + tx)).toBe(120)
    expect(Math.round(b * 20 + d * 10 + ty)).toBe(110)
  })
  const frame = (mode: 'row' | 'column' | 'absolute', alignMain: 'start' | 'center' | 'end' | 'space-between', alignCross: 'start' | 'center' | 'end' | 'stretch'): FrameNode => ({ ...createContainerNode('card', { x: 0, y: 0, w: 100, h: 100 }), container: undefined, layout: { mode, gap: 8, padding: { top: 1, right: 2, bottom: 3, left: 4 }, alignMain, alignCross } })
  it('row/column -> auto-layout Figma (espacement, marges, alignements)', () => {
    expect(autoLayoutOf(frame('row', 'center', 'end'))).toEqual({ mode: 'HORIZONTAL', gap: 8, padding: { top: 1, right: 2, bottom: 3, left: 4 }, primary: 'CENTER', counter: 'MAX', stretch: false })
    expect(autoLayoutOf(frame('column', 'start', 'stretch'))).toMatchObject({ mode: 'VERTICAL', primary: 'MIN', counter: 'MIN', stretch: true })
  })
  it('space-between ignore l espacement ; absolu et grille : pas d auto-layout', () => {
    expect(autoLayoutOf(frame('row', 'space-between', 'start'))).toMatchObject({ primary: 'SPACE_BETWEEN', gap: 0 })
    expect(autoLayoutOf(frame('absolute', 'start', 'start'))).toBeNull()
    expect(autoLayoutOf({ ...frame('row', 'start', 'start'), container: { kind: 'grid', columns: 2 } })).toBeNull()
  })
  it('un noeud pivote porte sa matrice', () => {
    const plan = buildPlan(bundleOf(doc([{ ...base, id: 'r', name: 'R', type: 'rect', rotation: 30, frame: { x: 10, y: 10, w: 50, h: 20 }, fills: [], strokes: [], cornerRadius: 0 }])))
    expect((kids(plan)[0] as { transform?: unknown }).transform).toBeDefined()
  })
})

describe('buildPlan : composants et variantes', () => {
  const btn = (id: string, label: string, over: Record<string, unknown> = {}, w = 200) => ({ ...createComponentNode('button', { x: 0, y: 0, w, h: 48 }, { label, ...over } as never), id })
  it('les boutons de meme apparence partagent un composant ; le libelle est un override', () => {
    const plan = buildPlan(bundleOf(doc([btn('b1', 'Valider'), btn('b2', 'Annuler')])))
    expect(plan.components).toHaveLength(1)
    expect(plan.components[0]).toMatchObject({ setName: 'Bouton', variantName: 'variante=primary, désactivé=non, icône=non' })
    const [i1, i2] = kids(plan)
    expect(i1).toMatchObject({ kind: 'instance', texts: { label: 'Valider' } })
    expect(i2).toMatchObject({ kind: 'instance', texts: { label: 'Annuler' } })
    expect((i1 as { componentKey: string }).componentKey).toBe((i2 as { componentKey: string }).componentKey)
  })
  it('chaque variante d apparence est une variante distincte du meme ensemble', () => {
    const plan = buildPlan(bundleOf(doc([btn('b1', 'A'), btn('b2', 'B', { variant: 'secondary' }), btn('b3', 'C', { disabled: true })])))
    expect(plan.components.map((c) => c.setName)).toEqual(['Bouton', 'Bouton', 'Bouton'])
    expect(new Set(plan.components.map((c) => c.variantName)).size).toBe(3)
  })
  it('des tailles differentes pour une meme apparence deviennent une propriete « taille »', () => {
    const plan = buildPlan(bundleOf(doc([btn('b1', 'A', {}, 200), btn('b2', 'B', {}, 120)])))
    expect(plan.components).toHaveLength(2)
    expect(plan.components.every((c) => c.variantName.includes('taille='))).toBe(true)
  })
  it('un composant sans variante est un composant simple (nom de l ensemble)', () => {
    const slider = { ...createComponentNode('slider', { x: 0, y: 0, w: 200, h: 40 }), id: 's' }
    const plan = buildPlan(bundleOf(doc([slider])))
    expect(plan.components[0]).toMatchObject({ setName: 'Curseur', variantName: '' })
  })
  it('les polices des composants sont ajoutees aux polices a charger', () => {
    const plan = buildPlan(bundleOf(doc([btn('b1', 'A')])))
    expect(plan.fonts.some((f) => f.family === 'Roboto' && f.weight === 500)).toBe(true)
  })
})

describe('weightStyleCandidates', () => {
  it('graisse -> noms de styles Figma, avec variantes d ecriture', () => {
    expect(weightStyleCandidates(400)[0]).toBe('Regular')
    expect(weightStyleCandidates(600)).toContain('Semi Bold')
    expect(weightStyleCandidates(700)[0]).toBe('Bold')
    expect(weightStyleCandidates(450)[0]).toBe('Medium')
  })
})
