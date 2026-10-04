import { describe, expect, it } from 'vitest'
import { createComponentNode, createContainerNode, createDocument, createScreenNode, DEVICE_PRESETS } from '@calque/core'
import type { CalqueDocument, Node } from '@calque/core'
import { buildInFigma, loadFont } from '../src/builder'
import type { BuildReport } from '../src/builder'
import { buildPlan } from '../src/mapping'

// Faux Figma : enregistre ce qui est cree, sans aucun rendu.
type FakeNode = Record<string, unknown> & { type: string; children: FakeNode[]; parent?: FakeNode }
function fakeFigma(opts: { missingFonts?: string[] } = {}) {
  const loaded: string[] = []
  const hashes: Uint8Array[] = []
  const mk = (type: string, extra: Record<string, unknown> = {}): FakeNode => {
    const n: FakeNode = {
      type, children: [], name: type, x: 0, y: 0, width: 0, height: 0, characters: '', fontName: { family: 'Inter', style: 'Regular' },
      resize(w: number, h: number) { n['width'] = w; n['height'] = h },
      appendChild(c: FakeNode) { c.parent = n; n.children.push(c) },
      findOne(fn: (x: FakeNode) => boolean) {
        const walk = (x: FakeNode): FakeNode | null => { for (const c of x.children) { if (fn(c)) return c; const r = walk(c); if (r) return r } return null }
        return walk(n)
      },
      createInstance() {
        const inst = mk('INSTANCE', { mainComponent: n })
        inst['width'] = n['width']; inst['height'] = n['height']
        const copy = (src: FakeNode, dst: FakeNode) => src.children.forEach((c) => { const cc = mk(c.type, { ...c, children: [], parent: undefined }); dst.children.push(cc); copy(c, cc) })
        copy(n, inst)
        return inst
      },
      ...extra,
    }
    return n
  }
  const page = mk('PAGE', { selection: [] })
  const figma = {
    currentPage: page,
    createFrame: () => mk('FRAME', { layoutMode: 'NONE' }),
    createRectangle: () => mk('RECTANGLE'),
    createEllipse: () => mk('ELLIPSE'),
    createLine: () => mk('LINE'),
    createText: () => mk('TEXT'),
    createComponent: () => mk('COMPONENT'),
    combineAsVariants: (comps: FakeNode[], parent: FakeNode) => { const set = mk('COMPONENT_SET'); comps.forEach((c) => { parent.children = parent.children.filter((x) => x !== c); set.children.push(c) }); parent.children.push(set); return set },
    createImage: (b: Uint8Array) => { hashes.push(b); return { hash: `hash${hashes.length}` } },
    base64Decode: (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
    loadFontAsync: async (f: { family: string; style: string }) => {
      if (opts.missingFonts?.includes(`${f.family} ${f.style}`)) throw new Error('police absente')
      loaded.push(`${f.family} ${f.style}`)
    },
  }
  return { figma: figma as unknown as PluginAPI, page, loaded, hashes }
}

const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
function doc(children: Node[]): CalqueDocument {
  const d = createDocument('P')
  const e1 = { ...createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, children), id: 'e1' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [e1] }] }
}
const run = async (document: CalqueDocument, images = {}, opts = {}) => {
  const f = fakeFigma(opts)
  const bundle = { document, images, projectName: 'p', startScreenId: null }
  const out = await buildInFigma(f.figma, buildPlan(bundle), bundle)
  return { ...f, ...out }
}

