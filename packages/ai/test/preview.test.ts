import { describe, expect, it } from 'vitest'
import { nodeSchema } from '@maquio/core'
import { previewScreen } from '../src/preview'

const device = { id: 'iphone', label: 'iPhone', width: 393, height: 852, pixelRatio: 3 }
const place = { x: 500, y: 0, w: 393, h: 852 }
const base = { visible: true, locked: false, opacity: 1, rotation: 0 }
const texte = (id: string) => ({
  ...base, id, name: id, type: 'text', frame: { x: 20, y: 80, w: 200, h: 22 }, characters: id,
  style: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 22, letterSpacing: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: 'left' },
})
const absolute = { mode: 'absolute', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' }
const ecranComplet = {
  node: {
    ...base, id: 'accueil', name: 'Écran Accueil', type: 'frame', frame: { x: 0, y: 0, w: 393, h: 852 }, layout: absolute,
    fills: [{ type: 'solid', color: { r: 0.96, g: 0.96, b: 0.97, a: 1 } }], strokes: [], cornerRadius: 0, clipsContent: true, device,
    children: [
      texte('titre'),
      { ...base, id: 'carte', name: 'Carte', type: 'frame', frame: { x: 20, y: 140, w: 353, h: 200 }, layout: absolute, fills: [], strokes: [], cornerRadius: 16, clipsContent: false, children: [texte('solde'), texte('montant')] },
      texte('pied'),
    ],
  },
}
const complet = JSON.stringify(ecranComplet)
const coupeApres = (marque: string) => complet.slice(0, complet.indexOf(marque) + marque.length)

describe('previewScreen', () => {
  it('rend rien tant que l ecran n a pas commence', () => {
    expect(previewScreen('je reflechis', 'accueil', place, device)).toBeNull()
  })

  it('montre l ecran, a sa place, avec seulement les elements termines', () => {
    const p = previewScreen(coupeApres('"id":"solde"'), 'accueil', place, device)!
    expect(p.id).toBe('accueil')
    expect(p.frame).toEqual(place)
    expect(p.device).toEqual(device)
    expect(p.children.map((c) => c.id)).toEqual(['titre', 'carte'])
    // La carte en cours d'ecriture s'affiche deja, sans son enfant incomplet.
    expect(p.children[1]!.type === 'frame' && p.children[1]!.children).toEqual([])
    expect(nodeSchema.safeParse(p).success).toBe(true)
  })

  it('fait apparaitre les enfants d un conteneur au fur et a mesure', () => {
    const p = previewScreen(coupeApres('"id":"montant"'), 'accueil', place, device)!
    const carte = p.children[1]!
    expect(carte.type === 'frame' && carte.children.map((c) => c.id)).toEqual(['solde'])
  })

  it('rend l ecran entier une fois termine', () => {
    const p = previewScreen(complet, 'accueil', place, device)!
    expect(p.children.map((c) => c.id)).toEqual(['titre', 'carte', 'pied'])
    expect(p.fills).toEqual(ecranComplet.node.fills)
  })
})
