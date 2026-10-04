import { describe, expect, it } from 'vitest'
import { createComponentNode, createDocument, createScreenNode, DEVICE_PRESETS } from '@calque/core'
import type { CalqueDocument, Node } from '@calque/core'
import { buildFigmaBundle } from '../src/figma/figma'
import { getExporter, listExporters } from '../src/registry'
import { svgExporter } from '../src/svg/svg'

const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

function doc(): CalqueDocument {
  const d = createDocument('Doc')
  const texte: Node = { ...base, id: 't', name: 'Titre <&>', type: 'text', frame: { x: 10, y: 20, w: 200, h: 40 }, characters: 'Salut <b>\nmonde', style: { fontFamily: 'Inter', fontSize: 20, fontWeight: 700, lineHeight: 24, letterSpacing: 0, color: { r: 1, g: 0, b: 0, a: 1 }, align: 'left' } }
  const rect: Node = { ...base, id: 'r', name: 'Carte', type: 'rect', frame: { x: 10, y: 80, w: 100, h: 60 }, fills: [{ type: 'solid', color: { r: 0, g: 0.5, b: 1, a: 1 } }], strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 }], cornerRadius: 8, opacity: 0.5 }
  const ell: Node = { ...base, id: 'e', name: 'Rond', type: 'ellipse', frame: { x: 120, y: 80, w: 40, h: 40 }, fills: [{ type: 'solid', color: { r: 0, g: 1, b: 0, a: 1 } }], strokes: [] }
  const img: Node = { ...base, id: 'i', name: 'Logo', type: 'image', frame: { x: 10, y: 150, w: 50, h: 50 }, src: 'logo.png', fit: 'cover' }
  const bouton = createComponentNode('button', { x: 10, y: 220, w: 200, h: 48 }, { label: 'Valider' })
  const e1 = { ...createScreenNode('Accueil', DEVICE_PRESETS.iphone15, { x: 0, y: 0, w: 393, h: 852 }, [texte, rect, ell, img, bouton]), id: 'e1' }
  const e2 = { ...createScreenNode('Détail', DEVICE_PRESETS.iphone15, { x: 500, y: 0, w: 393, h: 852 }, []), id: 'e2' }
  return { ...d, pages: [{ ...d.pages[0]!, nodes: [e1, e2] }] }
}

describe('export SVG', () => {
  const out = svgExporter.export(doc(), { projectName: 'demo', loadImage: (s) => (s === 'logo.png' ? PNG : null) })
  it('un fichier par ecran, a la taille de l appareil', () => {
    expect(out.files.map((f) => f.path)).toEqual(['svg/accueil.svg', 'svg/detail.svg'])
    expect(out.files[0]!.contents).toContain('width="393" height="852" viewBox="0 0 393 852"')
  })
  it('texte echappe, multi-ligne, style', () => {
    const svg = out.files[0]!.contents
    expect(svg).toContain('Salut &lt;b&gt;')
    expect(svg.match(/<text /g)!.length).toBeGreaterThanOrEqual(3) // 2 lignes + libelle du bouton
    expect(svg).toContain('font-size="20"')
    expect(svg).toContain('font-weight="700"')
    expect(svg).toContain('data-name="Titre &lt;&amp;&gt;"')
  })
  it('formes : rect (rayon, contour, opacite), ellipse', () => {
    const svg = out.files[0]!.contents
    expect(svg).toMatch(/<rect width="100" height="60" rx="8" fill="#0080ff" stroke="#000000" stroke-width="2"\/>/)
    expect(svg).toContain('opacity="0.5"')
    expect(svg).toContain('<ellipse cx="20" cy="20" rx="20" ry="20" fill="#00ff00"/>')
  })
  it('image embarquee en data URI, composant dessine par son croquis', () => {
    const svg = out.files[0]!.contents
    expect(svg).toContain('href="data:image/png;base64,')
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"')
    expect(svg).toContain('>Valider</text>')
  })
  it('image introuvable : cadre vide et avertissement', () => {
    const r = svgExporter.export(doc(), { projectName: 'demo' })
    expect(r.warnings.some((w) => w.includes('logo.png'))).toBe(true)
  })
  it('SVG bien forme (balises equilibrees)', () => {
    for (const f of out.files) {
      expect(f.contents.startsWith('<svg')).toBe(true)
      expect(f.contents.trim().endsWith('</svg>')).toBe(true)
      expect((f.contents.match(/<g /g) ?? []).length).toBe((f.contents.match(/<\/g>/g) ?? []).length)
    }
  })
})

describe('export Figma (bundle)', () => {
  it('embarque le document apres mise en page et les images en base64', () => {
    const { bundle, warnings } = buildFigmaBundle(doc(), { projectName: 'demo', loadImage: () => PNG })
    expect(bundle.format).toBe('calque-figma')
    expect(Object.keys(bundle.images)).toEqual(['logo.png'])
    expect(bundle.images['logo.png']!.mime).toBe('image/png')
    expect(warnings).toEqual([])
    expect(bundle.startScreenId).toBe('e1')
  })
  it('l exportateur ecrit un seul fichier .figma.json lisible', () => {
    const r = getExporter('figma').export(doc(), { projectName: 'Mon Projet', loadImage: () => PNG })
    expect(r.files).toHaveLength(1)
    expect(r.files[0]!.path).toBe('mon_projet.figma.json')
    expect(JSON.parse(r.files[0]!.contents).document.pages[0].nodes).toHaveLength(2)
  })
  it('les six cibles sont listees', () => {
    expect(listExporters().map((e) => e.id)).toEqual(['flutter', 'react-native', 'swiftui', 'compose', 'svg', 'figma'])
  })
})