describe('buildInFigma', () => {
  it('cree un cadre par ecran sur la page, a la bonne taille', async () => {
    const { page, screens, report } = await run(doc([]))
    expect(page.children.filter((c) => c.type === 'FRAME')).toHaveLength(1)
    expect(screens[0]).toMatchObject({ name: 'Accueil', width: 393, height: 852 })
    expect(report.screens).toBe(1)
  })
  it('texte : police chargee AVANT les caracteres, style applique', async () => {
    const { screens, loaded } = await run(doc([{ ...base, id: 't', name: 'Titre', type: 'text', frame: { x: 5, y: 6, w: 100, h: 30 }, characters: 'Salut', style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700, lineHeight: 24, letterSpacing: 0, color: { r: 1, g: 0, b: 0, a: 1 }, align: 'right' } }]))
    const t = (screens[0] as unknown as FakeNode).children[0]!
    expect(loaded).toContain('Inter Bold')
    expect(t).toMatchObject({ type: 'TEXT', characters: 'Salut', fontSize: 20, textAlignHorizontal: 'RIGHT', x: 5, y: 6, name: 'Titre' })
    expect(t['fontName']).toEqual({ family: 'Inter', style: 'Bold' })
    expect(t['fills']).toEqual([{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1 }])
  })
  it('police absente : repli sur un style voisin puis Inter, signale dans le rapport', async () => {
    const report: BuildReport = { screens: 0, nodes: 0, components: 0, componentSets: 0, images: 0, fontFallbacks: [], warnings: [] }
    const f = fakeFigma({ missingFonts: ['Zapfino Bold', 'Zapfino Regular', 'Zapfino Normal', 'Zapfino Book'] })
    const font = await loadFont(f.figma, 'Zapfino', 700, report)
    expect(font).toEqual({ family: 'Inter', style: 'Bold' })
    expect(report.fontFallbacks).toHaveLength(1)
  })
  it('formes : rect (rayon, contour), ellipse, ligne', async () => {
    const { screens } = await run(doc([
      { ...base, id: 'r', name: 'R', type: 'rect', frame: { x: 1, y: 2, w: 30, h: 40 }, fills: [{ type: 'solid', color: { r: 0, g: 1, b: 0, a: 1 } }], strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 }], cornerRadius: 6 },
      { ...base, id: 'e', name: 'E', type: 'ellipse', frame: { x: 0, y: 0, w: 20, h: 20 }, fills: [], strokes: [] },
      { ...base, id: 'l', name: 'L', type: 'line', frame: { x: 0, y: 0, w: 50, h: 0 }, stroke: { color: { r: 0, g: 0, b: 1, a: 1 }, width: 3 } },
    ]))
    const [r, e, l] = (screens[0] as unknown as FakeNode).children
    expect(r).toMatchObject({ type: 'RECTANGLE', cornerRadius: 6, strokeWeight: 2, x: 1, y: 2, width: 30, height: 40 })
    expect(e).toMatchObject({ type: 'ELLIPSE', width: 20 })
    expect(l).toMatchObject({ type: 'LINE', strokeWeight: 3 })
  })
  it('auto-layout : mode, espacement, marges, alignements et etirement des enfants', async () => {
    const card = { ...createContainerNode('card', { x: 0, y: 0, w: 200, h: 100 }), container: undefined, layout: { mode: 'column' as const, gap: 10, padding: { top: 1, right: 2, bottom: 3, left: 4 }, alignMain: 'space-between' as const, alignCross: 'stretch' as const }, children: [{ ...base, id: 'c', name: 'C', type: 'rect' as const, frame: { x: 0, y: 0, w: 10, h: 10 }, fills: [], strokes: [], cornerRadius: 0 }] }
    const { screens } = await run(doc([card]))
    const f = (screens[0] as unknown as FakeNode).children[0]!
    expect(f).toMatchObject({ layoutMode: 'VERTICAL', itemSpacing: 0, paddingTop: 1, paddingLeft: 4, primaryAxisAlignItems: 'SPACE_BETWEEN', counterAxisAlignItems: 'MIN' })
    expect(f.children[0]!['layoutAlign']).toBe('STRETCH')
  })
  it('image : octets decodes, remplissage image ; absente : cadre gris', async () => {
    const img = (id: string, src: string): Node => ({ ...base, id, name: id, type: 'image', frame: { x: 0, y: 0, w: 40, h: 40 }, src, fit: 'cover' })
    const { screens, hashes, report } = await run(doc([img('a', 'logo.png'), img('b', 'absent.png')]), { 'logo.png': { mime: 'image/png', data: btoa(String.fromCharCode(1, 2, 3)) } })
    const [a, b] = (screens[0] as unknown as FakeNode).children
    expect(Array.from(hashes[0]!)).toEqual([1, 2, 3])
    expect(a!['fills']).toEqual([{ type: 'IMAGE', imageHash: 'hash1', scaleMode: 'FILL' }])
    expect((b!['fills'] as { type: string }[])[0]!.type).toBe('SOLID')
    expect(report.images).toBe(1)
  })
  it('composants : un ensemble de variantes, des instances avec le texte surcharge', async () => {
    const btn = (id: string, label: string, over = {}) => ({ ...createComponentNode('button', { x: 10, y: 10, w: 200, h: 48 }, { label, ...over } as never), id })
    const { page, screens, report } = await run(doc([btn('b1', 'Valider'), btn('b2', 'Envoyer', { variant: 'secondary' })]))
    const set = page.children.find((c) => c.type === 'COMPONENT_SET')!
    expect(set['name']).toBe('Bouton')
    expect(set.children).toHaveLength(2)
    expect(set.children.map((c) => c['name'])).toContain('variante=primary, désactivé=non, icône=non')
    const insts = (screens[0] as unknown as FakeNode).children
    expect(insts.map((i) => i.type)).toEqual(['INSTANCE', 'INSTANCE'])
    expect(insts[0]!.children.find((c) => c.type === 'TEXT')!['characters']).toBe('Valider')
    expect(insts[1]!.children.find((c) => c.type === 'TEXT')!['characters']).toBe('Envoyer')
    expect(report).toMatchObject({ components: 2, componentSets: 1 })
  })
  it('un composant sans variante reste un composant simple', async () => {
    const slider = { ...createComponentNode('slider', { x: 0, y: 0, w: 200, h: 40 }), id: 's' }
    const { page } = await run(doc([slider]))
    expect(page.children.some((c) => c.type === 'COMPONENT_SET')).toBe(false)
    expect(page.children.find((c) => c.type === 'COMPONENT')!['name']).toBe('Curseur')
  })
  it('rotation : matrice de transformation posee sur le noeud', async () => {
    const { screens } = await run(doc([{ ...base, id: 'r', name: 'R', type: 'rect', rotation: 90, frame: { x: 100, y: 100, w: 40, h: 20 }, fills: [], strokes: [], cornerRadius: 0 }]))
    const t = (screens[0] as unknown as FakeNode).children[0]!['relativeTransform'] as number[][]
    expect(Math.round(t[0]![1]!)).toBe(-1)
  })
})
